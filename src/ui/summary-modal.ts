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
			"**摘要**：",
			`> ${this.result.summary}`,
			"",
			"**改进建议**：",
			...this.result.suggestions.map((s) => `- ${s}`),
		];

		const newContent = content.trimEnd() + "\n" + lines.join("\n") + "\n";
		await adapter.write(file.path, newContent);
		new Notice("已插入到笔记底部");
	}
}
