# Obsidian Copilot

为 Obsidian 提供类似 Copilot 的 AI 自动补全功能，特别优化了 Markdown 笔记、代码块和数学公式的补全体验。

## 功能

- 🤖 **AI 自动补全** - 输入时智能提示可能的后续内容
- 💻 **代码补全** - 在代码块中自动补全代码逻辑
- 📐 **公式补全** - 支持 LaTeX 数学公式补全
- 📝 **Markdown 优化** - 针对笔记场景优化的补全建议
- 🔧 **多后端支持** - 支持 OpenAI、Azure、Ollama 本地模型等

## 安装

### 手动安装

1. 下载最新版本的发布包
2. 解压到 `<vault>/.obsidian/plugins/obsidian-copilot/`
3. 重启 Obsidian
4. 在设置中启用插件并配置 API 密钥

### 开发安装

```bash
git clone <repo-url>
cd obsidian-copilot
npm install
npm run dev
```

将项目链接到你的测试仓库：
```bash
# Windows (PowerShell)
New-Item -ItemType SymbolicLink -Path "<vault>/.obsidian/plugins/obsidian-copilot" -Target "<project-path>"

# macOS/Linux
ln -s <project-path> <vault>/.obsidian/plugins/obsidian-copilot
```

## 配置

在 Obsidian 设置中找到 "Obsidian Copilot"：

### 支持的 API 提供商

| 提供商 | 说明 | 推荐模型 |
|--------|------|----------|
| **OpenAI** | 国际主流，效果好 | gpt-3.5-turbo / gpt-4 |
| **Azure** | 企业级 OpenAI | gpt-35-turbo |
| **Kimi** | 月之暗面，国产优秀 | moonshot-v1-8k/32k/128k |
| **DeepSeek** | 深度求索，代码强 | deepseek-chat / deepseek-coder |
| **Ollama** | 本地部署，隐私好 | llama2 / mistral / codellama |
| **Custom** | 其他 OpenAI 兼容 API | - |

### 快速配置

**Kimi (月之暗面)**
1. 访问 [platform.moonshot.cn](https://platform.moonshot.cn) 获取 API Key
2. 选择提供商："Kimi (月之暗面)"
3. 粘贴 API Key
4. 端点已自动填充：`https://api.moonshot.cn/v1`
5. 选择模型：8k/32k/128k 表示上下文长度，按需选择

**DeepSeek**
1. 访问 [platform.deepseek.com](https://platform.deepseek.com) 获取 API Key
2. 选择提供商："DeepSeek"
3. 粘贴 API Key
4. 端点已自动填充：`https://api.deepseek.com/v1`
5. 推荐模型：`deepseek-coder`（代码/技术笔记专用）或 `deepseek-chat`（通用）

### 设置项

- **API Key**: 你的 API 密钥（仅保存在本地）
- **模型名称**: 根据提供商选择
- **触发延迟**: 输入停止后触发补全的延迟
- **补全长度**: 单次补全的最大字符数
- **Temperature**: 创造性程度 (0=保守, 2=创造性)

## 使用

1. 在编辑器中正常输入
2. 当 AI 建议出现时，你会看到一个提示框
3. 按 `Tab` 接受建议
4. 按 `Esc` 拒绝建议

## 开发

```bash
# 开发模式（热重载）
npm run dev

# 构建发布版本
npm run build

# 版本发布
npm version patch/minor/major
```

## 许可证

MIT
