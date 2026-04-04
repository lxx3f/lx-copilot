# Ghost Text Suggestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the popup suggestion widget with a CodeMirror 6 inline ghost text display, plus a small floating hint above the cursor showing "Tab 接受 · Esc 关闭".

**Architecture:** A `SuggestWidget` wrapper that creates a CM6 `ViewPlugin` to insert a widget `Decoration` at the cursor position (gray, non-selectable ghost text), and manages an absolutely-positioned HTML hint element that follows the cursor coordinates.

**Tech Stack:** TypeScript, Obsidian API, CodeMirror 6 (`@codemirror/view`, `@codemirror/state`)

---

### Task 1: Install CodeMirror 6 dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add devDependencies**

```bash
npm install --save-dev @codemirror/view @codemirror/state
```

- [ ] **Step 2: Verify installation**

Check that `node_modules/@codemirror/view` and `node_modules/@codemirror/state` exist.

```bash
ls node_modules/@codemirror/
```

Expected: directories `view` and `state` are listed.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add @codemirror/view and @codemirror/state for ghost text"
```

---

### Task 2: Rewrite SuggestWidget with ghost text

**Files:**
- Modify: `src/ui/suggest.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
import { Editor, EditorPosition } from "obsidian";
import { ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { EditorView } from "@codemirror/view";

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

export class SuggestWidget {
	private editor: Editor;
	private suggestion: string = "";
	private onAccept: (() => void) | null = null;
	private visible: boolean = false;
	private plugin: ViewPlugin<any> | null = null;
	private hintEl: HTMLElement | null = null;

	constructor(editor: Editor) {
		this.editor = editor;
	}

	show(suggestion: string, onAccept: () => void) {
		this.hide();
		this.suggestion = suggestion;
		this.onAccept = onAccept;
		this.visible = true;

		const view = this.getEditorView();
		if (!view) {
			console.error("[Copilot] Cannot get EditorView");
			this.visible = false;
			return;
		}

		const text = this.suggestion;
		this.plugin = ViewPlugin.fromClass(
			class {
				decorations: DecorationSet;
				constructor(view: EditorView) {
					this.decorations = this.buildDecorations(view);
				}
				update(update: ViewUpdate) {
					if (update.docChanged || update.selectionSet) {
						this.decorations = this.buildDecorations(update.view);
					}
				}
				buildDecorations(view: EditorView): DecorationSet {
					const head = view.state.selection.main.head;
					const deco = Decoration.widget({
						widget: new GhostTextWidget(text),
						side: 1,
					});
					return Decoration.set([deco.range(head)]);
				}
			},
			{
				decorations: (v) => v.decorations,
			}
		);

		view.dispatch({ effects: EditorView.appendConfig.of([this.plugin]) });
		this.showHint(view);
	}

	hide() {
		if (this.plugin) {
			const view = this.getEditorView();
			if (view) {
				view.dispatch({ effects: EditorView.reconfigure.of([]) });
			}
			this.plugin = null;
		}
		if (this.hintEl) {
			this.hintEl.remove();
			this.hintEl = null;
		}
		this.visible = false;
	}

	accept() {
		if (!this.visible) return;
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

	private getEditorView(): EditorView | null {
		const cm = (this.editor as unknown as CopilotEditor).cm;
		return cm || null;
	}

	private showHint(view: EditorView) {
		const head = view.state.selection.main.head;
		const coords = view.coordsAtPos(head);
		if (!coords) return;

		const hint = document.createElement("div");
		hint.className = "copilot-ghost-hint";
		hint.textContent = "Tab 接受 · Esc 关闭";
		document.body.appendChild(hint);

		// Position above the cursor
		const rect = hint.getBoundingClientRect();
		let top = coords.top - rect.height - 4;
		let left = coords.left;
		hint.style.position = "fixed";
		hint.style.top = `${top}px`;
		hint.style.left = `${left}px`;
		hint.style.zIndex = "9999";

		this.hintEl = hint;
	}
}
```

- [ ] **Step 2: Build to verify no type errors**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/suggest.ts
git commit -m "feat: replace popup widget with CM6 ghost text and floating hint"
```

---

### Task 3: Update styles for ghost text and hint

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append new styles**

Add to the end of `styles.css`:

```css
/* 幽灵文本内联显示 */
.copilot-ghost-text {
	color: var(--text-faint);
	pointer-events: none;
	user-select: none;
	opacity: 0.8;
}

/* 浮动操作提示 */
.copilot-ghost-hint {
	position: fixed;
	background-color: var(--background-primary-alt);
	color: var(--text-muted);
	font-size: var(--font-ui-smaller);
	padding: 2px 8px;
	border-radius: 4px;
	border: 1px solid var(--background-modifier-border);
	box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
	white-space: nowrap;
	pointer-events: none;
	z-index: 9999;
}
```

- [ ] **Step 2: Remove old popup-only CSS (optional)**

The `.copilot-suggestion` styles can stay for now — they won't hurt. If you prefer a clean stylesheet, remove lines 1-43 (the old popup styles).

- [ ] **Step 3: Build to verify**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add styles.css
git commit -m "style: add ghost text and floating hint styles"
```

---

### Task 4: Verify main.ts integration

**Files:**
- Read: `src/main.ts`

- [ ] **Step 1: Confirm no changes needed**

`main.ts` already calls `suggestWidget.show(...)`, `suggestWidget.accept()`, and `suggestWidget.hide()`. The API is unchanged.

However, check that `editor.replaceRange(suggestion, currentCursor)` in the `showSuggestion` callback is correct. Since we currently insert the ghost text **after** the cursor, `replaceRange` at the current cursor will insert exactly where it should. No change needed.

If you want to be extra safe, you can update the `showSuggestion` method to log when showing:

```typescript
private showSuggestion(
	editor: Editor,
	cursor: { line: number; ch: number },
	suggestion: string
) {
	if (!this.suggestWidget) {
		this.suggestWidget = new SuggestWidget(editor);
	}
	this.suggestWidget.show(suggestion, () => {
		const currentCursor = editor.getCursor();
		editor.replaceRange(suggestion, currentCursor);
	});
}
```

This should already match the current file. If it does, skip modification.

- [ ] **Step 2: Build and sanity check**

```bash
npm run build
```

Expected: build succeeds.

---

### Task 5: Local runtime test

**Files:**
- None (runtime verification)

- [ ] **Step 1: Run dev build**

```bash
npm run dev
```

- [ ] **Step 2: Test in Obsidian**

1. Open an Obsidian vault with the plugin symlinked.
2. Open a note and type something that triggers completion (e.g., inside a code block or after a math `$`).
3. **Expected behavior:**
   - Gray ghost text appears inline after the cursor.
   - A small hint "Tab 接受 · Esc 关闭" appears above the cursor.
   - Pressing `Tab` inserts the ghost text into the document.
   - Pressing `Esc` removes the ghost text and hint.
   - Continuing to type removes the ghost text and hint.

---

### Spec Coverage Checklist

| Spec Requirement | Task(s) |
|------------------|---------|
| Ghost text via CM6 ViewPlugin + Decoration.widget | Task 2 |
| Floating hint above cursor | Task 2 |
| Backward-compatible SuggestWidget API | Task 2, Task 4 |
| Add `@codemirror/view` and `@codemirror/state` | Task 1 |
| Update styles for ghost text and hint | Task 3 |
