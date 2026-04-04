# A2UI Agent：提示词与输出约束（v0_8）

本文档定义 **A2UI Agent** 的行为约定：根据用户的**自然语言**与可选的**图片输入**（多模态模型），生成符合本仓库 `docs` 与 **A2UI v0_8** 的 **A2UI JSON**，供端上 **a2ui-core / a2ui-react** 解析并渲染。

---

## 1. 任务目标

- **输入**：用户用自然语言描述界面意图；可附带一张或多张图片（界面截图、线稿、参考 UI、照片等），由**多模态大模型**理解视觉与语义。
- **输出**：**仅**输出可被客户端消费的 **A2UI 消息 JSON**（见下文「输出形态」），不输出与协议无关的闲聊（除非产品明确要求「解释+JSON」分块）。
- **结果**：端上收到 JSON 后，经 `a2uiParser` 解析、`createRenderMap` 渲染，得到动态 UI。

---

## 2. 协议与 Schema 依据（docs 文件夹）

| 文档 / 文件 | 用途 |
|-------------|------|
| [server_to_client_with_standard_catalog.json](./server_to_client_with_standard_catalog.json) | **单条 A2UI 消息**内各字段形状（`beginRendering` / `surfaceUpdate` / `dataModelUpdate` / `deleteSurface`）；一条消息**恰好包含其中一类**顶层动作（合并多类时需拆成多条消息或按流式分段下发）。 |
| [supported-a2ui-standard-components-v0_8.md](./supported-a2ui-standard-components-v0_8.md) | **本仓库实际已实现**的组件名、BoundValue 行为、以及 **与标准 catalog 的差异**（如 `Image` 字段名）。Agent 生成内容**必须**以该表为准，否则端上会报「未注册组件」或渲染异常。 |
| [local-client-dataModel-extension-v0_8.md](./local-client-dataModel-extension-v0_8.md) | 可选：`Button.action.localDataModelUpdate`、`openLink` 等**本地扩展**；需要交互按钮时引用。 |
| 规范原文（仓库内） | `specification/v0_8/docs/a2ui_protocol.md`、`specification/v0_8/json/server_to_client.json` 等，用于语义细节（如 BoundValue、surface 生命周期）。 |

---

## 3. 输出形态（端上渲染）

### 3.1 合并对象（单条消息内多键）

允许使用**一个 JSON 对象**同时包含多个顶层键，例如：

```json
{
  "beginRendering": { "surfaceId": "surface-001", "root": "root-1" },
  "surfaceUpdate": { "surfaceId": "surface-001", "components": [ ... ] },
  "dataModelUpdate": { ... }
}
```

服务端或流式通道可再拆成 **JSONL**（每行一条单键消息）；客户端解析器行为见 `a2ui-core` 的流式与合并逻辑。

### 3.2 流式下发

若通过 Agent 流式输出，建议按 **语义完整** 的片段输出（例如先 `beginRendering`，再分块 `surfaceUpdate` 等），并保证与现有 **JSONL / 自定义 chunk** 约定一致（见 `server/a2ui-playground-server` 与 AG-UI `CUSTOM` 事件等实现）。

---

## 4. 允许使用的组件（白名单）

**仅**使用 [supported-a2ui-standard-components-v0_8.md](./supported-a2ui-standard-components-v0_8.md) 中已注册且标注为「本仓库已实现」的组件：

- **布局 / 容器**：`Column`、`Row`、`List`
- **展示**：`Text`、`Image`、`Icon`
- **卡片**：`Card`（按本仓库实际字段：`title` / `subtitle` / `children` 等）
- **交互**：`Button`（按本仓库：`text`、样式 variant，及可选 `localDataModelUpdate` / `openLink`）

**不要**使用仅出现在标准 catalog、但本仓库 **未渲染** 的组件（文档中列出的 `Video`、`Tabs`、`TextField` 等），除非端上已扩展 `renderMap`。

---

## 5. 本仓库渲染器差异（Agent 必遵守）

生成 JSON 时**不要**只照抄抽象标准，需对齐本仓库实现，否则解析/渲染会失败：

| 主题 | 要求 |
|------|------|
| **Image** | 使用 **`source.uri`**（及 `alt` 等）承载图片地址，与标准 `url` 的 BoundValue 差异见支持文档；不要用未实现的字段名。 |
| **Button** | 使用 **`text`** 等本仓库实现字段；若需 `action`，需兼容本地扩展字段。 |
| **Card** | 使用 **`title` / `subtitle` / `children`（explicitList）`** 等，与「仅 child」的标准示例不同。 |
| **BoundValue** | `Text.text` 等使用 `literalString` 和/或 `path`；列表模板见 `List`/`Row`/`Column` 的 `children.template` 与 `dataModelUpdate` 的邻接表结构。 |

---

## 6. 多模态输入（自然语言 + 图片）

- **文本**：直接作为用户指令，描述结构、文案、交互、数据意图。
- **图片**：
  - 模型应综合视觉信息（布局、颜色、层次、控件类型）与文本描述。
  - 若图片与文字冲突，**以用户明确文字指令为准**，或在输出中通过 `Text` 简要说明取舍。
  - 图片中的**不可读区域**用合理占位文案（`literalString`），不要臆造不可验证的 URL；需要真实图床 URL 时应在业务层由用户或后续步骤提供。
- **输出仍为纯 JSON**：模型侧**不要**把图片二进制写入 A2UI JSON；图片展示用 **Image 组件 + `source.uri`** 指向可访问的 URL，或由用户事先在 `dataModel` 中提供路径。

---

## 7. Prompt 模版源码（唯一权威）

**请勿在文档中手写维护长段英文/中文模版。** 正式模版以服务端源码为准；**A2UI 完整 system prompt 仅在 `POST /api/agent`（LLM 路径）中注入**，`POST /api/chat` 为普通对话、不注入该模版。

| 位置 | 说明 |
|------|------|
| [server/a2ui-playground-server/src/prompt/a2uiAgentPrompt.ts](../server/a2ui-playground-server/src/prompt/a2uiAgentPrompt.ts) | 主模版为 **`A2UI_AGENT_SYSTEM_PROMPT_ZH`（仅中文）**；可选 `A2UI_AGENT_SYSTEM_PROMPT_EN`；`buildA2uiAgentSystemPrompt()` 负责组装 |
| [server/a2ui-playground-server/src/agent/llmA2uiAgentStream.ts](../server/a2ui-playground-server/src/agent/llmA2uiAgentStream.ts) | 在 OpenAI 消息列表**最前**加入 `buildA2uiAgentSystemPrompt()`，供 `/api/agent` 流式输出 A2UI |

**中文 prompt 大致包含哪些块（与源码一致）**

1. **角色**：只生成 A2UI JSON，不闲聊。  
2. **协议与消息形态**：`beginRendering` / `surfaceUpdate` / `dataModelUpdate` / `deleteSurface`；合并对象 vs JSONL 行。  
3. **输出格式**：仅 JSON 或 JSONL；不要用 markdown 代码块（除非产品要求）。  
4. **允许组件白名单**：Column、Row、List、Text、Image、Icon、Button、Card；禁止未实现组件。  
5. **与本仓库渲染器对齐**：Text 的 BoundValue；Image 的 `source.uri`；Button / Card 的实作字段；List/Row/Column 的 children 与 dataModel。  
6. **多模态**：图文结合、冲突处理、禁止内嵌二进制。  
7. **标识符**：surfaceId、组件 id 等唯一字符串。  
8. **无法满足时**：降级方案 + Text 说明。

**环境变量（可选）**

- `A2UI_AGENT_PROMPT_LOCALE`：`zh`（**默认**，仅中文）| `en` | `both`（中文 + 英文简版，中间用 `---` 分隔）

**调用约定**

- A2UI：将 `buildA2uiAgentSystemPrompt()` 的返回值作为 **Chat Completions 的第一条** `role: "system"` message，其后接 RunAgent 上下文中的用户/助手消息（及多模态 API 要求的 `image_url` 等）；由 `/api/agent` 的 LLM 路径实现。
- 普通多轮对话请用 **`POST /api/chat`**，不附带上述 A2UI system 模版。
- 未配置 LLM、或设置 `AGENT_USE_MOCK=1`、或请求带 `?mock=1` 时，`/api/agent` 仍使用随机 mock，不调用模型。

---


## 8. 与「端上渲染」的衔接

1. **解析**：客户端使用 `a2uiParser.parseMessage` 或流式 `write` + `JSONLBuffer` 消费消息。
2. **渲染**：`init({ renderMap: createRenderMap(...) })` 注册组件。
3. **校验**：需要严格校验时，可对 `surfaceUpdate.components` 使用 `specification/v0_8/eval` 中的 validator 或 JSON Schema；**宽松模式**以本仓库 mock 与 TSX 为准。

---

## 9. 修订记录

| 版本 | 说明 |
|------|------|
| v0.1 | 初版：对齐 docs 三文件 + 多模态 + 可复制 System Prompt |
| v0.2 | 模版迁至 `server/.../src/prompt/a2uiAgentPrompt.ts`；曾支持在 `/api/chat` 通过 `agentMode: "a2ui"` 注入（已迁至 `/api/agent`） |
| v0.3 | 默认仅中文 prompt；扩充 `A2UI_AGENT_SYSTEM_PROMPT_ZH` 正文结构 |
| v0.4 | A2UI system prompt 仅由 `/api/agent`（`llmA2uiAgentStream`）注入；`/api/chat` 不再支持 `agentMode` |
