# A2UI Sentry 前端监控 + Node 本地落盘交付资料

这是 A2UI 项目 Sentry 前端监控 + Node 本地落盘的交付资料。当前实现已经完成前端监控采集、本地 Node JSON 落盘、独立监控后台、新标签页入口、表格拖拽排序；脱敏、IP 限流、source map 上传属于生产化待补项。

## 1. Codex 总结

### 本次实现了什么

- 接入 `@sentry/react`，在前端初始化 Sentry SDK。
- 支持 `VITE_SENTRY_DSN`，有 DSN 时上报 Sentry，无 DSN 时只落本地。
- 使用 `beforeSend` 将 Sentry 事件同步转成本地监控事件。
- 捕获 `window.error`、`unhandledrejection`、React ErrorBoundary 异常。
- 采集基础性能指标：navigation、LCP、CLS、longtask、slow resource。
- 前端把监控事件 POST 到 `/api/monitoring/events`。
- Node/Koa 接收监控事件并写入本地 JSON。
- 增加 `/api/monitoring/events` 和 `/api/monitoring/summary` 查询接口。
- 在 A2UI Playground 中增加“前端监控后台”入口，点击后新标签页打开独立监控后台。
- 监控后台支持刷新、筛选、搜索、表格列拖拽、表格排序、事件详情展开。
- Vite 代理目标支持 `VITE_API_PROXY_TARGET`，避免固定写死后端端口。

### 修改了哪些文件

- `web/a2ui-playground/package.json`：新增 `@sentry/react` 依赖。
- `web/a2ui-playground/src/main.tsx`：初始化前端监控，并用 ErrorBoundary 包裹 App。
- `web/a2ui-playground/src/App.tsx`：新增监控后台入口、新标签页打开逻辑、运行过程自定义事件上报。
- `web/a2ui-playground/src/App.css`：新增独立监控后台样式、表格拖拽样式。
- `web/a2ui-playground/src/monitoring/client.ts`：Sentry 初始化、本地上报、全局错误捕获、性能采集。
- `web/a2ui-playground/src/monitoring/MonitoringErrorBoundary.tsx`：React 错误边界。
- `web/a2ui-playground/src/monitoring/MonitoringDashboard.tsx`：独立监控后台页面。
- `web/a2ui-playground/vite.config.ts`：代理目标支持环境变量配置。
- `server/a2ui-playground-server/src/index.ts`：挂载 monitoring 路由。
- `server/a2ui-playground-server/src/routes/monitoring.ts`：Node 本地监控事件接收、落盘、查询和汇总。
- `server/a2ui-playground-server/.gitignore`：忽略本地监控 JSON 数据。
- `pnpm-lock.yaml`：记录新增依赖。

### 每个文件的作用

| 文件 | 作用 |
| --- | --- |
| `web/a2ui-playground/src/monitoring/client.ts` | 负责初始化 Sentry、采集全局错误/Promise 错误/性能指标、上报本地 Node 服务 |
| `web/a2ui-playground/src/monitoring/MonitoringErrorBoundary.tsx` | 捕获 React render/lifecycle 子树错误，兜底 UI 并上报 |
| `web/a2ui-playground/src/monitoring/MonitoringDashboard.tsx` | 展示本地监控指标、事件表格、搜索筛选、列拖拽排序 |
| `web/a2ui-playground/src/main.tsx` | 应用启动点，调用 `initFrontendMonitoring()` |
| `web/a2ui-playground/src/App.tsx` | 监控后台入口、URL view 逻辑、业务自定义事件上报 |
| `server/a2ui-playground-server/src/routes/monitoring.ts` | Koa 路由，接收前端监控事件并写入 JSON |
| `server/a2ui-playground-server/src/index.ts` | 注册 monitoring 路由 |
| `web/a2ui-playground/vite.config.ts` | 代理 `/api` 到后端，支持 `VITE_API_PROXY_TARGET` |

### 前端异常监控链路

1. `main.tsx` 调用 `initFrontendMonitoring()`。
2. `client.ts` 初始化 `Sentry.init()`。
3. JS runtime error 通过 `window.addEventListener('error')` 捕获。
4. Promise 未处理异常通过 `window.addEventListener('unhandledrejection')` 捕获。
5. React 渲染异常通过 `MonitoringErrorBoundary.componentDidCatch` 捕获。
6. Sentry `beforeSend` 将异常转成本地监控事件。
7. `sendLocalMonitoringEvent()` 异步 POST 到 `/api/monitoring/events`。
8. Node 服务写入 `server/a2ui-playground-server/data/monitoring-events.json`。
9. 监控后台读取 `/api/monitoring/summary` 和 `/api/monitoring/events` 展示。

### Node.js 本地落盘链路

1. Koa 已在 `src/index.ts` 注册 `createMonitoringRouter()`。
2. `POST /api/monitoring/events` 接收单条或批量事件。
3. `normalizeEvent()` 补齐 `id`、`timestamp`、`receivedAt`、`level`、`source` 等字段。
4. 使用 `writeQueue` 串行化写入，降低并发覆盖风险。
5. `ensureStore()` 自动创建 `data` 目录和 JSON 文件。
6. `writeEvents()` 写入 JSON，并通过 `MAX_STORED_EVENTS` 只保留最新 N 条。

### 如何启动

常规启动：

```bash
pnpm -F a2ui-playground-server dev
pnpm -F a2ui-playground dev
```

如果默认 `3847` 被旧服务占用，可以换端口启动新后端，并让前端代理过去：

```bash
PORT=3857 pnpm -F a2ui-playground-server dev
VITE_API_PROXY_TARGET=http://localhost:3857 pnpm -F a2ui-playground exec vite --host 127.0.0.1 --port 3001
```

前端访问：

```text
http://127.0.0.1:3001/
http://127.0.0.1:3001/?view=monitoring
```

### 如何验证

- 打开 Playground，点击“监控后台”，应在新标签页打开独立后台。
- 后台请求 `/api/monitoring/summary` 返回统计数据。
- 后台请求 `/api/monitoring/events?limit=300` 返回事件列表。
- 访问页面后会产生 performance 事件。
- 点击刷新数据后，统计卡片和表格更新。
- 表格列头可拖拽调整顺序。
- 点击表头可排序。

已执行验证：

```bash
pnpm -F a2ui-playground-server typecheck
pnpm -F a2ui-playground-server build
pnpm -F a2ui-playground exec vite build
curl http://localhost:3857/api/monitoring/summary
curl "http://localhost:3857/api/monitoring/events?limit=3"
```

### 当前还存在什么风险或未完成项

- 生产级脱敏未实现：当前没有系统性处理 token、cookie、authorization、手机号、身份证、邮箱、password、secret。
- IP 限流未实现：当前只有限制存储条数和读取 limit，没有按 IP 的时间窗口限流。
- source map 上传未实现：没有接入 `@sentry/vite-plugin` 和 `sentry:sourcemaps` 脚本。
- 本地 JSON 适合 demo 和本地复盘，不适合高并发生产写入。
- 日志文件切割较简单：目前按最大事件条数截断，不是按日期/文件大小滚动切割。
- 当前 `beforeSend` 会把 Sentry event 的 contexts/exception 写入本地，生产环境必须先脱敏。
- 前端 fallback 到 `localhost:3847/3857` 只适合本地开发，不应该用于线上。

## 2. 改动文件列表

```text
web/a2ui-playground/src/monitoring/client.ts：Sentry 初始化、全局异常捕获、性能采集、本地日志上报
web/a2ui-playground/src/monitoring/MonitoringErrorBoundary.tsx：React 错误边界和兜底 UI
web/a2ui-playground/src/monitoring/MonitoringDashboard.tsx：独立监控后台，含指标卡片、事件表格、拖拽列、排序
web/a2ui-playground/src/main.tsx：启动监控并挂载 ErrorBoundary
web/a2ui-playground/src/App.tsx：新增监控入口、新标签页打开、业务自定义事件上报
web/a2ui-playground/src/App.css：监控后台独立样式和表格拖拽样式
web/a2ui-playground/vite.config.ts：Vite /api 代理目标支持环境变量
web/a2ui-playground/package.json：新增 @sentry/react
server/a2ui-playground-server/src/routes/monitoring.ts：Koa 监控事件接收、落盘、查询、汇总
server/a2ui-playground-server/src/index.ts：挂载 monitoring router
server/a2ui-playground-server/.gitignore：忽略 data/*.json 本地监控数据
pnpm-lock.yaml：依赖锁文件更新
```

## 3. Sentry 初始化代码

见 [key-code.md](./key-code.md) 的“1. Sentry 初始化代码”。

## 4. ErrorBoundary 代码

见 [key-code.md](./key-code.md) 的“2. ErrorBoundary 代码”。

## 5. 前端本地日志上报代码

见 [key-code.md](./key-code.md) 的“3. 前端本地日志上报代码”。

## 6. Node.js 日志服务代码

见 [key-code.md](./key-code.md) 的“4. Node.js 日志接收和落盘代码”。

## 7. 脱敏和限流代码

当前项目没有独立的 `sanitize.ts` 和 `rateLimit.ts`。已有保护只有：

- 前端上报失败静默处理，避免监控系统影响业务。
- 后端 `bodyParser` JSON 限制为 `50mb`，但这个限制偏大，生产应降低到例如 `256kb`。
- 后端 `message.slice(0, 2000)` 限制 message 长度。
- 后端 `parseLimit()` 限制查询最多 1000 条。
- 后端 `MAX_STORED_EVENTS` 默认只保留 5000 条。
- 后端 `writeQueue` 串行化写入，避免并发写覆盖。

生产环境建议补充：

```ts
const SENSITIVE_KEYS = ['token', 'cookie', 'authorization', 'password', 'secret'];
```

并递归处理对象 key，同时用正则处理邮箱、手机号、身份证号。

限流建议：

```ts
// 按 IP + 时间窗口限流，例如 60 秒 120 次。
// 超出后直接 429，并丢弃日志，保护 Node 服务。
```

## 8. package.json scripts

前端：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  }
}
```

后端：

```json
{
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  }
}
```

当前没有 `sentry:sourcemaps` 脚本。生产建议补充：

```json
{
  "sentry:sourcemaps": "sentry-cli sourcemaps upload --org <org> --project <project> ./dist"
}
```

## 9. 环境变量示例

见 [env.example](./env.example)。

## 10. 本地日志样例

见 [local-log-sample.json](./local-log-sample.json)。

## 11. 验证记录

### 1. 手动触发 JS Runtime Error

- 触发方式：可在浏览器控制台执行 `setTimeout(() => { throw new Error('manual runtime error') })`。
- Sentry 是否收到：配置真实 `VITE_SENTRY_DSN` 后应收到；未配置 DSN 时不会发到 Sentry。
- 本地是否落盘：应写入 `data/monitoring-events.json`，类型为 `error`。

### 2. 手动触发 Promise Unhandled Rejection

- 触发方式：浏览器控制台执行 `Promise.reject(new Error('manual promise rejection'))`。
- Sentry 是否收到：配置真实 DSN 后由 Sentry 浏览器集成捕获。
- 本地是否落盘：`window.unhandledrejection` 会写入本地，类型为 `unhandledrejection`。

### 3. 手动触发 React Render Error

- 触发方式：需要在 React 组件 render 阶段抛错。
- Sentry 是否收到：`componentDidCatch` 中调用 `reportFrontendError()`，内部 `Sentry.captureException(error)`。
- ErrorBoundary 是否兜底：会显示“页面运行异常”和“刷新”按钮。
- 本地是否落盘：会通过 `reportFrontendError()` 写入本地。

### 4. 验证脱敏

- 输入了什么敏感字段：尚未做系统性脱敏测试。
- 落盘后变成什么：当前不会自动 mask，生产前必须补。

### 5. 验证限流

- 连续触发多少次：尚未做压测。
- Node 服务是否被打爆：本地 demo 未验证高并发。
- 是否有丢弃策略：只有 `MAX_STORED_EVENTS` 截断历史数据，没有请求级限流。

## 12. 我自己还没搞懂的地方

- Sentry release 如何和 CI/CD 构建版本严格绑定。
- source map 上传后如何隐藏公网 `.map` 文件。
- 前端采集字段哪些应该保留，哪些必须脱敏。
- 高并发错误风暴下，本地 JSON 如何迁移到队列或日志系统。
- Node 监控服务自身异常时，如何自监控和告警。
- 线上日志留存周期、权限控制、审计要求如何制定。

## 13. 其他文件

- [key-code.md](./key-code.md)：关键代码摘录。
- [sentry-monitoring-interview-review.md](./sentry-monitoring-interview-review.md)：面试复盘文档。
- [env.example](./env.example)：环境变量示例。
- [local-log-sample.json](./local-log-sample.json)：本地落盘日志样例。
