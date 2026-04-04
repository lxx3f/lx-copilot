import { Editor } from "obsidian";
import { ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType, keymap } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { Compartment } from "@codemirror/state";

interface CopilotEditor {
	cm?: EditorView;
}

class GhostTextWidget extends WidgetType {
	constructor(private text: string) {
		super();
	}

	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = "copilot-ghost-text";
		span.textContent = this.text;
		span.setAttribute("aria-hidden", "true");
		return span;
	}

	eq(other: GhostTextWidget): boolean {
		return this.text === other.text;
	}
}

function createGhostTextPlugin(text: string, anchorPos: number) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}
			update(update: ViewUpdate) {
				// 只在文档内容变化时重建，避免跟随光标移动
				if (update.docChanged) {
					this.decorations = this.buildDecorations(update.view);
				}
			}
			buildDecorations(view: EditorView): DecorationSet {
				const deco = Decoration.widget({
					widget: new GhostTextWidget(text),
					side: 1,
				});
				return Decoration.set([deco.range(anchorPos)]);
			}
		},
		{
			decorations: (v) => v.decorations,
		}
	);
}

export class SuggestWidget {
	private candidates: string[] = [];
	private currentIndex: number = 0;
	private onAccept: ((text: string) => void) | null = null;
	private visible: boolean = false;
	private hintEl: HTMLElement | null = null;
	private anchorPos: number = 0;

	constructor(private editor: Editor, private compartment: Compartment) {}

	show(candidates: string[], onAccept: (text: string) => void) {
		this.hide();
		if (!candidates.length) return;
		this.candidates = candidates;
		this.currentIndex = 0;
		this.onAccept = onAccept;
		this.visible = true;

		const view = this.getEditorView();
		if (!view) {
			console.error("[Copilot] Cannot get EditorView");
			this.visible = false;
			return;
		}

		this.anchorPos = view.state.selection.main.head;
		this.render(view);
	}

	hide() {
		const view = this.getEditorView();
		if (view) {
			view.dispatch({ effects: this.compartment.reconfigure([]) });
		}
		if (this.hintEl) {
			this.hintEl.remove();
			this.hintEl = null;
		}
		this.visible = false;
		this.candidates = [];
		this.currentIndex = 0;
	}

	accept() {
		if (!this.visible || !this.candidates.length) return;
		const suggestion = this.candidates[this.currentIndex];
		if (this.onAccept) {
			this.onAccept(suggestion);
		}
		this.hide();
	}

	next() {
		if (!this.visible || this.candidates.length <= 1) return;
		this.currentIndex = (this.currentIndex + 1) % this.candidates.length;
		this.refresh();
	}

	prev() {
		if (!this.visible || this.candidates.length <= 1) return;
		this.currentIndex = (this.currentIndex - 1 + this.candidates.length) % this.candidates.length;
		this.refresh();
	}

	isVisible(): boolean {
		return this.visible;
	}

	destroy() {
		this.hide();
	}

	private refresh() {
		const view = this.getEditorView();
		if (!view) return;
		this.render(view);
	}

	private render(view: EditorView) {
		const suggestion = this.candidates[this.currentIndex];
		const plugin = createGhostTextPlugin(suggestion, this.anchorPos);
		const tabKeymap = keymap.of([
			{
				key: "Tab",
				run: () => {
					this.accept();
					return true;
				},
			},
		]);
		view.dispatch({ effects: this.compartment.reconfigure([plugin, tabKeymap]) });
		this.showHint(view);
	}

	private getEditorView(): EditorView | null {
		const cm = (this.editor as unknown as CopilotEditor).cm;
		return cm || null;
	}

	private showHint(view: EditorView) {
		if (this.hintEl) {
			this.hintEl.remove();
			this.hintEl = null;
		}

		const head = view.state.selection.main.head;
		const coords = view.coordsAtPos(head);
		if (!coords) return;

		const total = this.candidates.length;
		const index = this.currentIndex + 1;
		const hasMultiple = total > 1;
		const hintText = hasMultiple
			? `${index}/${total} Tab 接受 · Alt+] 下一个 · Alt+[ 上一个 · Esc 关闭`
			: "Tab 接受 · Esc 关闭";

		const hint = document.createElement("div");
		hint.className = "copilot-ghost-hint";
		hint.textContent = hintText;
		document.body.appendChild(hint);

		const rect = hint.getBoundingClientRect();
		const top = coords.top - rect.height - 4;
		const left = coords.left;
		hint.style.position = "fixed";
		hint.style.top = `${top}px`;
		hint.style.left = `${left}px`;
		hint.style.zIndex = "9999";

		this.hintEl = hint;
	}
}
