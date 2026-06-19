# A2UI 项目概述

## 1. 项目定位

本项目是一个基于 A2UI 协议的 AI 生成 UI Playground。用户可以在 Web 应用中通过自然语言或图片输入发起对话，由服务端 Agent 调用 LLM 生成 A2UI 协议消息，前端再将协议解析为 React 组件树并实时预览。

项目同时包含：

- A2UI 协议解析与状态管理核心库。
- React 渲染适配库。
- Playground 前端应用。
- Playground 服务端 Agent 与调试接口。
- A2UI v0.8.2 协议、JSON Schema、示例 catalog 与评测工具。

## 2. 技术栈

- 包管理与工程组织：pnpm workspace monorepo。
- 语言：TypeScript。
- 前端：React 18、Vite、Ant Design。
- 服务端：Koa、koa-router、koa-bodyparser、SSE。
- Agent/LLM：OpenAI SDK，支持 OpenAI 兼容网关、Moonshot/Kimi、兼容 LLM 网关。
- 协议流：AG-UI 事件流 + A2UI JSONL chunk。
- 状态管理：zustand vanilla store。
- 测试：Mocha、Chai、ts-node。

## 3. 目录结构

```text
.
├── packages/
│   ├── a2ui-core/              # A2UI 核心 SDK：协议解析、store、数据模型、mock、测试
│   └── a2ui-react/             # A2UI React 渲染适配与基础组件
├── web/
│   └── a2ui-playground/        # Vite + React Playground 前端
├── server/
│   └── a2ui-playground-server/ # Koa 服务端、Agent、LLM provider、API 路由
├── specification/
│   └── v0_8/                   # A2UI v0.8.2 协议、schema、catalog、eval 工具
├── docs/                       # Prompt、catalog、示例场景等项目文档
├── scripts/                    # 辅助脚本
├── README.md                   # 原始项目简介
├── package.json                # 根脚本
└── pnpm-workspace.yaml         # workspace 配置
```

## 4. 核心模块说明

### 4.1 `packages/a2ui-core`

核心库负责把 A2UI 协议消息转成可渲染状态。

主要内容：

- `src/parser/index.ts`：定义 A2UI 消息类型，包含 `beginRendering`、`surfaceUpdate`、`dataModelUpdate`、`deleteSurface`；同时实现 JSONLBuffer，可处理流式 JSONL、完整 JSON 消息和部分 surfaceUpdate 组件提取。
- `src/store/index.ts`：基于 zustand vanilla store 保存 surface、hydrate node、renderMap、error、data model。
- `src/dataModel.ts`：处理 `dataModelUpdate.contents` 邻接表到对象的转换、path 读取/写入、数据合并、BoundValue 文本解析和隐式 literal+path 初始化。
- `mock/*.json`：用于前端和服务端 mock 渲染的 A2UI 协议样例。
- `test/*.test.ts`：覆盖 parser、buffer、store、tree build、data model、list template 等核心逻辑。

对外入口：

- `init(options)`：创建 store，注册 renderMap、render throttle 和 onRender 回调。
- `a2uiParser`：全局 parser 实例。
- data model 工具函数：`contentsToObject`、`mergeDataModelUpdate`、`resolveBoundText` 等。

当前注意点：

- `src/treebuilder/index.ts` 目前为空文件。
- 核心树构建和渲染触发逻辑主要集中在 parser、store、dataModel 中。

### 4.2 `packages/a2ui-react`

React 渲染适配库负责把 A2UI 组件名映射到 React 组件。

主要内容：

- `src/components/index.ts`：导出 `createRenderMap` 和默认 `renderMap`。
- 基础组件：`Text`、`Column`、`Row`、`List`、`Button`、`Image`、`Icon`、`Card`、`StatChip`。
- `Button` 支持本地 data model 更新和 open link 动作。
- `createRenderMap` 支持组件挂载动画、mounted 状态回调、本地 data model 写入回调。
- `src/icon/legacyMaterialToAntd.ts`：Material icon 名称到 Ant Design Icon 的兼容映射。

当前注意点：

- `src/renderer/index.ts` 目前为空文件。
- React 渲染能力主要通过 `components/index.ts` 暴露。

### 4.3 `web/a2ui-playground`

Playground 是用户主要使用界面。

主要能力：

- 对话式生成 UI。
- 支持 `/api/agent`：模型输出 A2UI 协议并实时渲染。
- 支持 `/api/chat`：普通模型对话。
- 支持图片上传，多模态输入会以 AG-UI `binary` 内容发送给服务端。
- 支持多轮修改：前端会把当前画布协议快照传给 Agent，便于生成增量更新。
- 支持 mock 协议渲染、协议调试、LLM 原文展示。
- Vite dev server 默认端口为 `3000`，`/api` 代理到 `http://localhost:3847`。

关键文件：

- `src/App.tsx`：主 UI、聊天状态、SSE 消费、协议写入 parser、上传图片与调试展示。
- `src/buildA2uiProtocolSnapshot.ts`：从当前渲染状态导出协议快照。
- `src/mock/stream-simulator.ts`：本地流式协议模拟。
- `vite.config.ts`：workspace 源码 alias 与 `/api` 代理配置。

### 4.4 `server/a2ui-playground-server`

服务端负责对接 LLM、AG-UI 事件流和 A2UI 协议输出。

主要接口：

- `POST /api/agent`：接收 AG-UI `RunAgentInput`，返回 AG-UI SSE 事件流；事件中通过 `CUSTOM` 下发 A2UI JSONL chunk。
- `POST /api/chat`：普通聊天接口，支持流式或非流式返回。
- `/api/antd-icons`：为 Agent 或前端提供 Ant Design Icon 信息。

关键文件：

- `src/index.ts`：Koa 应用入口，加载 `.env`，注册 CORS、body parser 和路由。
- `src/routes/agent.ts`：Agent 路由，支持 SSE/JSON 切换、mock/LLM 切换、内置工具合并。
- `src/routes/chat.ts`：普通聊天接口，支持多模态消息转换和 SSE delta。
- `src/agent/llmA2uiAgentStream.ts`：将 AG-UI 输入转换为 OpenAI messages，注入当前协议快照，处理工具调用、解析模型输出、拆分/合并 A2UI 协议并生成事件流。
- `src/provider/llm.ts`：读取 LLM provider、baseURL、apiKey、model，并创建 OpenAI 兼容客户端。
- `src/prompt/a2uiAgentPrompt.ts`：A2UI Agent system prompt。

LLM 配置入口：

- `server/a2ui-playground-server/.env.example`
- 支持 `KIMI_*`、`OPENAI_*`、`LLM_*` 三组配置。
- 未配置 LLM 或设置 `AGENT_USE_MOCK=1` 时，`/api/agent` 可走 mock。

### 4.5 `specification/v0_8`

该目录保存 A2UI v0.8.2 规格。README 标记该版本 specification 已关闭，不再主动开发。

主要内容：

- `docs/a2ui_protocol.md`：协议说明。
- `docs/a2ui_extension_specification.md`：扩展规范。
- `json/server_to_client.json`：服务端到客户端协议 schema。
- `json/client_to_server.json`：客户端到服务端协议 schema。
- `json/catalog_description_schema.json`：catalog 元 schema。
- `json/standard_catalog_definition.json`：标准 catalog。
- `json/server_to_client_with_standard_catalog.json`：面向 LLM 的严格 resolved schema。
- `json/catalogs/minimal`、`json/catalogs/basic`：组件 catalog 与示例。
- `eval/`：协议生成评测与 schema matcher。

## 5. 核心数据流

```text
用户输入文本/图片
  ↓
web/a2ui-playground 组装 AG-UI RunAgentInput
  ↓
POST /api/agent
  ↓
server 根据配置选择 mock 或 LLM
  ↓
LLM 生成 A2UI 合并 JSON / JSONL
  ↓
server 拆分为 AG-UI CUSTOM 事件：a2ui.jsonl.chunk
  ↓
前端 consumeAgentSse 读取 SSE
  ↓
a2uiParser / JSONLBuffer 增量解析 beginRendering、surfaceUpdate、dataModelUpdate
  ↓
a2ui-core store 更新 surface、hydrate node、data model
  ↓
a2ui-react renderMap 创建 React 组件树
  ↓
Playground 预览区实时更新
```

## 6. A2UI 协议消息

当前代码主要处理四类服务端到客户端消息：

- `beginRendering`：声明 surface、root、catalog、styles。
- `surfaceUpdate`：增量更新组件定义。
- `dataModelUpdate`：更新某个 surface 的数据模型。
- `deleteSurface`：删除 surface 及其关联 hydrate node 和 data model。

前端 parser 对流式输入做了容错处理：

- 支持标准 JSONL 每行一个消息。
- 支持完整 JSON 对象。
- 支持在 surfaceUpdate 尚未完整结束时，提前提取完整 component 并触发增量渲染。

## 7. 常用命令

在仓库根目录执行：

```bash
pnpm install
pnpm dev:server
pnpm dev:web
pnpm build
pnpm typecheck
```

各 package 单独执行：

```bash
pnpm -F a2ui-core test
pnpm -F a2ui-core build
pnpm -F a2ui-react build
pnpm -F a2ui-playground build
pnpm -F a2ui-playground-server build
```

默认开发端口：

- Web：`http://localhost:3000`
- Server：`http://localhost:3847`

## 8. 环境变量

服务端读取 `server/a2ui-playground-server/.env`。

常用配置：

```bash
# 指定 provider，可选 moonshot / openai / llm_compat
LLM_PROVIDER=openai

OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
OPENAI_VISION_MODEL=gpt-4o-mini

# 无 LLM 时或调试时强制 mock
AGENT_USE_MOCK=1

# 服务端口
PORT=3847

# 调试日志
A2UI_AGENT_DEBUG=1
```

Provider 自动回退顺序：

1. `KIMI_API_KEY`
2. `OPENAI_API_KEY`
3. `LLM_API_KEY`

## 9. 测试与验证

已有测试主要集中在 `a2ui-core`：

- `buffer.test.ts`：流式 JSONL buffer。
- `parser.test.ts`：协议解析。
- `store.test.ts`：store 状态读写。
- `dataModel.test.ts`：data model 合并与绑定解析。
- `listTemplate.test.ts`：列表模板。
- `treeBuild.test.ts`：树构建相关行为。

建议变更验证顺序：

```bash
pnpm -F a2ui-core test
pnpm typecheck
pnpm build
```

如果改动涉及前后端联调，再启动：

```bash
pnpm dev:server
pnpm dev:web
```

## 10. 维护建议

- 协议变更优先从 `specification/v0_8/json`、`docs`、`server/src/prompt` 和 `packages/a2ui-core/src/parser` 同步检查。
- 新增组件时，需要同时更新 `a2ui-react` 组件实现、`createRenderMap`、catalog/schema 示例、mock 和必要测试。
- 新增 data binding 或 action 行为时，需要关注 `dataModel.ts`、`store/index.ts`、React 组件事件处理和 Playground 快照导出。
- 修改 Agent 输出要求时，应同步调整 `a2uiAgentPrompt`、协议拆分/合并逻辑和前端 SSE 解析展示。
- `specification/v0_8` 标记为 closed，如需推进新协议版本，建议新增独立版本目录，避免直接修改已关闭规格。
