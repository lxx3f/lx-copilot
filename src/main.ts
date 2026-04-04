import { App, Editor, MarkdownView, Modal, Notice, Plugin, TFile } from "obsidian";
import { Compartment } from "@codemirror/state";
import { CopilotSettingTab, DEFAULT_SETTINGS, CopilotSettings } from "./settings";
import { CompletionEngine } from "./completion";
import { SuggestWidget } from "./ui/suggest";

export default class CopilotPlugin extends Plugin {
	settings: CopilotSettings;
	completionEngine: CompletionEngine;
	suggestWidget: SuggestWidget | null = null;
	private debounceTimer: number | null = null;
	private ignoreNextSelectionChange: boolean = false;
	copilotCompartment = new Compartment();

	async onload() {
		await this.loadSettings();
		this.completionEngine = new CompletionEngine(this.settings);

		// 注册 CodeMirror compartment 用于幽灵文本
		this.registerEditorExtension(this.copilotCompartment.of([]));

		// 添加设置面板
		this.addSettingTab(new CopilotSettingTab(this.app, this));

		// 监听编辑器变化
		this.registerEvent(
			this.app.workspace.on("editor-change", (editor: Editor) => {
				this.handleEditorChange(editor);
			})
		);

		// 光标/选择变化时隐藏建议（鼠标点击、方向键移动光标等）
		this.registerDomEvent(document, "selectionchange", () => {
			if (this.ignoreNextSelectionChange) {
				this.ignoreNextSelectionChange = false;
				return;
			}
			if (this.suggestWidget && this.suggestWidget.isVisible()) {
				this.suggestWidget.hide();
			}
		});

		// 切换标签页时隐藏建议
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				if (this.suggestWidget) {
					this.suggestWidget.hide();
				}
			})
		);

		// keydown 精确拦截：Tab 接受建议，导航键隐藏建议
		this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
			if (!this.suggestWidget || !this.suggestWidget.isVisible()) return;

			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!activeView || activeView.getMode() !== "source") return;

			if (evt.key === "Tab") {
				evt.preventDefault();
				this.ignoreNextSelectionChange = true;
				this.suggestWidget.accept();
				return;
			}

			const NAVIGATION_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];
			if (NAVIGATION_KEYS.includes(evt.key)) {
				this.suggestWidget.hide();
			}
		});

		// 注册接受建议的命令（供用户自定义热键，默认不绑定 Tab）
		this.addCommand({
			id: "accept-completion",
			name: "接受补全建议",
			editorCallback: (editor: Editor) => {
				if (this.suggestWidget && this.suggestWidget.isVisible()) {
					this.suggestWidget.accept();
					return true;
				}
				return false;
			},
		});

		// 注册下一个候选的命令
		this.addCommand({
			id: "next-completion",
			name: "下一个补全建议",
			hotkeys: [{ modifiers: ["Alt"], key: "]" }],
			editorCallback: (editor: Editor) => {
				if (this.suggestWidget && this.suggestWidget.isVisible()) {
					this.suggestWidget.next();
					return true;
				}
				return false;
			},
		});

		// 注册上一个候选的命令
		this.addCommand({
			id: "prev-completion",
			name: "上一个补全建议",
			hotkeys: [{ modifiers: ["Alt"], key: "[" }],
			editorCallback: (editor: Editor) => {
				if (this.suggestWidget && this.suggestWidget.isVisible()) {
					this.suggestWidget.prev();
					return true;
				}
				return false;
			},
		});

		// 注册拒绝建议的命令
		this.addCommand({
			id: "reject-completion",
			name: "拒绝补全建议",
			hotkeys: [{ modifiers: [], key: "Escape" }],
			editorCallback: (editor: Editor) => {
				if (this.suggestWidget && this.suggestWidget.isVisible()) {
					this.suggestWidget.hide();
					return true;
				}
				return false;
			},
		});
	}

	onunload() {
		if (this.debounceTimer) {
			window.clearTimeout(this.debounceTimer);
		}
		if (this.suggestWidget) {
			this.suggestWidget.destroy();
			this.suggestWidget = null;
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.completionEngine) {
			this.completionEngine.updateSettings(this.settings);
		}
	}

	private handleEditorChange(editor: Editor) {
		if (!this.settings.enabled) {
			return;
		}

		// 用户继续输入时，如果有可见建议先隐藏
		if (this.suggestWidget && this.suggestWidget.isVisible()) {
			this.suggestWidget.hide();
		}

		// 清除之前的定时器
		if (this.debounceTimer) {
			window.clearTimeout(this.debounceTimer);
		}

		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const beforeCursor = line.substring(0, cursor.ch);

		// 检查是否应该触发补全
		const shouldTrigger = this.shouldTriggerCompletion(editor, cursor, beforeCursor);
		if (!shouldTrigger) {
			if (this.suggestWidget) {
				this.suggestWidget.hide();
			}
			return;
		}

		// 防抖处理
		this.debounceTimer = window.setTimeout(async () => {
			await this.requestCompletion(editor, cursor, beforeCursor);
		}, this.settings.debounceDelay);
	}

	private shouldTriggerCompletion(
		editor: Editor,
		cursor: { line: number; ch: number },
		beforeCursor: string
	): boolean {
		// 检查是否在代码块中
		if (beforeCursor.includes("```") || beforeCursor.includes("`")) {
			return true;
		}

		// 检查是否在数学公式中
		if (beforeCursor.includes("$") || beforeCursor.includes("$$")) {
			return true;
		}

		// 检查是否触发关键词
		const triggerWords = ["function", "class", "const", "let", "var", "if", "for", "while"];
		if (triggerWords.some(word => beforeCursor.endsWith(word))) {
			return true;
		}

		// 检查最小长度
		if (beforeCursor.trim().length >= this.settings.minTriggerLength) {
			return true;
		}

		// 多行模式：即使当前行输入很短，只要上下文有足够内容也触发
		if (this.settings.completionMode === "multi-line") {
			const context = this.buildContext(editor, cursor);
			if (context.trim().length >= this.settings.minTriggerLength * 2) {
				return true;
			}
		}

		return false;
	}

	private async requestCompletion(
		editor: Editor,
		cursor: { line: number; ch: number },
		beforeCursor: string
	) {
		try {
			const context = this.buildContext(editor, cursor);
			const completions = await this.completionEngine.getCompletions(
				context,
				beforeCursor
			);

			if (completions.length > 0) {
				this.showSuggestion(editor, cursor, completions);
			}
		} catch (error) {
			console.error("[Copilot] Completion error:", error);
		}
	}

	private buildContext(
		editor: Editor,
		cursor: { line: number; ch: number }
	): string {
		const lines = editor.getValue().split("\n");
		const contextLines = this.settings.completionMode === "multi-line" ? 30 : 10;
		const startLine = Math.max(0, cursor.line - contextLines);
		const endLine = Math.min(lines.length, cursor.line + contextLines);
		return lines.slice(startLine, endLine).join("\n");
	}

	private showSuggestion(
		editor: Editor,
		cursor: { line: number; ch: number },
		candidates: string[]
	) {
		if (!this.suggestWidget) {
			this.suggestWidget = new SuggestWidget(editor, this.copilotCompartment);
		}

		this.suggestWidget.show(candidates, (suggestion: string) => {
			const currentCursor = editor.getCursor();
			editor.replaceRange(suggestion, currentCursor);

			// 将光标移动到插入文本的末尾
			const insertedLines = suggestion.split("\n");
			const newLine = currentCursor.line + insertedLines.length - 1;
			const newCh = insertedLines.length === 1
				? currentCursor.ch + suggestion.length
				: insertedLines[insertedLines.length - 1].length;
			editor.setCursor(newLine, newCh);
		});
	}
}
