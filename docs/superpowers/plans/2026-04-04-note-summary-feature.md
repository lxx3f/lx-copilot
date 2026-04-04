# Note Summary Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an AI-powered note summary command that shows a modal with a concise summary and improvement suggestions, and allows inserting them at the bottom of the note.

**Architecture:** A new `SummaryEngine` builds a structured JSON prompt and calls the existing AI endpoint. A new `SummaryModal` renders the result. `main.ts` wires everything via a command-palette command.

**Tech Stack:** TypeScript, Obsidian API (`Modal`, `Notice`, `Plugin.addCommand`), `requestUrl`.

---

### Task 1: Create SummaryEngine

**Files:**
- Create: `src/summary.ts`
- Modify: none
- Test: none

- [ ] **Step 1: Write SummaryEngine**

```typescript
import { requestUrl, Notice } from "obsidian";
import { CopilotSettings } from "./settings";

export interface SummaryResult {
	summary: string;
	suggestions: string[];
}

export class SummaryEngine {
	private settings: CopilotSettings;

	constructor(settings: CopilotSettings) {
		this.settings = settings;
	}

	updateSettings(settings: CopilotSettings) {
		this.settings = settings;
	}

	private getEndpoint(): string {
		if (this.settings.apiEndpoint) {
			return this.settings.apiEndpoint.replace(/\/$/, "");
		}
		switch (this.settings.apiProvider) {
			case "openai":
				return "https://api.openai.com/v1";
			case "ollama":
				return "http://localhost:11434/v1";
			case "kimi":
				return "https://api.moonshot.cn/v1";
			case "deepseek":
				return "https://api.deepseek.com/v1";
			default:
				return "";
		}
	}

	async generateSummary(content: string): Promise<SummaryResult> {
		const endpoint = this.getEndpoint();
		if (!endpoint) {
			new Notice("请配置 API 端点");
			throw new Error("No API endpoint");
		}
		if (!this.settings.apiKey && this.settings.apiProvider !== "ollama") {
			new Notice("请配置 API Key");
			throw new Error("No API key");
		}

		const response = await requestUrl({
			url: `${endpoint}/chat/completions`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${this.settings.apiKey}`,
			},
			body: JSON.stringify({
				model: this.settings.modelName,
				messages: [
					{
						role: "system",
						content: this.getSystemPrompt(),
					},
					{
						role: "user",
						content: `请分析以下 Markdown 笔记：\n\n${content}`,
					},
				],
				temperature: Math.min(this.settings.temperature, 1.0),
				max_tokens: 800,
			}),
		});

		if (response.status !== 200) {
			throw new Error(`API error: ${response.status}`);
		}

		const data = response.json as { choices?: { message?: { content?: string } }[] };
		const raw = data.choices?.[0]?.message?.content ?? "";
		return this.parseResult(raw);
	}

	private getSystemPrompt(): string {
		return `你是一个专注于 Markdown 笔记的 AI 助手。请阅读用户提供的笔记，完成两项任务：
1. 用 1-3 句话给出核心内容摘要。
2. 给出 2-5 条具体的改进建议（如结构、补充内容、表达优化等）。

请严格使用以下 JSON 格式返回，不要包含任何解释或其他文本：
{
  "summary": "...",
  "suggestions": ["...", "..."]
}`;
	}

	private parseResult(raw: string): SummaryResult {
		try {
			// 提取 JSON 代码块（如果存在）
			const match = raw.match(/\{[\s\S]*\}/);
			const jsonStr = match ? match[0] : raw;
			const parsed = JSON.parse(jsonStr);
			return {
				summary: String(parsed.summary || "").trim(),
				suggestions: Array.isArray(parsed.suggestions)
					? parsed.suggestions.map((s: any) => String(s).trim()).filter(Boolean)
					: [],
			};
		} catch (e) {
			console.error("[Copilot] Failed to parse summary JSON:", raw);
			new Notice("AI 返回格式异常，无法解析摘要");
			throw new Error("Parse error");
		}
	}
}
```

- [ ] **Step 2: Ensure build passes**

Run: `npx tsc -noEmit -skipLibCheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/summary.ts
git commit -m "feat: add SummaryEngine for structured AI summary generation"
```

---

### Task 2: Create SummaryModal

**Files:**
- Create: `src/ui/summary-modal.ts`
- Modify: none
- Test: none

- [ ] **Step 1: Write SummaryModal**

```typescript
import { App, Modal, Notice, TFile } from "obsidian";
import { SummaryResult } from "../summary";

export class SummaryModal extends Modal {
	private result: SummaryResult;
	private file: TFile;

	constructor(app: App, result: SummaryResult, file: TFile) {
		super(app);
		this.result = result;
		this.file = file;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "AI 笔记摘要" });

		// 摘要区域
		const summaryBox = contentEl.createEl("div", { cls: "copilot-summary-box" });
		summaryBox.createEl("h3", { text: "摘要" });
		summaryBox.createEl("p", { text: this.result.summary });

		// 建议区域
		const suggestionBox = contentEl.createEl("div", { cls: "copilot-suggestion-box" });
		suggestionBox.createEl("h3", { text: "改进建议" });
		const ul = suggestionBox.createEl("ul");
		for (const item of this.result.suggestions) {
			ul.createEl("li", { text: item });
		}

		// 按钮区域
		const buttonContainer = contentEl.createEl("div", { cls: "copilot-summary-buttons" });

		buttonContainer.createEl("button", { text: "关闭" }, (btn) => {
			btn.onclick = () => this.close();
		});

		buttonContainer.createEl("button", { cls: "mod-cta", text: "插入到笔记底部" }, (btn) => {
			btn.onclick = async () => {
				await this.insertToBottom();
				this.close();
			};
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async insertToBottom() {
		const file = this.file;
		const adapter = this.app.vault.adapter;
		const content = await adapter.read(file.path);

		const lines = [
			"",
			"---",
			"",
			"## AI 摘要",
			"",
			`**> 摘要：**`,
			`> ${this.result.summary}`,
			"",
			"**> 改进建议：**",
			...this.result.suggestions.map((s) => `- ${s}`),
		];

		const newContent = content.trimEnd() + "\n" + lines.join("\n") + "\n";
		await adapter.write(file.path, newContent);
		new Notice("已插入到笔记底部");
	}
}
```

- [ ] **Step 2: Add CSS classes to styles.css**

Append to `styles.css`:

```css
.copilot-summary-box,
.copilot-suggestion-box {
	margin-bottom: 16px;
}

.copilot-summary-box h3,
.copilot-suggestion-box h3 {
	margin-bottom: 8px;
	font-size: var(--font-ui-medium);
}

.copilot-summary-box p {
	background-color: var(--background-primary-alt);
	padding: 12px;
	border-radius: 6px;
	line-height: 1.6;
}

.copilot-suggestion-box ul {
	padding-left: 20px;
	margin: 0;
}

.copilot-suggestion-box li {
	margin-bottom: 6px;
	line-height: 1.5;
}

.copilot-summary-buttons {
	display: flex;
	justify-content: flex-end;
	gap: 12px;
	margin-top: 20px;
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/ui/summary-modal.ts styles.css
git commit -m "feat: add SummaryModal and styles"
```

---

### Task 3: Wire command in main.ts

**Files:**
- Modify: `src/main.ts`
- Create: none
- Test: none

- [ ] **Step 1: Import and instantiate SummaryEngine**

Add imports at the top of `src/main.ts`:

```typescript
import { SummaryEngine } from "./summary";
import { SummaryModal } from "./ui/summary-modal";
```

Inside `CopilotPlugin` class, add:

```typescript
	summaryEngine: SummaryEngine;
```

Inside `onload()`, after `completionEngine` init:

```typescript
		this.summaryEngine = new SummaryEngine(this.settings);
```

Inside `saveSettings()`, after `completionEngine` update:

```typescript
		if (this.summaryEngine) {
			this.summaryEngine.updateSettings(this.settings);
		}
```

- [ ] **Step 2: Register generate-summary command**

Inside `onload()`, after the reject-completion command:

```typescript
		this.addCommand({
			id: "generate-summary",
			name: "生成笔记摘要",
			callback: async () => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") {
					new Notice("请先打开一个 Markdown 笔记");
					return;
				}

				const content = await this.app.vault.adapter.read(file.path);
				if (!content.trim()) {
					new Notice("当前笔记内容为空，无需摘要");
					return;
				}

				try {
					const result = await this.summaryEngine.generateSummary(content);
					new SummaryModal(this.app, result, file).open();
				} catch (error: any) {
					console.error("[Copilot] Summary error:", error);
					new Notice(`摘要生成失败: ${error?.message || "未知错误"}`);
				}
			},
		});
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: register generate-summary command in main.ts"
```

---

### Task 4: Test end-to-end

**Files:**
- All
- Test: manual in Obsidian

- [ ] **Step 1: Deploy to test vault**

```bash
npm run deploy
```

- [ ] **Step 2: Manual test checklist**

1. Open a Markdown note in Obsidian.
2. Open command palette (<Ctrl/Cmd>+P) and run `Copilot: 生成笔记摘要`.
3. Wait for API response.
4. **Expected:** a modal appears with:
   - A "摘要" section containing a short summary paragraph.
   - An "改进建议" section containing a bullet list.
   - "关闭" and "插入到笔记底部" buttons.
5. Click "关闭". Expected: modal closes, note unchanged.
6. Re-run the command, then click "插入到笔记底部". Expected: modal closes and formatted summary block is appended to the note.

---

### Spec Coverage Checklist

| Spec Requirement | Task(s) |
|------------------|---------|
| SummaryEngine builds JSON prompt and parses result | Task 1 |
| SummaryModal shows summary + suggestions + two buttons | Task 2 |
| Insert-to-bottom formats and appends Markdown | Task 2 |
| Command registered in main.ts, reads active note | Task 3 |
| Error handling for no file / empty content / API failures | Task 3 |
| Manual end-to-end test | Task 4 |
