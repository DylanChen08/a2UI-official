# A2UI 监控链路治理增强总结

本次围绕监控后台数据链路做了两类增强：

1. 数据治理：脱敏 + 标准化
2. 流量治理：限流 + 熔断 + 削峰

改动集中在后端监控入口：

```text
server/a2ui-playground-server/src/routes/monitoring.ts
```

前端监控后台、AI 分析、轮询、表格筛选排序等功能逻辑没有改变。

## 1. 数据治理

### 1.1 脱敏范围

监控事件进入 Node API 后，会在写入本地 JSON 前进行递归脱敏。

当前支持处理：

- token
- cookie
- authorization
- password
- passwd
- secret
- apiKey / api_key / api-key
- session
- credential
- jwt
- openid
- accessKey / access_key / access-key
- 邮箱
- 手机号
- 身份证号
- URL query 中的敏感 key

示例：

```json
{
  "message": "user test@example.com phone 13800138000 failed",
  "pageUrl": "http://localhost:3001/?token=abc123&safe=1",
  "contexts": {
    "authorization": "Bearer secret-token",
    "profile": {
      "email": "a2ui@example.com",
      "phone": "13900139000"
    }
  },
  "extra": {
    "password": "123456"
  }
}
```

落盘后：

```json
{
  "message": "user [Filtered:email] phone [Filtered:phone] failed",
  "pageUrl": "http://localhost:3001/?token=%5BFiltered%5D&safe=1",
  "contexts": {
    "authorization": "[Filtered]",
    "profile": {
      "email": "[Filtered:email]",
      "phone": "[Filtered:phone]"
    }
  },
  "extra": {
    "password": "[Filtered]"
  }
}
```

### 1.2 标准化字段

所有写入本地 JSON 的事件会统一成 `monitoring.event.v1` 结构。

新增/标准化字段：

```ts
{
  schemaVersion: 'monitoring.event.v1',
  id: string,
  timestamp: string,
  receivedAt: string,
  type: 'error' | 'unhandledrejection' | 'performance' | 'resource' | 'custom',
  level: 'debug' | 'info' | 'warning' | 'error' | 'fatal',
  source: string,
  fingerprint: string,
  pageUrl?: string,
  userAgent?: string,
  release?: string,
  environment?: string,
  tags?: Record<string, string>,
  contexts?: Record<string, unknown>,
  extra?: Record<string, unknown>,
  governance?: {
    sanitized: boolean,
    sanitizedFields?: string[],
    ipHash?: string
  }
}
```

### 1.3 标准化策略

- `type` 不合法时回退为 `custom`。
- `level` 不合法时根据 `type` 推断。
- `timestamp` 不合法时使用当前服务端时间。
- `message` 最大保留 2000 字符。
- 字符串字段会限制长度，避免异常大字段撑爆日志。
- `tags` 最多保留 30 个 key。
- `contexts` 和 `extra` 最多递归 6 层。
- 数组最多保留 50 项。
- 对象最多保留 80 个字段。
- `pageUrl` 会清理敏感 query。
- `fingerprint` 基于 `type + message + pageUrl + release` 生成，用于后续错误聚合。
- `ipHash` 使用 hash 后的 IP，不直接落真实 IP。

## 2. 流量治理

### 2.1 按 IP 限流

新增按 IP 的时间窗口限流。

默认配置：

```text
MONITORING_RATE_LIMIT_WINDOW_MS=60000
MONITORING_RATE_LIMIT_MAX_REQUESTS=120
```

含义：

```text
同一个 IP 60 秒最多提交 120 次监控上报请求。
```

超过限制时：

```http
HTTP 429 Too Many Requests
Retry-After: <seconds>
```

响应示例：

```json
{
  "error": "monitoring ingest rate limited",
  "retryAfterSeconds": 42
}
```

### 2.2 单次请求削峰

单次请求最多接受固定数量事件。

默认配置：

```text
MONITORING_MAX_EVENTS_PER_REQUEST=50
```

超过部分会被丢弃，并在响应里返回 `dropped` 数量。

### 2.3 内存缓冲削峰

以前每次上报都会触发一次读 JSON + 写 JSON。现在改成内存缓冲 + 批量 flush。

默认配置：

```text
MONITORING_INGEST_BUFFER_MAX_EVENTS=1000
MONITORING_INGEST_FLUSH_INTERVAL_MS=1000
MONITORING_INGEST_FLUSH_BATCH_SIZE=100
```

策略：

- 请求进来后先进入 `ingestBuffer`。
- 立即返回 `202 Accepted`，避免请求等待磁盘写入。
- 每 1 秒 flush 一次。
- 缓冲达到 100 条时提前 flush。
- 缓冲最多保留 1000 条。
- 超出缓冲容量的事件会被丢弃，并计入 `dropped`。

响应示例：

```json
{
  "ok": true,
  "accepted": 1,
  "dropped": 0,
  "buffered": 1,
  "governance": {
    "data": "sanitized-and-standardized",
    "traffic": "rate-limited-buffered-circuit-protected"
  }
}
```

### 2.4 写入熔断

如果连续写入本地 JSON 失败，会打开熔断器。

默认配置：

```text
MONITORING_CIRCUIT_FAILURE_THRESHOLD=3
MONITORING_CIRCUIT_OPEN_MS=30000
```

含义：

```text
连续 3 次写入失败后，30 秒内拒绝新的监控写入。
```

熔断打开时：

```http
HTTP 503 Service Unavailable
Retry-After: <seconds>
```

响应示例：

```json
{
  "error": "monitoring ingest circuit open"
}
```

### 2.5 串行写入保护

仍然保留 `writeQueue`，确保批量 flush 写文件时串行执行，避免并发写覆盖 JSON 文件。

## 3. 配置项汇总

| 环境变量 | 默认值 | 说明 |
| --- | ---: | --- |
| `MONITORING_MAX_EVENTS` | `5000` | 本地 JSON 最多保留事件数 |
| `MONITORING_MAX_EVENTS_PER_REQUEST` | `50` | 单次上报最多接受事件数 |
| `MONITORING_RATE_LIMIT_WINDOW_MS` | `60000` | IP 限流窗口 |
| `MONITORING_RATE_LIMIT_MAX_REQUESTS` | `120` | 单 IP 每窗口最大请求数 |
| `MONITORING_INGEST_BUFFER_MAX_EVENTS` | `1000` | 削峰缓冲最大事件数 |
| `MONITORING_INGEST_FLUSH_INTERVAL_MS` | `1000` | 缓冲 flush 间隔 |
| `MONITORING_INGEST_FLUSH_BATCH_SIZE` | `100` | 单次 flush 最大事件数 |
| `MONITORING_CIRCUIT_FAILURE_THRESHOLD` | `3` | 连续写失败多少次后熔断 |
| `MONITORING_CIRCUIT_OPEN_MS` | `30000` | 熔断打开时长 |
| `MONITORING_IP_HASH_SALT` | `a2ui-monitoring-local` | IP hash salt |

## 4. 验证记录

### 4.1 TypeScript 验证

```bash
pnpm -F a2ui-playground-server typecheck
```

结果：通过。

### 4.2 前端构建验证

```bash
pnpm -F a2ui-playground exec vite build
```

结果：通过。

### 4.3 接口验证

临时启动后端：

```bash
PORT=3860 pnpm -F a2ui-playground-server dev
```

发送包含敏感信息的事件：

```bash
curl -s -X POST http://localhost:3860/api/monitoring/events \
  -H 'Content-Type: application/json' \
  --data '{
    "type":"error",
    "level":"error",
    "message":"user test@example.com phone 13800138000 failed",
    "pageUrl":"http://localhost:3001/?token=abc123&safe=1",
    "tags":{"feature":"governance"},
    "contexts":{
      "authorization":"Bearer secret-token",
      "profile":{"email":"a2ui@example.com","phone":"13900139000"}
    },
    "extra":{"password":"123456","note":"ok"}
  }'
```

响应：

```json
{
  "ok": true,
  "accepted": 1,
  "dropped": 0,
  "buffered": 1,
  "governance": {
    "data": "sanitized-and-standardized",
    "traffic": "rate-limited-buffered-circuit-protected"
  }
}
```

读取最近事件：

```bash
curl -s 'http://localhost:3860/api/monitoring/events?limit=1'
```

结果确认：

- `message` 中邮箱、手机号已过滤。
- `pageUrl` 中 `token` 已过滤。
- `contexts.authorization` 已过滤。
- `contexts.profile.email` 已过滤。
- `contexts.profile.phone` 已过滤。
- `extra.password` 已过滤。
- 事件包含 `schemaVersion`。
- 事件包含 `fingerprint`。
- 事件包含 `governance.sanitizedFields`。
- 事件只保存 `ipHash`，不保存真实 IP。

## 5. 当前实现级别

### 已完成

- 后端入口统一脱敏。
- 监控事件标准化。
- 敏感字段记录审计信息。
- IP hash 化。
- IP 时间窗口限流。
- 单请求事件数限制。
- 内存缓冲削峰。
- 批量 flush。
- 写入失败熔断。
- 串行写文件保护。

### 仍需生产化增强

- 当前存储仍是本地 JSON，不适合多实例或高并发生产环境。
- 进程重启会丢失内存缓冲区中尚未 flush 的事件。
- 限流状态在内存中，多实例部署时需要 Redis 等共享存储。
- 熔断状态在内存中，多实例部署时同样需要共享状态。
- 脱敏规则需要安全团队确认，避免误脱敏或漏脱敏。
- 对不同事件类型还可以做差异化采样，例如 performance 可采样，error 不采样。
- 可以增加 fingerprint 聚合统计，减少重复错误刷屏。

## 6. 推荐下一步

1. 将本地 JSON 存储替换为 SQLite / PostgreSQL / 日志平台。
2. 将限流 bucket 和熔断状态接入 Redis。
3. 增加按 fingerprint 的错误聚合和采样。
4. 增加监控治理状态接口，例如 `/api/monitoring/governance`。
5. 把脱敏规则同步到前端 `beforeSend`，形成前后端双层保护。
6. 接入 source map 上传和 release 管理，提升线上定位能力。
