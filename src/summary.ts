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

	private getConfig() {
		return this.settings.providerConfigs[this.settings.apiProvider];
	}

	private getEndpoint(): string {
		const { apiEndpoint } = this.getConfig();
		if (apiEndpoint) {
			return apiEndpoint.replace(/\/$/, "");
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
		if (!this.getConfig().apiKey && this.settings.apiProvider !== "ollama") {
			new Notice("请配置 API Key");
			throw new Error("No API key");
		}

		const response = await requestUrl({
			url: `${endpoint}/chat/completions`,
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${this.getConfig().apiKey}`,
			},
			body: JSON.stringify({
				model: this.getConfig().modelName,
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
