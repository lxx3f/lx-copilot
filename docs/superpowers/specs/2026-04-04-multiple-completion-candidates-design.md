# 多备选补全方案设计文档

## 目标

为 Obsidian Copilot 插件增加生成多个备选补全方案的能力，并允许用户在多个候选之间快速切换、接受。

## 架构

核心涉及三个模块的改动：

1. **`CompletionEngine`**（`src/completion.ts`）
   - 将 `getCompletion(context, currentLine)` 改为 `getCompletions(context, currentLine)`
   - 在 API 请求中传入 `n: count` 参数
   - 解析 `choices` 数组，对每条内容做后处理，返回 `string[]`
   - 若 API 不支持 `n > 1`，降级为重试 `n = 1` 的请求

2. **`SuggestWidget`**（`src/ui/suggest.ts`）
   - 内部维护 `candidates: string[]` 和 `currentIndex: number`
   - `show(candidates, onAccept)` 接收候选列表并渲染第一个
   - 新增 `next()` / `prev()` 方法，循环切换候选，同时更新幽灵文本和浮层提示
   - 浮层提示根据候选数量动态变化：单候选时不显示序号，多候选时显示 `1/3 Tab 接受 · Alt+] 下一个 · Alt+[ 上一个`

3. **`main.ts`**
   - 新增两个命令：`next-completion`（默认 `Alt+]`）和 `prev-completion`（默认 `Alt+[`）
   - 这两个命令在 `SuggestWidget` 可见时才生效
   - `accept-completion`（Tab）行为不变：接受当前候选

## 数据流

1. 用户输入 → `handleEditorChange` 触发
2. `requestCompletion` 调用 `getCompletions` 获取候选列表
3. `suggestWidget.show(candidates, callback)` 渲染第一个候选为幽灵文本
4. 用户按 `Alt+]` / `Alt+[` → `main.ts` 调用 `suggestWidget.next()` / `prev()`
5. 用户按 `Tab` → `suggestWidget.accept()` → 插入当前候选 → 光标移动到末尾
6. 用户按 `Esc` 或继续输入 → `suggestWidget.hide()` 清理

## 设置面板

在 `src/settings.ts` 中新增：

- `completionCount: number`（范围 1~5，默认 2）
- 设置界面使用 Slider 组件，标签为"候选数量"

该设置同时影响 API 请求的 `n` 参数和 SuggestWidget 的展示逻辑。

## 降级处理

部分 API 提供商（如 Azure 或某些国内厂商）不支持 `n > 1`。错误处理逻辑：

- 当 `n > 1` 请求失败，且错误信息包含不支持 multi-choice 的提示时
- 自动发起第二次请求，`n = 1`，确保补全功能仍可用
- 第二次请求失败则抛出错误，UI 显示 Notice

## 兼容性

- 与 single-line / multi-line 模式完全兼容
- `n` 参数和 `stop` 序列保持不变
- 现有 `accept` 和 `hide` 接口语义不变，不影响其他代码路径

## 快捷键

| 命令 | ID | 默认快捷键 | 说明 |
|------|----|-----------|------|
| 接受建议 | `accept-completion` | `Tab` | 接受当前候选 |
| 下一个候选 | `next-completion` | `Alt+]` | 切换到下一条 |
| 上一个候选 | `prev-completion` | `Alt+[` | 切换到上一条 |
| 拒绝建议 | `reject-completion` | `Esc` | 隐藏建议 |

以上快捷键均可在 Obsidian 设置中自定义。
