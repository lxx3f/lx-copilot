import { Editor, EditorPosition } from "obsidian";

// CodeMirror 编辑器接口
interface CodeMirrorEditor {
	containerEl?: HTMLElement;
	coordsAtPos?(pos: number): { left: number; top: number } | null;
	cm?: {
		coordsAtPos(pos: EditorPosition): { left: number; top: number } | null;
	};
}

export class SuggestWidget {
	private editor: Editor;
	private element: HTMLElement | null = null;
	private suggestion: string = "";
	private onAccept: (() => void) | null = null;
	private visible: boolean = false;

	constructor(editor: Editor) {
		this.editor = editor;
	}

	show(suggestion: string, onAccept: () => void) {
		this.suggestion = suggestion;
		this.onAccept = onAccept;

		// 隐藏之前的建议
		this.hide();

		// 创建建议元素
		this.createElement();

		// 定位到光标位置
		this.positionElement();

		this.visible = true;
	}

	hide() {
		if (this.element) {
			this.element.remove();
			this.element = null;
		}
		this.visible = false;
	}

	accept() {
		if (this.onAccept) {
			this.onAccept();
		}
		this.hide();
	}

	isVisible(): boolean {
		return this.visible;
	}

	destroy() {
		this.hide();
	}

	private createElement() {
		// 查找编辑器容器
		const editorEl = this.getEditorElement();
		if (!editorEl) return;

		this.element = document.createElement("div");
		this.element.className = "copilot-suggestion";
		this.element.innerHTML = `
			<span class="copilot-suggestion-text">${this.escapeHtml(
				this.suggestion
			)}</span>
			<span class="copilot-suggestion-hint">Tab 接受</span>
		`;

		editorEl.appendChild(this.element);
	}

	private getEditorElement(): HTMLElement | null {
		// 尝试获取 CodeMirror 容器
		const cmEditor = this.editor as unknown as CodeMirrorEditor;

		if (cmEditor.containerEl) {
			return cmEditor.containerEl;
		}

		// 备选方案：通过 DOM 查找
		const activeLeaf = document.querySelector(".workspace-leaf.mod-active");
		if (activeLeaf) {
			return activeLeaf.querySelector(".cm-editor") as HTMLElement ||
				   activeLeaf.querySelector(".markdown-source-view") as HTMLElement ||
				   activeLeaf.querySelector(".view-content") as HTMLElement;
		}

		return null;
	}

	private positionElement() {
		if (!this.element) return;

		// 获取光标位置
		const cursor = this.editor.getCursor();
		const line = cursor.line;
		const ch = cursor.ch;

		// 使用行元素定位
		const editorEl = this.getEditorElement();
		if (!editorEl) return;

		const lineElements = editorEl.querySelectorAll(".cm-line");
		if (lineElements.length <= line) return;

		const lineEl = lineElements[line] as HTMLElement;
		const lineRect = lineEl.getBoundingClientRect();
		const editorRect = editorEl.getBoundingClientRect();

		// 估算字符宽度并计算位置
		const charWidth = 8; // 近似字符宽度
		const left = ch * charWidth;
		const top = lineRect.height + 4; // 行下方

		this.element.style.position = "absolute";
		this.element.style.left = `${left}px`;
		this.element.style.top = `${top}px`;
		this.element.style.zIndex = "1000";
	}

	private escapeHtml(text: string): string {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}
