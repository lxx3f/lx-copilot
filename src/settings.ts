import { App, PluginSettingTab, Setting } from "obsidian";
import CopilotPlugin from "./main";

export type ApiProvider = "openai" | "azure" | "ollama" | "kimi" | "deepseek" | "custom";
export type CompletionMode = "single-line" | "multi-line";

export interface CopilotSettings {
	enabled: boolean;
	apiProvider: ApiProvider;
	completionMode: CompletionMode;
	apiKey: string;
	apiEndpoint: string;
	modelName: string;
	debounceDelay: number;
	minTriggerLength: number;
	maxCompletionLength: number;
	completionCount: number;
	temperature: number;
}

// 各提供商的默认配置
export const PROVIDER_DEFAULTS: Record<
	Exclude<ApiProvider, "custom">,
	{ endpoint: string; model: string }
> = {
	openai: {
		endpoint: "https://api.openai.com/v1",
		model: "gpt-3.5-turbo",
	},
	azure: {
		endpoint: "",
		model: "gpt-35-turbo",
	},
	ollama: {
		endpoint: "http://localhost:11434/v1",
		model: "llama2",
	},
	kimi: {
		endpoint: "https://api.moonshot.cn/v1",
		model: "moonshot-v1-8k",
	},
	deepseek: {
		endpoint: "https://api.deepseek.com/v1",
		model: "deepseek-coder",
	},
};

export const DEFAULT_SETTINGS: CopilotSettings = {
	enabled: true,
	apiProvider: "openai",
	completionMode: "single-line",
	apiKey: "",
	apiEndpoint: "",
	modelName: "gpt-3.5-turbo",
	debounceDelay: 500,
	minTriggerLength: 3,
	maxCompletionLength: 100,
	completionCount: 2,
	temperature: 0.7,
};

export class CopilotSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Obsidian Copilot 设置" });

		// 启用/禁用插件
		new Setting(containerEl)
			.setName("启用补全")
			.setDesc("开启 AI 自动补全功能")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enabled)
					.onChange(async (value) => {
						this.plugin.settings.enabled = value;
						await this.plugin.saveSettings();
					})
			);

		// API 提供商选择
		new Setting(containerEl)
			.setName("API 提供商")
			.setDesc("选择 AI 服务提供商")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openai", "OpenAI")
					.addOption("azure", "Azure OpenAI")
					.addOption("ollama", "Ollama (本地)")
					.addOption("kimi", "Kimi (月之暗面)")
					.addOption("deepseek", "DeepSeek")
					.addOption("custom", "自定义 API")
					.setValue(this.plugin.settings.apiProvider)
					.onChange(async (value) => {
						const newProvider = value as ApiProvider;
						this.plugin.settings.apiProvider = newProvider;

						// 自动填充默认端点和模型
						if (newProvider !== "custom") {
							const defaults = PROVIDER_DEFAULTS[newProvider];
							this.plugin.settings.apiEndpoint = defaults.endpoint;
							this.plugin.settings.modelName = defaults.model;
						}

						await this.plugin.saveSettings();
						this.display(); // 重新渲染以显示/隐藏相关设置
					})
			);

		// API Key（仅非本地模型需要）
		const noKeyProviders: ApiProvider[] = ["ollama"];
		if (!noKeyProviders.includes(this.plugin.settings.apiProvider)) {
			new Setting(containerEl)
				.setName("API Key")
				.setDesc("你的 API 密钥（不会离开本设备）")
				.addText((text) =>
					text
						.setPlaceholder("sk-...")
						.setValue(this.plugin.settings.apiKey)
						.onChange(async (value) => {
							this.plugin.settings.apiKey = value;
							await this.plugin.saveSettings();
						})
				);
		}

		// API Endpoint
		const providerNames: Record<ApiProvider, string> = {
			openai: "OpenAI",
			azure: "Azure",
			ollama: "Ollama",
			kimi: "Kimi",
			deepseek: "DeepSeek",
			custom: "自定义 API",
		};

		const providerName = providerNames[this.plugin.settings.apiProvider];
		const defaultEndpoint =
			this.plugin.settings.apiProvider === "custom"
				? "https://api.example.com/v1"
				: PROVIDER_DEFAULTS[this.plugin.settings.apiProvider]?.endpoint || "";

		new Setting(containerEl)
			.setName("API 端点")
			.setDesc(
				this.plugin.settings.apiProvider === "ollama"
					? "Ollama 服务地址，例如: http://localhost:11434"
					: this.plugin.settings.apiProvider === "custom"
						? "自定义 API 的完整端点 URL"
						: `${providerName} 的 API 端点（已预填默认值，通常无需修改）`
			)
			.addText((text) =>
				text
					.setPlaceholder(defaultEndpoint)
					.setValue(this.plugin.settings.apiEndpoint)
					.onChange(async (value) => {
						this.plugin.settings.apiEndpoint = value;
						await this.plugin.saveSettings();
					})
			);

		// 模型名称
		const modelPlaceholders: Record<ApiProvider, string> = {
			openai: "gpt-3.5-turbo",
			azure: "gpt-35-turbo",
			ollama: "llama2 / mistral / codellama",
			kimi: "moonshot-v1-8k / moonshot-v1-32k / moonshot-v1-128k",
			deepseek: "deepseek-chat / deepseek-coder",
			custom: "your-model-name",
		};

		new Setting(containerEl)
			.setName("模型名称")
			.setDesc(
				this.plugin.settings.apiProvider === "kimi"
					? "Kimi 模型：8k/32k/128k 表示上下文长度"
					: this.plugin.settings.apiProvider === "deepseek"
						? "deepseek-chat（通用）或 deepseek-coder（代码专用）"
						: "使用的 AI 模型"
			)
			.addText((text) =>
				text
					.setPlaceholder(modelPlaceholders[this.plugin.settings.apiProvider])
					.setValue(this.plugin.settings.modelName)
					.onChange(async (value) => {
						this.plugin.settings.modelName = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "补全行为" });

		// 补全模式
		new Setting(containerEl)
			.setName("补全模式")
			.setDesc("single-line: 补全当前行; multi-line: 根据上下文自动补全多行内容")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("single-line", "单行补全")
					.addOption("multi-line", "多行补全")
					.setValue(this.plugin.settings.completionMode)
					.onChange(async (value) => {
						this.plugin.settings.completionMode = value as CompletionMode;
						await this.plugin.saveSettings();
					})
			);

		// 防抖延迟
		new Setting(containerEl)
			.setName("触发延迟 (ms)")
			.setDesc("输入停止后多久触发补全请求")
			.addSlider((slider) =>
				slider
					.setLimits(100, 2000, 100)
					.setValue(this.plugin.settings.debounceDelay)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.debounceDelay = value;
						await this.plugin.saveSettings();
					})
			);

		// 最小触发长度
		new Setting(containerEl)
			.setName("最小触发长度")
			.setDesc("输入多少字符后开始触发补全")
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.minTriggerLength)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.minTriggerLength = value;
						await this.plugin.saveSettings();
					})
			);

		// 最大补全长度
		new Setting(containerEl)
			.setName("最大补全长度")
			.setDesc("单次补全的最大字符数")
			.addSlider((slider) =>
				slider
					.setLimits(50, 500, 50)
					.setValue(this.plugin.settings.maxCompletionLength)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxCompletionLength = value;
						await this.plugin.saveSettings();
					})
			);

		// 候选数量
		new Setting(containerEl)
			.setName("候选数量")
			.setDesc("每次请求生成的补全备选方案数量（需 API 支持）")
			.addSlider((slider) =>
				slider
					.setLimits(1, 5, 1)
					.setValue(this.plugin.settings.completionCount)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.completionCount = value;
						await this.plugin.saveSettings();
					})
			);

		// Temperature
		new Setting(containerEl)
			.setName("Temperature")
			.setDesc("创造性程度 (0=保守, 2=创造性)")
			.addSlider((slider) =>
				slider
					.setLimits(0, 2, 0.1)
					.setValue(this.plugin.settings.temperature)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.temperature = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
