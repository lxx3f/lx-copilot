import { App, Editor, MarkdownView, Modal, Notice, Plugin, TFile } from "obsidian";
import { CopilotSettingTab, DEFAULT_SETTINGS, CopilotSettings } from "./settings";
import { CompletionEngine } from "./completion";
import { SuggestWidget } from "./ui/suggest";

export default class CopilotPlugin extends Plugin {
	settings: CopilotSettings;
	completionEngine: CompletionEngine;
	suggestWidget: SuggestWidget | null = null;
	private debounceTimer: number | null = null;

	async onload() {
		console.log("[Copilot] Plugin loading...");
		await this.loadSettings();
		console.log("[Copilot] Settings loaded:", this.settings);

		this.completionEngine = new CompletionEngine(this.settings);
		console.log("[Copilot] Completion engine initialized");

		// 添加设置面板
		this.addSettingTab(new CopilotSettingTab(this.app, this));

		// 监听编辑器变化
		this.registerEvent(
			this.app.workspace.on("editor-change", (editor: Editor) => {
				console.log("[Copilot] Editor changed");
				this.handleEditorChange(editor);
			})
		);

		// 注册接受建议的命令
		this.addCommand({
			id: "accept-completion",
			name: "接受补全建议",
			hotkeys: [{ modifiers: [], key: "Tab" }],
			editorCallback: (editor: Editor) => {
				if (this.suggestWidget && this.suggestWidget.isVisible()) {
					this.suggestWidget.accept();
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

		console.log("Obsidian Copilot plugin loaded");
	}

	onunload() {
		if (this.debounceTimer) {
			window.clearTimeout(this.debounceTimer);
		}
		if (this.suggestWidget) {
			this.suggestWidget.destroy();
			this.suggestWidget = null;
		}
		console.log("Obsidian Copilot plugin unloaded");
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
		console.log("[Copilot] handleEditorChange called, enabled:", this.settings.enabled);
		if (!this.settings.enabled) {
			console.log("[Copilot] Plugin disabled, skipping");
			return;
		}

		// 清除之前的定时器
		if (this.debounceTimer) {
			window.clearTimeout(this.debounceTimer);
		}

		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		const beforeCursor = line.substring(0, cursor.ch);
		console.log("[Copilot] Before cursor:", beforeCursor);

		// 检查是否应该触发补全
		const shouldTrigger = this.shouldTriggerCompletion(beforeCursor);
		console.log("[Copilot] Should trigger:", shouldTrigger);
		if (!shouldTrigger) {
			if (this.suggestWidget) {
				this.suggestWidget.hide();
			}
			return;
		}

		console.log("[Copilot] Setting up completion timer, delay:", this.settings.debounceDelay);
		// 防抖处理
		this.debounceTimer = window.setTimeout(async () => {
			await this.requestCompletion(editor, cursor, beforeCursor);
		}, this.settings.debounceDelay);
	}

	private shouldTriggerCompletion(beforeCursor: string): boolean {
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
		if (beforeCursor.trim().length < this.settings.minTriggerLength) {
			return false;
		}

		return true;
	}

	private async requestCompletion(
		editor: Editor,
		cursor: { line: number; ch: number },
		beforeCursor: string
	) {
		console.log("[Copilot] Requesting completion...");
		try {
			const context = this.buildContext(editor, cursor);
			console.log("[Copilot] Context length:", context.length);
			const completion = await this.completionEngine.getCompletion(
				context,
				beforeCursor
			);
			console.log("[Copilot] Got completion:", completion);

			if (completion && completion.trim()) {
				console.log("[Copilot] Showing suggestion");
				this.showSuggestion(editor, cursor, completion);
			} else {
				console.log("[Copilot] Empty completion, not showing");
			}
		} catch (error) {
			console.error("[Copilot] Completion error:", error);
		}
	}

	private buildContext(
		editor: Editor,
		cursor: { line: number; ch: number }
	): string {
		// 获取前后文内容
		const lines = editor.getValue().split("\n");
		const contextLines = 10; // 前后各取10行

		const startLine = Math.max(0, cursor.line - contextLines);
		const endLine = Math.min(lines.length, cursor.line + contextLines);

		return lines.slice(startLine, endLine).join("\n");
	}

	private showSuggestion(
		editor: Editor,
		cursor: { line: number; ch: number },
		suggestion: string
	) {
		if (!this.suggestWidget) {
			this.suggestWidget = new SuggestWidget(editor);
		}

		this.suggestWidget.show(suggestion, () => {
			// 接受建议后的回调
			const currentCursor = editor.getCursor();
			editor.replaceRange(suggestion, currentCursor);
		});
	}
}
