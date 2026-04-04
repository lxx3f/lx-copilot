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
		this.settings = settings;
	}

	updateSettings(settings: CopilotSettings) {
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
		try {
			const results = await this.requestCompletions(context, currentLine, this.settings.completionCount);
			return results;
		} catch (error: any) {
			// 如果请求多个候选失败，尝试降级到 1 个
			if (this.settings.completionCount > 1) {
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

		if (response.status !== 200) {
			console.error("[Copilot] API error:", response.text);
			// 某些 API 会返回 400 说明不支持 n>1，抛出让上层降级
			throw new Error(`API error: ${response.status}`);
		}

		const data = response.json as ChatCompletionResponse;
		const choices = data.choices || [];

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
5. 优先补全代码、公式和技术术语
6. 不要重复已输入的内容
7. 绝对禁止输出代码块包裹标记：如果上下文已经在代码块内部，不要输出 \`\`\`、\`\`\`python 或任何代码块起始/结束标记，只输出纯代码内容
8. 绝对禁止输出公式包裹标记：如果上下文已经在数学公式内部，不要输出 $ 或 $$ 包裹标记，只输出纯 LaTeX 表达式

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

		return `[上下文开始]
${context}
[上下文结束]

当前行（光标在末尾）：
${currentLine}

${instruction}`;
	}

	private postProcessCompletion(completion: string, currentLine: string): string {
		// 去除可能的重复
		let result = completion.trim();

		// 去除 AI 可能错误输出的代码块包裹标记
		if (result.startsWith("```")) {
			const firstNewline = result.indexOf("\n");
			if (firstNewline >= 0) {
				result = result.substring(firstNewline + 1);
			} else {
				result = result.substring(3);
			}
			// 如果末尾还有 ```，也去掉
			if (result.endsWith("```")) {
				result = result.substring(0, result.length - 3).trim();
			}
		}

		// 去除 AI 可能错误输出的公式包裹标记
		if (result.startsWith("$$")) {
			result = result.substring(2);
			if (result.endsWith("$$")) {
				result = result.substring(0, result.length - 2).trim();
			}
		} else if (result.startsWith("$")) {
			result = result.substring(1);
			if (result.endsWith("$")) {
				result = result.substring(0, result.length - 1).trim();
			}
		}

		// 如果补全以当前行结尾开头，去除重复部分
		if (currentLine.endsWith(result.substring(0, Math.min(result.length, 5)))) {
			for (let i = 1; i <= Math.min(result.length, currentLine.length); i++) {
				if (currentLine.endsWith(result.substring(0, i))) {
					result = result.substring(i);
				}
			}
		}

		// 单行模式：在第一个换行符处截断
		if (this.settings.completionMode === "single-line") {
			const newlineIndex = result.indexOf("\n");
			if (newlineIndex >= 0) {
				result = result.substring(0, newlineIndex);
			}
		}

		// 语义截断：超过最大长度时，优先在完整语义单元后截断
		const limit = this.settings.maxCompletionLength;
		if (result.length > limit) {
			result = this.smartTruncate(result, limit);
		}

		return result;
	}

	private smartTruncate(text: string, limit: number): string {
		const candidate = text.substring(0, limit);

		// 1. 优先截断到代码块结束（```）之前
		const codeBlockIndex = candidate.lastIndexOf("```");
		if (codeBlockIndex > limit * 0.5) {
			return candidate.substring(0, codeBlockIndex);
		}

		// 2. 优先截断到段落边界（双换行）
		const paraBreakIndex = candidate.lastIndexOf("\n\n");
		if (paraBreakIndex > limit * 0.6) {
			return candidate.substring(0, paraBreakIndex);
		}

		// 3. 优先截断到句子结束标点
		const sentenceMatch = candidate.match(/[。！？.!?][\s]*/g);
		if (sentenceMatch) {
			let lastIdx = -1;
			let pos = 0;
			for (const m of sentenceMatch) {
				const idx = candidate.indexOf(m, pos);
				if (idx >= 0) {
					lastIdx = idx + m.length;
					pos = lastIdx;
				}
			}
			if (lastIdx > limit * 0.6) {
				return candidate.substring(0, lastIdx);
			}
		}

		// 4. 优先截断到空格/换行
		const spaceIndex = candidate.lastIndexOf(" ");
		const newlineIndex = candidate.lastIndexOf("\n");
		const breakIndex = Math.max(spaceIndex, newlineIndex);
		if (breakIndex > limit * 0.7) {
			return candidate.substring(0, breakIndex);
		}

		// 5. 硬截断
		return candidate;
	}
}
