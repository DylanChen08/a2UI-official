# A2UI Sentry 监控关键代码摘录

## 1. Sentry 初始化代码

来源：`web/a2ui-playground/src/monitoring/client.ts`

```ts
export function initFrontendMonitoring() {
  if (initialized) return;
  initialized = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN;
  Sentry.init({
    dsn: dsn || undefined,
    enabled: true,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || 'local',
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.2),
    beforeSend(event) {
      sendLocalMonitoringEvent({
        type: 'error',
        level: (event.level as LocalMonitoringEvent['level']) || 'error',
        message: event.message || event.exception?.values?.[0]?.value || 'Sentry error',
        tags: Object.fromEntries(
          Object.entries(event.tags || {}).map(([key, value]) => [key, String(value)])
        ),
        contexts: event.contexts,
        extra: {
          eventId: event.event_id,
          exception: event.exception
        }
      });
      return dsn ? event : null;
    }
  });
}
```

说明：

- `dsn` 来自 `VITE_SENTRY_DSN`。
- `environment` 当前使用 `import.meta.env.MODE`。
- `release` 当前使用 `VITE_APP_VERSION || 'local'`。
- `beforeSend` 会把 Sentry event 转成本地事件。
- 未配置 DSN 时，`beforeSend` 返回 `null`，不会发往 Sentry，但会本地落盘。
- 当前没有显式配置 `integrations`，使用 Sentry React 默认集成。

## 2. ErrorBoundary 代码

来源：`web/a2ui-playground/src/monitoring/MonitoringErrorBoundary.tsx`

```tsx
export class MonitoringErrorBoundary extends React.Component<
  React.PropsWithChildren,
  MonitoringErrorBoundaryState
> {
  state: MonitoringErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): MonitoringErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportFrontendError(error, {
      react: {
        componentStack: info.componentStack
      }
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          showIcon
          message="页面运行异常"
          description={this.state.error.message}
          action={
            <Button onClick={() => window.location.reload()} type="primary">
              刷新
            </Button>
          }
        />
      </div>
    );
  }
}
```

挂载位置：`web/a2ui-playground/src/main.tsx`

```tsx
initFrontendMonitoring();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MonitoringErrorBoundary>
      <App />
    </MonitoringErrorBoundary>
  </React.StrictMode>
);
```

## 3. 前端本地日志上报代码

来源：`web/a2ui-playground/src/monitoring/client.ts`

```ts
function sendLocalMonitoringEvent(event: LocalMonitoringEvent) {
  const payload = {
    ...getRuntimeContext(),
    ...event,
    contexts: {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      ...(event.contexts || {})
    }
  };

  try {
    const body = JSON.stringify(payload);
    void (async () => {
      for (const url of getMonitoringApiCandidates(MONITORING_ENDPOINT)) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
            body
          });
          if (res.ok) return;
        } catch {
          /* try next candidate */
        }
      }
    })();
  } catch {
    /* monitoring must never break the app */
  }
}
```

字段结构：

```ts
export interface LocalMonitoringEvent {
  id?: string;
  timestamp?: string;
  type: 'error' | 'unhandledrejection' | 'performance' | 'resource' | 'custom';
  level?: 'debug' | 'info' | 'warning' | 'error' | 'fatal';
  message: string;
  source?: 'web';
  pageUrl?: string;
  userAgent?: string;
  release?: string;
  environment?: string;
  tags?: Record<string, string>;
  contexts?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}
```

失败处理：

- 上报是异步的，不阻塞主流程。
- 上报失败被静默处理。
- 失败后会尝试多个本地候选后端：当前 `/api`、`localhost:3847`、`localhost:3857`。
- 当前没有节流，错误风暴时可能请求过多，这是生产风险。

## 4. 全局异常捕获代码

来源：`web/a2ui-playground/src/monitoring/client.ts`

```ts
window.addEventListener('error', (ev) => {
  const normalized = normalizeError(ev.error || ev.message);
  sendLocalMonitoringEvent({
    type: 'error',
    level: 'error',
    message: normalized.message,
    contexts: {
      error: normalized,
      location: { file: ev.filename, line: ev.lineno, column: ev.colno }
    }
  });
});

window.addEventListener('unhandledrejection', (ev) => {
  const normalized = normalizeError(ev.reason);
  sendLocalMonitoringEvent({
    type: 'unhandledrejection',
    level: 'error',
    message: normalized.message,
    contexts: { error: normalized }
  });
});
```

## 5. 性能采集代码

来源：`web/a2ui-playground/src/monitoring/client.ts`

```ts
const navigation = performance.getEntriesByType('navigation')[0] as
  | PerformanceNavigationTiming
  | undefined;

sendLocalMonitoringEvent({
  type: 'performance',
  level: 'info',
  message: 'navigation',
  tags: { metric: 'navigation' },
  contexts: {
    metrics: {
      dns: Math.round(navigation.domainLookupEnd - navigation.domainLookupStart),
      tcp: Math.round(navigation.connectEnd - navigation.connectStart),
      ttfb: Math.round(navigation.responseStart - navigation.requestStart),
      domContentLoaded: Math.round(navigation.domContentLoadedEventEnd),
      load: Math.round(navigation.loadEventEnd)
    }
  }
});
```

采集项：

- navigation
- largest-contentful-paint
- layout-shift
- longtask
- resource duration > 1000ms

## 6. Node.js 日志接收和落盘代码

来源：`server/a2ui-playground-server/src/routes/monitoring.ts`

```ts
const DATA_DIR = path.resolve(__dirname, '../../data');
const EVENTS_FILE = path.join(DATA_DIR, 'monitoring-events.json');
const MAX_STORED_EVENTS = Number(process.env.MONITORING_MAX_EVENTS || 5000);

let writeQueue = Promise.resolve();

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(EVENTS_FILE);
  } catch {
    await fs.writeFile(EVENTS_FILE, '[]\n', 'utf8');
  }
}

async function readEvents(): Promise<StoredMonitoringEvent[]> {
  await ensureStore();
  try {
    const raw = await fs.readFile(EVENTS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as StoredMonitoringEvent[]) : [];
  } catch {
    return [];
  }
}

async function writeEvents(events: StoredMonitoringEvent[]) {
  await ensureStore();
  const next = events.slice(-MAX_STORED_EVENTS);
  await fs.writeFile(EVENTS_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
}
```

接口代码：

```ts
router.post('/api/monitoring/events', async (ctx: Context) => {
  const body = ctx.request.body as MonitoringEvent | MonitoringEvent[] | { events?: MonitoringEvent[] };
  const rawEvents = Array.isArray(body)
    ? body
    : 'events' in body && Array.isArray(body.events)
      ? body.events
      : [body as MonitoringEvent];
  const normalized = rawEvents.filter(Boolean).map(normalizeEvent);

  writeQueue = writeQueue.then(async () => {
    const current = await readEvents();
    await writeEvents([...current, ...normalized]);
  });

  await writeQueue;
  ctx.status = 201;
  ctx.body = { ok: true, accepted: normalized.length };
});
```

查询代码：

```ts
router.get('/api/monitoring/events', async (ctx: Context) => {
  const events = await readEvents();
  const type = typeof ctx.query.type === 'string' ? ctx.query.type : '';
  const level = typeof ctx.query.level === 'string' ? ctx.query.level : '';
  const limit = parseLimit(ctx);
  const filtered = events.filter((event) => {
    if (type && event.type !== type) return false;
    if (level && event.level !== level) return false;
    return true;
  });
  ctx.body = {
    events: filtered.slice(-limit).reverse(),
    total: filtered.length
  };
});

router.get('/api/monitoring/summary', async (ctx: Context) => {
  const events = await readEvents();
  ctx.body = buildSummary(events);
});
```

## 7. 脱敏代码

当前没有独立脱敏代码。生产建议补充：

```ts
const SENSITIVE_KEYS = [
  'token',
  'cookie',
  'authorization',
  'password',
  'secret',
  'idCard',
  'phone',
  'email'
];

function sanitize(value: unknown): unknown {
  // 递归对象和数组。
  // key 命中敏感词时替换为 '[Filtered]'。
  // string 中命中手机号、身份证、邮箱时做 mask。
}
```

当前风险：`contexts` 和 `extra.exception` 可能包含用户输入、URL 参数、请求字段，生产环境必须先脱敏再落盘。

## 8. 限流 / 防刷代码

当前没有按 IP 的限流中间件。已有轻量保护：

```ts
const MAX_STORED_EVENTS = Number(process.env.MONITORING_MAX_EVENTS || 5000);

function parseLimit(ctx: Context) {
  const raw = Number(ctx.query.limit || 200);
  if (!Number.isFinite(raw)) return 200;
  return Math.max(1, Math.min(1000, Math.floor(raw)));
}
```

生产建议补充：

```ts
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimitByIp(ip: string, limit = 120, windowMs = 60_000) {
  // 同一 IP 在一个时间窗口内超过 limit 后返回 429。
}
```

## 9. 日志落盘格式

当前落盘文件：

```text
server/a2ui-playground-server/data/monitoring-events.json
```

写入格式：

```json
[
  {
    "id": "evt-1782123603338-duh3nhfg",
    "timestamp": "2026-06-22T10:20:03.338Z",
    "receivedAt": "2026-06-22T10:20:03.338Z",
    "type": "custom",
    "level": "info",
    "message": "codex-monitoring-smoke",
    "source": "web",
    "pageUrl": "http://localhost:3000/",
    "tags": {
      "metric": "smoke"
    }
  }
]
```

并发处理：`writeQueue` 串行写入。

文件过大处理：保留最近 `MONITORING_MAX_EVENTS` 条，默认 5000。

日志切割：当前没有按日期或文件大小切割。

写入失败：当前会抛到 Koa 请求，生产应记录服务端错误并返回 500，同时不能影响主业务。

## 10. package.json scripts

前端：

```json
{
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit"
}
```

后端：

```json
{
  "dev": "ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "typecheck": "tsc --noEmit"
}
```

当前没有 source map 上传脚本。
