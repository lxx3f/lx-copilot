# Ghost Text Suggestion 设计方案

## 目标

将补全建议从弹窗切换为 CodeMirror 6 内联幽灵文本（ghost text），并在光标上方显示一个微型操作浮层。

## 架构

采用双层渲染：

1. **幽灵文本层** — 使用 CM6 `ViewPlugin` 和 `Decoration.widget` 在光标后插入不可编辑的灰色文本。
2. **操作提示浮层** — 一个绝对定位的 HTML div，跟随光标上方显示 "Tab 接受 · Esc 关闭"。

## 组件

### `SuggestWidget`

接口保持向后兼容：

- `show(suggestion, onAccept)` — 创建 CM6 视图插件，插入幽灵文本，并渲染提示浮层。
- `hide()` — 卸载视图插件，移除浮层。
- `accept()` — 触发 `onAccept` 回调，且只负责调用 `hide()`（避免重复插入）。
- `isVisible()` / `destroy()` — 保持不变。

### CM6 视图插件（内部）

- 监听 `editorView.state.selection` 的主光标位置。
- 在该位置插入 `Decoration.widget`，内容为 `span.copilot-ghost-text`。
- 使用 `EditorView.decorations` 提供 decorations。
- 为了确保不重复插入和正确清理，`ViewPlugin` 的生命周期由 `SuggestWidget` 控制。

### 提示浮层（内部）

- 使用 `editorView.coordsAtPos(mainHead)` 获取光标屏幕坐标。
- 计算顶部 `top - lineHeight` 的位置，左侧对齐光标左侧。
- 创建 `div.copilot-ghost-hint`，内容为 "Tab 接受 · Esc 关闭"。
- 当窗口滚动或编辑器滚动时，需要重新定位（通过 `requestAnimationFrame` 或再次计算）。

## 数据流

1. `main.ts` 调用 `suggestWidget.show(completion, callback)`
2. `SuggestWidget` 获取底层 CodeMirror `EditorView`，构造内部 `ViewPlugin`，插入幽灵文本
3. 同时计算光标坐标，创建并定位提示浮层
4. 用户按 Tab → `main.ts` 的 command 调用 `suggestWidget.accept()` → 触发 callback → `editor.replaceRange()` 插入补全 → `hide()` 清理
5. 用户按 Esc → `hide()` 清理
6. 用户继续输入 → `editor-change` 事件逻辑里应调用现有 `suggestWidget.hide()` 清理

## 依赖

新增 `devDependencies`：

- `@codemirror/view`
- `@codemirror/state`

Obsidian 运行时已经包含这些包，安装仅用于 TypeScript 类型和构建时 CM6 装饰器 API 访问。

## 错误处理

- 如果无法获取 CodeMirror `EditorView`，优雅回退到旧弹窗或直接隐藏。
- 如果 `coordsAtPos` 返回 `null`，提示浮层不渲染（幽灵文本仍然显示）。
- 滚动时提示浮层位置可能短暂偏移，可接受。

## 样式

- `.copilot-ghost-text`：使用 `var(--text-faint)`，透明选择背景（`user-select: none`）。
- `.copilot-ghost-hint`：更小字号、圆角、深色半透明背景、白色文字，类似 Obsidian 的 UI 提示条。
