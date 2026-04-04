# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个 Obsidian 插件项目，核心功能是提供类似 Copilot 的代码/公式自动补全功能，针对 Markdown 笔记场景优化，特别是计算机科学相关的学习笔记。

## 常用命令

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 构建用于发布
npm run build

# 版本发布（更新 manifest.json 和 versions.json）
npm run version
```

## 项目结构

```
├── manifest.json          # 插件清单，定义插件元数据
├── package.json           # 依赖和脚本
├── tsconfig.json          # TypeScript 配置
├── esbuild.config.mjs     # 构建配置
├── src/
│   ├── main.ts           # 插件入口，主 Plugin 类
│   ├── settings.ts       # 设置界面和数据结构
│   ├── completion.ts     # 自动补全核心逻辑
│   └── ui/
│       └── suggest.ts    # 建议下拉 UI 组件
├── styles.css            # 插件样式
└── version-bump.mjs      # 版本更新脚本
```

## 开发工作流

### 本地测试
1. 在 Obsidian 中开启"开发者模式"
2. 创建测试仓库或打开现有仓库
3. 将项目链接到 `<vault>/.obsidian/plugins/<plugin-id>/`
4. 运行 `npm run dev` 启用热重载

### 关键文件说明

**manifest.json**
- `id`: 插件唯一标识符
- `minAppVersion`: 最低支持的 Obsidian 版本
- `isDesktopOnly`: 是否仅桌面端可用（AI 补全通常需要本地/远程服务，设为 true）

**src/main.ts**
- 继承 `Plugin` 类
- `onload()`: 插件启动时初始化补全逻辑
- `onunload()`: 清理事件监听和 DOM 元素

**src/settings.ts**
- 继承 `PluginSettingTab`
- 配置 API 端点、触发延迟、补全长度等参数

### 补全功能架构

补全功能通常包含以下组件：

1. **触发器** (`EditorChange` 事件监听)
   - 监听编辑器内容变化
   - 根据输入模式（代码块、公式块、普通文本）决定是否触发
   - 实现防抖逻辑避免频繁请求

2. **上下文收集器**
   - 获取当前光标位置
   - 提取前后文（当前段落、相关代码块等）
   - 构建 LLM 提示词

3. **补全服务**
   - 支持多种后端：本地 Ollama、远程 OpenAI API、Azure 等
   - 流式响应处理
   - 超时和错误处理

4. **UI 层**
   - 幽灵文本 (ghost text) 或内联建议
   - 快捷键接受建议 (Tab/Enter)
   - 拒绝建议 (Esc)

## API 提供商支持

插件支持多种 AI 服务提供商：

### 国产 API（推荐）
- **Kimi (月之暗面)** - `https://api.moonshot.cn/v1`
  - 模型: `moonshot-v1-8k`, `moonshot-v1-32k`, `moonshot-v1-128k`
  - 特点: 中文理解优秀，上下文长度可选
- **DeepSeek** - `https://api.deepseek.com/v1`
  - 模型: `deepseek-chat`, `deepseek-coder`
  - 特点: `deepseek-coder` 对代码和技术笔记补全效果好

### 国际 API
- **OpenAI** - `https://api.openai.com/v1`
- **Azure OpenAI** - 企业部署，需自定义端点
- **Ollama** - `http://localhost:11434/v1`（本地部署）

所有提供商均使用 OpenAI 兼容的 API 格式，通过 `openai` SDK 调用。

## 依赖管理

- **Obsidian API**: `obsidian` 包提供类型定义和运行时 API
- **@codemirror/***: 用于编辑器扩展和低级别文本操作
- **openai**: OpenAI SDK，兼容所有 OpenAI API 格式的服务

## 注意事项

- Obsidian 插件在沙箱中运行，某些 Node.js API 不可用
- 编辑器基于 CodeMirror 6，使用其 API 进行文本操作
- 性能敏感：补全触发和渲染应避免阻塞主线程
- 用户隐私：AI 请求应明确告知用户数据发送情况
