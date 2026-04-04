# a2ui-playground-server

Mock **AG-UI**（SSE）端点：接收 [`RunAgentInput`](https://docs.ag-ui.com/)，按流下发 `RUN_STARTED` → 若干 `CUSTOM`（`name: a2ui.message`，值为单键 A2UI 消息）→ `RUN_FINISHED`。当前不调用真实 LLM，从 `packages/a2ui-core/mock/*.json` 读取合并 A2UI JSON 并拆分。

## 运行

```bash
# 在仓库根目录
pnpm dev:server
```

默认端口 **`3847`**（`PORT` 可覆盖）。CORS 默认 `*`，可用 **`CORS_ORIGIN`** 指定单一源。

## 验收（curl）

```bash
curl -N -X POST http://localhost:3847/api/agent \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -d '{"threadId":"t1","runId":"r1","messages":[{"id":"m1","role":"user","content":"hello"}],"tools":[],"context":[]}'
```

未传 `tools`/`context` 时服务端会补默认空数组。

### SSE 与 `Accept`（避免「声明 proto、正文却是文本」）

官方 AG-UI 客户端可能携带 `Accept: … application/vnd.ag-ui.event+proto`。若按该协商设置响应 `Content-Type` 为 proto，而实际仍发送 `data: {JSON}` 文本帧，浏览器/库可能按**二进制**解析。

本服务在 **SSE 模式**下**固定** `Content-Type: text/event-stream`，并用 `EventEncoder` 的文本 SSE 编码（`data:` 行），**不**根据 `Accept` 返回 protobuf 流。需要原生 protobuf 时需另作接口或扩展。

### Query：是否使用 SSE

默认 **`POST /api/agent` 返回 SSE**（`text/event-stream`）。

查询参数 **`sse`** 可关闭流式，改为一次性 **JSON**（`Content-Type: application/json`，body 为 `{ "events": [ ... ] }`，事件对象与 AG-UI 一致）：

| `sse` 取值 | 行为 |
|------------|------|
| 省略或 `1` / `true` 等 | SSE（默认） |
| `0` / `false` / `no` / `off` / `json` | 非流式 JSON |

示例：

```bash
curl -sS -X POST 'http://localhost:3847/api/agent?sse=0' \
  -H 'Content-Type: application/json' \
  -d '{"threadId":"t1","runId":"r1","messages":[{"id":"m1","role":"user","content":"hello"}],"tools":[],"context":[]}'
```

## Mock 选择

- 默认：`column-with-texts`。
- 用户最后一条 **user** 消息内容为 `local` 或包含 `local-action` 时，使用 `local-action-text-demo.json`。

## 前端联调

开发时可在 Vite 中将 `/api` 代理到本服务（见 `web/a2ui-playground/vite.config.ts`），请求 `fetch('/api/agent', …)` 即可。
