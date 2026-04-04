# Note Summary 功能设计文档

## 目标

为 Obsidian Copilot 插件增加 AI 驱动的笔记摘要功能。用户可以通过命令面板对当前打开的 Markdown 文档生成核心摘要和改进建议，并在弹窗中查看或一键插入到笔记底部。

## 架构

新增两个核心组件：

1. **`SummaryEngine`**（`src/summary.ts`）
   - 接收当前笔记全文内容
   - 构建结构化 Prompt，要求 AI 返回 JSON 格式的摘要和建议
   - 调用现有的 OpenAI 兼容 API 获取结果
   - 解析并返回 `{ summary: string; suggestions: string[] }`

2. **`SummaryModal`**（`src/ui/summary-modal.ts`）
   - 继承 Obsidian 的 `Modal`
   - 上半区显示摘要，下半区显示改进建议列表
   - 底部提供"关闭"和"插入到笔记底部"两个按钮

`main.ts` 注册新命令 `生成笔记摘要`，负责串联全文读取 → `SummaryEngine` → `SummaryModal` 展示。

## Prompt 设计

```
请阅读下面的 Markdown 笔记，完成两项任务：
1. 用 1-3 句话给出核心内容摘要。
2. 给出 2-5 条具体的改进建议（如结构、补充、表达等方面）。

请严格使用以下 JSON 格式返回，不要包含任何解释或其他文本：
{
  "summary": "...",
  "suggestions": ["...", "..."]
}

---

[笔记内容]
```

## 数据流

1. 用户执行命令 `生成笔记摘要`
2. `main.ts` 检查当前活跃文件，读取完整内容
3. 内容传给 `SummaryEngine.generateSummary(content)`
4. `SummaryEngine` 调用 API，解析返回的 JSON
5. `new SummaryModal(app, result).open()` 弹出结果
6. 用户点击"插入到笔记底部" → 格式化 Markdown 块并追加到文档末尾

## 弹窗 UI 结构

```
┌─────────────────────────────┐
│  AI 笔记摘要                   │
├─────────────────────────────┤
│  [摘要区域]                   │
│  简要描述笔记核心内容...        │
├─────────────────────────────┤
│  [改进建议]                   │
│  • 建议 1                     │
│  • 建议 2                     │
│  • 建议 3                     │
├─────────────────────────────┤
│  [关闭]    [插入到笔记底部]    │
└─────────────────────────────┘
```

## 插入格式

点击"插入到笔记底部"后，追加以下内容到文档末尾：

```markdown
---

## AI 摘要

**摘要**：
> {summary}

**改进建议**：
- {suggestion 1}
- {suggestion 2}
- ...
```

## 错误处理

- 当前没有打开文件：`Notice("请先打开一个 Markdown 笔记")`
- 文件内容为空：`Notice("当前笔记内容为空，无需摘要")`
- API 返回非 JSON 或解析失败：显示友好的错误信息在弹窗中
- API 请求失败：`Notice("摘要生成失败: ${error.message}")`

## 设置

复用现有 API 配置（`apiProvider`、`apiEndpoint`、`apiKey`、`modelName`、`temperature`），不新增独立设置项。
