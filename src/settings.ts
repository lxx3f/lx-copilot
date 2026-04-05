import { App, PluginSettingTab, Setting } from "obsidian";
import CopilotPlugin from "./main";

export type ApiProvider = "openai" | "azure" | "ollama" | "kimi" | "deepseek" | "custom";
export type CompletionMode = "single-line" | "multi-line";

export interface ProviderConfig {
	apiKey: string;
	apiEndpoint: string;
	modelName: string;
}

export interface CopilotSettings {
	enabled: boolean;
	apiProvider: ApiProvider;
	completionMode: CompletionMode;
	// 每个提供商独立配置
	providerConfigs: Record<ApiProvider, ProviderConfig>;
	// 兼容旧配置（迁移后不再使用）
	apiKey?: string;
	apiEndpoint?: string;
	modelName?: string;
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

export function createDefaultProviderConfigs(): Record<ApiProvider, ProviderConfig> {
	return {
		openai: {
			apiKey: "",
			apiEndpoint: PROVIDER_DEFAULTS.openai.endpoint,
			modelName: PROVIDER_DEFAULTS.openai.model,
		},
		azure: {
			apiKey: "",
			apiEndpoint: PROVIDER_DEFAULTS.azure.endpoint,
			modelName: PROVIDER_DEFAULTS.azure.model,
		},
		ollama: {
			apiKey: "",
			apiEndpoint: PROVIDER_DEFAULTS.ollama.endpoint,
			modelName: PROVIDER_DEFAULTS.ollama.model,
		},
		kimi: {
			apiKey: "",
			apiEndpoint: PROVIDER_DEFAULTS.kimi.endpoint,
			modelName: PROVIDER_DEFAULTS.kimi.model,
		},
		deepseek: {
			apiKey: "",
			apiEndpoint: PROVIDER_DEFAULTS.deepseek.endpoint,
			modelName: PROVIDER_DEFAULTS.deepseek.model,
		},
		custom: {
			apiKey: "",
			apiEndpoint: "",
			modelName: "",
		},
	};
}

export const DEFAULT_SETTINGS: CopilotSettings = {
	enabled: true,
	apiProvider: "openai",
	completionMode: "single-line",
	providerConfigs: createDefaultProviderConfigs(),
	debounceDelay: 500,
	minTriggerLength: 3,
	maxCompletionLength: 100,
	completionCount: 2,
	temperature: 0.7,
};

/** 将旧版单配置迁移到新版按提供商配置 */
export function migrateSettings(settings: Partial<CopilotSettings>): CopilotSettings {
	const migrated = Object.assign({}, DEFAULT_SETTINGS, settings);
	if (!migrated.providerConfigs) {
		migrated.providerConfigs = createDefaultProviderConfigs();
	}
	// 若存在旧配置，把它放进当前选中的提供商配置里
	if (settings.apiKey !== undefined || settings.apiEndpoint !== undefined || settings.modelName !== undefined) {
		migrated.providerConfigs[migrated.apiProvider] = {
			apiKey: settings.apiKey ?? migrated.providerConfigs[migrated.apiProvider].apiKey,
			apiEndpoint: settings.apiEndpoint ?? migrated.providerConfigs[migrated.apiProvider].apiEndpoint,
			modelName: settings.modelName ?? migrated.providerConfigs[migrated.apiProvider].modelName,
		};
	}
	return migrated;
}

export class CopilotSettingTab extends PluginSettingTab {
	plugin: CopilotPlugin;

	constructor(app: App, plugin: CopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName("General").setHeading();

		// Enable/disable
		new Setting(containerEl)
			.setName("Enable completion")
			.setDesc("Enable AI auto-completion")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enabled)
					.onChange((value) => {
						this.plugin.settings.enabled = value;
						void this.plugin.saveSettings();
					})
			);

		const currentProvider = this.plugin.settings.apiProvider;
		const config = this.plugin.settings.providerConfigs[currentProvider];

		// Provider selection
		new Setting(containerEl)
			.setName("API provider")
			.setDesc("Select an AI provider; each provider stores its own configuration")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("openai", "OpenAI")
					.addOption("azure", "Azure OpenAI")
					.addOption("ollama", "Ollama (local)")
					.addOption("kimi", "Kimi")
					.addOption("deepseek", "DeepSeek")
					.addOption("custom", "Custom API")
					.setValue(currentProvider)
					.onChange((value) => {
						const newProvider = value as ApiProvider;
						this.plugin.settings.apiProvider = newProvider;

						// Auto-fill defaults only when the chosen provider config is empty
						if (newProvider !== "custom") {
							const defaults = PROVIDER_DEFAULTS[newProvider];
							const newConfig = this.plugin.settings.providerConfigs[newProvider];
							if (!newConfig.apiEndpoint) {
								newConfig.apiEndpoint = defaults.endpoint;
							}
							if (!newConfig.modelName) {
								newConfig.modelName = defaults.model;
							}
						}

						void this.plugin.saveSettings();
						this.display();
					})
			);

		// API key (not needed for local models)
		const noKeyProviders: ApiProvider[] = ["ollama"];
		if (!noKeyProviders.includes(currentProvider)) {
			new Setting(containerEl)
				.setName("API key")
				.setDesc("Your API key is stored locally only")
				.addText((text) =>
					text
						.setPlaceholder("Your API key")
						.setValue(config.apiKey)
						.onChange((value) => {
							config.apiKey = value;
							void this.plugin.saveSettings();
						})
				);
		}

		// API endpoint
		const providerNames: Record<ApiProvider, string> = {
			openai: "OpenAI",
			azure: "Azure",
			ollama: "Ollama",
			kimi: "Kimi",
			deepseek: "DeepSeek",
			custom: "Custom API",
		};

		const providerName = providerNames[currentProvider];
		const defaultEndpoint =
			currentProvider === "custom"
				? "https://api.example.com/v1"
				: PROVIDER_DEFAULTS[currentProvider]?.endpoint || "";

		new Setting(containerEl)
			.setName("API endpoint")
			.setDesc(
				currentProvider === "ollama"
					? "Ollama service address, e.g. http://localhost:11434"
					: currentProvider === "custom"
						? "Full endpoint URL for the custom API"
						: `${providerName} API endpoint (pre-filled with a default, usually no change needed)`
			)
			.addText((text) =>
				text
					.setPlaceholder(defaultEndpoint)
					.setValue(config.apiEndpoint)
					.onChange((value) => {
						config.apiEndpoint = value;
						void this.plugin.saveSettings();
					})
			);

		// Model name
		const modelPlaceholders: Record<ApiProvider, string> = {
			openai: "gpt-3.5-turbo",
			azure: "gpt-35-turbo",
			ollama: "llama2 / mistral / codellama",
			kimi: "moonshot-v1-8k / moonshot-v1-32k / moonshot-v1-128k",
			deepseek: "deepseek-chat / deepseek-coder",
			custom: "your-model-name",
		};

		new Setting(containerEl)
			.setName("Model name")
			.setDesc(
				currentProvider === "kimi"
					? "Kimi model: 8k/32k/128k indicates context length"
					: currentProvider === "deepseek"
						? "deepseek-chat (general) or deepseek-coder (code-focused)"
						: "AI model to use"
			)
			.addText((text) =>
				text
					.setPlaceholder(modelPlaceholders[currentProvider])
					.setValue(config.modelName)
					.onChange((value) => {
						config.modelName = value;
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Completion behavior").setHeading();

		// Completion mode
		new Setting(containerEl)
			.setName("Completion mode")
			.setDesc("Single-line: complete the current line; multi-line: auto-complete multiple lines based on context")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("single-line", "Single-line")
					.addOption("multi-line", "Multi-line")
					.setValue(this.plugin.settings.completionMode)
					.onChange((value) => {
						this.plugin.settings.completionMode = value as CompletionMode;
						void this.plugin.saveSettings();
					})
			);

		// Debounce delay
		new Setting(containerEl)
			.setName("Trigger delay (ms)")
			.setDesc("Delay before triggering a completion request after input stops")
			.addSlider((slider) =>
				slider
					.setLimits(100, 2000, 100)
					.setValue(this.plugin.settings.debounceDelay)
					.setDynamicTooltip()
					.onChange((value) => {
						this.plugin.settings.debounceDelay = value;
						void this.plugin.saveSettings();
					})
			);

		// Minimum trigger length
		new Setting(containerEl)
			.setName("Minimum trigger length")
			.setDesc("Number of characters to type before triggering completion")
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.minTriggerLength)
					.setDynamicTooltip()
					.onChange((value) => {
						this.plugin.settings.minTriggerLength = value;
						void this.plugin.saveSettings();
					})
			);

		// Maximum completion length
		new Setting(containerEl)
			.setName("Maximum completion length")
			.setDesc("Maximum number of characters per completion")
			.addSlider((slider) =>
				slider
					.setLimits(10, 300, 10)
					.setValue(this.plugin.settings.maxCompletionLength)
					.setDynamicTooltip()
					.onChange((value) => {
						this.plugin.settings.maxCompletionLength = value;
						void this.plugin.saveSettings();
					})
			);

		// Candidate count
		new Setting(containerEl)
			.setName("Candidate count")
			.setDesc("Number of completion alternatives generated per request (API support required)")
			.addSlider((slider) =>
				slider
					.setLimits(1, 5, 1)
					.setValue(this.plugin.settings.completionCount)
					.setDynamicTooltip()
					.onChange((value) => {
						this.plugin.settings.completionCount = value;
						void this.plugin.saveSettings();
					})
			);

		// Temperature
		new Setting(containerEl)
			.setName("Temperature")
			.setDesc("Creativity level (0 = conservative, 2 = creative)")
			.addSlider((slider) =>
				slider
					.setLimits(0, 2, 0.1)
					.setValue(this.plugin.settings.temperature)
					.setDynamicTooltip()
					.onChange((value) => {
						this.plugin.settings.temperature = value;
						void this.plugin.saveSettings();
					})
			);
	}
}
