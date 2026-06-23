# A2UI Sentry 前端监控复盘

## 1. 项目背景

A2UI Playground 是一个前端生成和调试 A2UI 协议的应用，核心链路包含用户输入、Agent 请求、SSE 流式响应、协议解析、React 渲染和调试面板。这个链路一旦发生异常，仅靠浏览器控制台很难复盘问题：用户现场不可复现、错误堆栈可能丢失、性能问题没有结构化记录。因此需要接入前端监控。

本次目标不是只配置 Sentry，而是形成一套“前端采集 + Sentry 上报 + Node 本地落盘 + 后台查看”的闭环。

## 2. 本次监控系统解决的问题

- 捕获运行时 JS 异常。
- 捕获未处理 Promise 异常。
- 捕获 React 渲染错误并显示兜底 UI。
- 采集基础性能指标，例如 LCP、CLS、长任务、慢资源。
- 将监控事件写入本地 JSON，便于本地开发和面试复盘。
- 提供独立监控后台，不需要看原始 JSON 文件。
- 支持表格筛选、搜索、排序、列拖拽，方便排查。

## 3. 整体链路

```text
Browser
  -> Sentry.init()
  -> window.error / unhandledrejection / ErrorBoundary / PerformanceObserver
  -> sendLocalMonitoringEvent()
  -> POST /api/monitoring/events
  -> Koa monitoring router
  -> normalizeEvent()
  -> writeQueue serial write
  -> data/monitoring-events.json
  -> GET /api/monitoring/summary
  -> GET /api/monitoring/events
  -> MonitoringDashboard
```

## 4. Sentry 前端接入方案

使用 `@sentry/react`。初始化放在 `web/a2ui-playground/src/monitoring/client.ts`，启动点在 `main.tsx`。

关键配置：

- `dsn`: 来自 `VITE_SENTRY_DSN`。
- `environment`: 使用 `import.meta.env.MODE`。
- `release`: 使用 `VITE_APP_VERSION || 'local'`。
- `tracesSampleRate`: 使用 `VITE_SENTRY_TRACES_SAMPLE_RATE || 0.2`。
- `beforeSend`: 将 Sentry event 转成本地监控事件。

设计点：

- 没有 DSN 时也能工作，本地落盘照常进行。
- 有 DSN 时，事件会同时发往 Sentry。
- 这样本地开发不依赖外部账号，生产又能接真实 Sentry。

## 5. ErrorBoundary 方案

React ErrorBoundary 捕获 render、生命周期、子组件构造函数中的异常。实现位于：

```text
web/a2ui-playground/src/monitoring/MonitoringErrorBoundary.tsx
```

核心逻辑：

- `getDerivedStateFromError` 切换到错误 UI。
- `componentDidCatch` 调用 `reportFrontendError`。
- 兜底 UI 显示“页面运行异常”和刷新按钮。

不能捕获：

- 事件处理函数中的异步异常。
- setTimeout 中的异常。
- Promise rejection。
- 服务端渲染异常。

这些需要 `window.error` 和 `unhandledrejection` 兜底。

## 6. beforeSend 数据处理方案

当前 `beforeSend` 做了两件事：

1. 把 Sentry event 转成本地事件。
2. 如果没有 DSN，返回 `null`，避免向 Sentry 发送。

当前不足：

- 还没有生产级脱敏。
- `contexts` 和 `exception` 可能包含敏感数据。
- 没有按错误类型采样。

生产建议：

- 在 `beforeSend` 中调用 `sanitizeSentryEvent(event)`。
- 对 token、cookie、authorization、password、secret 做 key 级别过滤。
- 对手机号、邮箱、身份证号做 string 级别 mask。
- 对高频错误做采样或合并。

## 7. Node.js 本地落盘方案

后端使用 Koa，新增路由：

```text
POST /api/monitoring/events
GET /api/monitoring/events
GET /api/monitoring/summary
```

落盘文件：

```text
server/a2ui-playground-server/data/monitoring-events.json
```

关键实现：

- `ensureStore()` 自动创建目录和文件。
- `normalizeEvent()` 补齐字段。
- `writeQueue` 串行化写入。
- `MAX_STORED_EVENTS` 限制最大保留数量。

为什么不能浏览器直接落盘：

- 浏览器没有任意文件系统写权限。
- 直接写本地文件不符合 Web 安全模型。
- 必须通过 Node 服务接收和持久化。

## 8. 日志字段设计

当前字段：

- `id`: 事件唯一 ID。
- `timestamp`: 前端事件发生时间。
- `receivedAt`: Node 接收时间。
- `type`: error / unhandledrejection / performance / resource / custom。
- `level`: debug / info / warning / error / fatal。
- `message`: 错误或指标名称。
- `source`: 当前为 web。
- `pageUrl`: 页面 URL。
- `userAgent`: 浏览器信息。
- `release`: 构建版本。
- `environment`: 环境。
- `tags`: 检索标签，例如 metric。
- `contexts`: 上下文，例如 viewport、metrics、error。
- `extra`: 额外信息，例如 Sentry eventId。

有用字段：

- `message`、`stack`、`componentStack` 定位代码问题。
- `release` 定位是否某个版本引入。
- `pageUrl` 定位页面。
- `userAgent` 定位浏览器兼容性。
- `metrics` 定位性能瓶颈。

隐私风险字段：

- `pageUrl` 可能包含 query token。
- `contexts` 可能包含用户输入。
- `extra.exception` 可能包含接口参数。
- `userAgent` 一般风险较低，但仍属于设备信息。

## 9. 脱敏策略

当前未实现生产级脱敏，这是明确风险点。

应该处理：

- token
- cookie
- authorization
- password
- secret
- 手机号
- 身份证号
- 邮箱

建议方案：

- 对对象 key 做大小写不敏感匹配，命中敏感词替换为 `[Filtered]`。
- 对 string 做正则 mask。
- 对 URL query 做白名单保留，默认移除敏感 query。
- 在前端 `beforeSend` 和后端 `normalizeEvent` 双端都做脱敏。

## 10. 限流策略

当前没有按 IP 限流。已有保护：

- Koa bodyParser 有请求体大小限制。
- 查询 limit 最大 1000。
- 本地最多保留 `MONITORING_MAX_EVENTS` 条。
- 写入使用队列串行化。

生产建议：

- 按 IP 做时间窗口限流，例如 60 秒 120 次。
- 按错误 fingerprint 聚合高频错误。
- 前端本地做简单采样，避免错误风暴。
- Node 端超过阈值返回 429。
- 写入失败时不阻塞业务。

## 11. source map 与 release 方案

当前未接入 source map 上传。

生产应该做：

- 每次构建生成唯一 release，例如 `a2ui-playground@1.0.0+<git_sha>`。
- Sentry 初始化使用同一个 release。
- CI 构建后上传 source map 到 Sentry。
- 生产静态资源不公开 `.map` 文件，或者上传后删除。
- Sentry 中通过 release + source map 还原压缩堆栈。

当前缺少：

- `@sentry/vite-plugin`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `sentry:sourcemaps` script

## 12. 开发环境和生产环境差异

开发环境：

- 可以不配置 DSN。
- 事件主要落本地 JSON。
- 前端会 fallback 到 `localhost:3847/3857`。
- 适合调试和复盘。

生产环境：

- 必须配置真实 DSN。
- 不应 fallback 到 localhost。
- 必须脱敏。
- 必须限流。
- 建议接入 source map 上传。
- 本地 JSON 不适合作为长期日志存储，应接入日志平台、对象存储或数据库。

## 13. 监控系统自身稳定性

当前设计中，前端上报失败会静默处理，不影响业务。

已有稳定性设计：

- `try/catch` 包裹上报。
- fetch 异步执行，不 await。
- 多候选监控后端 fallback。
- 后端串行写入避免并发写覆盖。
- 监控后台读取失败会展示错误提示。

不足：

- 没有监控服务自身告警。
- 没有写入失败日志。
- 没有磁盘空间保护。
- 没有请求限流。

## 14. 生产风险点

- 敏感信息泄露。
- 错误风暴打爆 Node 服务。
- JSON 文件过大导致读写变慢。
- 多进程部署时本地文件写入冲突。
- 没有 source map 导致线上堆栈不可读。
- release 不一致导致堆栈无法映射。
- 监控请求和业务接口共用域名时可能互相影响。

## 15. 可优化方向

- 增加 `sanitize.ts`。
- 增加 `rateLimit.ts`。
- 增加日志按日期切割。
- 增加 source map 上传。
- 增加错误 fingerprint 聚合。
- 增加监控后台趋势图。
- 增加按 release、页面、浏览器维度筛选。
- 增加导出 JSON/CSV。
- 将 JSON 存储替换为 SQLite、Loki、ElasticSearch 或对象存储。

## 16. 腾讯中高级前端可能追问的问题

### 1. 为什么需要前端监控？

因为线上问题常发生在用户浏览器环境，服务端日志看不到 JS runtime error、React render error、浏览器性能和资源加载问题。前端监控能补齐用户侧可观测性。

### 2. ErrorBoundary 能捕获所有错误吗？

不能。它只捕获 React 渲染链路中的错误，不能捕获事件回调、异步错误、Promise rejection、setTimeout。异步错误要靠 `window.error` 和 `unhandledrejection`。

### 3. 为什么要本地落盘？

本地落盘适合开发调试、面试复盘和离线查看。即使没有 Sentry 账号或网络，也能看到错误和性能数据。

### 4. 为什么不能浏览器直接写文件？

浏览器安全模型不允许任意写本地文件。必须通过 Node 服务接收数据，再由 Node 写文件。

### 5. beforeSend 有什么作用？

它是 Sentry 发送前的最后处理点，可以做脱敏、过滤、采样、补充 tag，也可以把事件复制一份到本地日志。

### 6. 怎么防止日志泄露？

做字段白名单、敏感 key 过滤、字符串正则 mask、URL query 清洗、权限控制、日志留存周期控制。

### 7. 如果流量大十倍怎么办？

不能继续用 JSON 文件。应该引入队列、批量写入、日志系统或数据库，并加限流、采样和错误聚合。

### 8. source map 为什么重要？

生产 JS 被压缩混淆后，堆栈只有压缩文件行列号。source map 能还原到源码文件、函数和行号。

### 9. source map 有什么安全风险？

如果公开 `.map` 文件，别人可能看到源码。生产应上传到 Sentry 后删除公开 `.map`，或限制访问。

### 10. 这个实现哪些是 demo 级？

本地 JSON 存储、缺少脱敏、缺少 IP 限流、缺少 source map 上传、缺少日志切割，这些都是 demo 级。

### 11. 哪些是接近生产级的？

Sentry 初始化、ErrorBoundary、全局异常捕获、本地上报失败静默、后端串行写入、后台查询展示是可复用基础。

### 12. 上线还需要谁配合？

- DevOps/平台：配置 Sentry org/project/token、CI 上传 source map。
- 后端/平台：提供日志存储、限流、权限控制。
- 安全：确认脱敏规则和日志留存要求。
- 测试：补充异常、性能、限流、脱敏验证用例。
