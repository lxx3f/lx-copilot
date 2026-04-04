import { requestUrl, Notice } from "obsidian";
import { CopilotSettings } from "./settings";

// API 响应类型
interface ChatCompletionResponse {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
	error?: {
		message: string;
	};
}

export class CompletionEngine {
	private settings: CopilotSettings;

	constructor(settings: CopilotSettings) {
		console.log("[Copilot] CompletionEngine constructor, provider:", settings.apiProvider);
		this.settings = settings;
	}

	updateSettings(settings: CopilotSettings) {
		console.log("[Copilot] Updating settings, provider:", settings.apiProvider);
		this.settings = settings;
	}

	private getEndpoint(): string {
		const { apiProvider, apiEndpoint } = this.settings;

		if (apiEndpoint) {
			return apiEndpoint.replace(/\/$/, ""); // 移除末尾斜杠
		}

		switch (apiProvider) {
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

	async getCompletions(context: string, currentLine: string): Promise<string[]> {
		console.log("[Copilot] getCompletions called");
		try {
			const results = await this.requestCompletions(context, currentLine, this.settings.completionCount);
			return results;
		} catch (error: any) {
			// 如果请求多个候选失败，尝试降级到 1 个
			if (this.settings.completionCount > 1) {
				console.warn("[Copilot] Multi-choice request failed, falling back to n=1");
				try {
					const results = await this.requestCompletions(context, currentLine, 1);
					return results;
				} catch (fallbackError: any) {
					console.error("[Copilot] Fallback request failed:", fallbackError?.message || fallbackError);
					new Notice(`API 请求失败: ${fallbackError?.message || "未知错误"}`);
					throw fallbackError;
				}
			}
			console.error("[Copilot] Completion API error:", error?.message || error);
			new Notice(`API 请求失败: ${error?.message || "未知错误"}`);
			throw error;
		}
	}

	private async requestCompletions(context: string, currentLine: string, count: number): Promise<string[]> {
		const isMultiLine = this.settings.completionMode === "multi-line";

		const endpoint = this.getEndpoint();
		if (!endpoint) {
			console.error("[Copilot] No API endpoint configured");
			new Notice("请配置 API 端点");
			return [];
		}

		if (!this.settings.apiKey && this.settings.apiProvider !== "ollama") {
			console.error("[Copilot] No API key configured");
			new Notice("请配置 API Key");
			return [];
		}

		const prompt = this.buildPrompt(context, currentLine);
		console.log("[Copilot] Sending request to API, model:", this.settings.modelName, "n:", count);

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
						content: prompt,
					},
				],
				temperature: this.settings.temperature,
				max_tokens: this.settings.maxCompletionLength,
				n: count,
				stop: isMultiLine ? ["```\n\n"] : ["\n\n", "```\n\n"],
			}),
		});

		console.log("[Copilot] Response status:", response.status);

		if (response.status !== 200) {
			console.error("[Copilot] API error:", response.text);
			// 某些 API 会返回 400 说明不支持 n>1，抛出让上层降级
			throw new Error(`API error: ${response.status}`);
		}

		const data = response.json as ChatCompletionResponse;
		const choices = data.choices || [];
		console.log("[Copilot] API response received, choices:", choices.length);

		const results: string[] = [];
		for (const choice of choices) {
			const content = choice.message?.content;
			if (content) {
				const result = this.postProcessCompletion(content, currentLine);
				if (result && !results.includes(result)) {
					results.push(result);
				}
			}
		}

		return results;
	}

	private getSystemPrompt(): string {
		const isMultiLine = this.settings.completionMode === "multi-line";
		const scopeRule = isMultiLine
			? "根据上下文和光标位置，补全后续的一个代码块、段落或多个语句，可以包含多行"
			: "只补全当前行或代码片段的剩余部分，不要重复已输入的内容";

		return `你是一个专注于 Markdown 笔记的 AI 助手。你的任务是根据上下文提供智能补全建议。

规则：
1. ${scopeRule}
2. 在代码块中（\`\`\`），补全代码逻辑
3. 在数学公式中（$ 或 $$），补全 LaTeX 表达式
4. 保持简洁，一次只补全一个概念或语句
5. 使用 Markdown 语法
6. 优先补全代码、公式和技术术语
7. 不要重复已输入的内容

示例：
- 输入：\`const fib = (n) =>\` → 补全：\` => { if (n <= 1) return n; return fib(n-1) + fib(n-2); }\`
- 输入：\`$E = mc^\` → 补全：\`2$\`
- 输入：\`## 快速排序\` → 补全：\`算法\`

只返回补全内容，不要包含解释或其他文本。`;
	}

	private buildPrompt(context: string, currentLine: string): string {
		const isMultiLine = this.settings.completionMode === "multi-line";
		const instruction = isMultiLine
			? "请根据上下文补全后续内容（可以包含多行，只返回补全内容，不要重复已输入的部分）："
			: "请补全当前行的剩余部分（只返回补全内容，不要重复已输入的部分）：";

		return `上下文：
\`\`\`
${context}
\`\`\`

当前行（光标在末尾）：
\`\`\`
${currentLine}
\`\`\`

${instruction}`;
	}

	private postProcessCompletion(completion: string, currentLine: string): string {
		// 去除可能的重复
		let result = completion.trim();

		// 如果补全以当前行结尾开头，去除重复部分
		if (currentLine.endsWith(result.substring(0, Math.min(result.length, 5)))) {
			// 简单去重逻辑，可能需要更复杂的处理
			for (let i = 1; i <= Math.min(result.length, currentLine.length); i++) {
				if (currentLine.endsWith(result.substring(0, i))) {
					result = result.substring(i);
				}
			}
		}

		// 限制长度
		if (result.length > this.settings.maxCompletionLength) {
			result = result.substring(0, this.settings.maxCompletionLength);
		}

		return result;
	}
}
