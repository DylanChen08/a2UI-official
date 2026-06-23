import fs from 'fs/promises';
import path from 'path';
import type { Context } from 'koa';
import Router from 'koa-router';
import { getDefaultChatModel, getOpenAiCompatibleClient } from '../provider';

type MonitoringLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';
type MonitoringEventType = 'error' | 'unhandledrejection' | 'performance' | 'resource' | 'custom';

interface MonitoringEvent {
  id?: string;
  timestamp?: string;
  type?: MonitoringEventType;
  level?: MonitoringLevel;
  message?: string;
  source?: string;
  pageUrl?: string;
  userAgent?: string;
  release?: string;
  environment?: string;
  tags?: Record<string, string>;
  contexts?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

interface StoredMonitoringEvent extends Required<Pick<MonitoringEvent, 'type' | 'message'>> {
  id: string;
  timestamp: string;
  receivedAt: string;
  level: MonitoringLevel;
  source: string;
  pageUrl?: string;
  userAgent?: string;
  release?: string;
  environment?: string;
  tags?: Record<string, string>;
  contexts?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

const DATA_DIR = path.resolve(__dirname, '../../data');
const EVENTS_FILE = path.join(DATA_DIR, 'monitoring-events.json');
const MAX_STORED_EVENTS = Number(process.env.MONITORING_MAX_EVENTS || 5000);

let writeQueue = Promise.resolve();

function newEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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

function normalizeEvent(input: MonitoringEvent): StoredMonitoringEvent {
  const type = input.type || 'custom';
  const message =
    typeof input.message === 'string' && input.message.trim()
      ? input.message.trim().slice(0, 2000)
      : 'monitoring event';

  return {
    id: typeof input.id === 'string' && input.id ? input.id : newEventId(),
    timestamp:
      typeof input.timestamp === 'string' && input.timestamp
        ? input.timestamp
        : new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    type,
    level: input.level || (type === 'error' || type === 'unhandledrejection' ? 'error' : 'info'),
    message,
    source: input.source || 'web',
    pageUrl: input.pageUrl,
    userAgent: input.userAgent,
    release: input.release,
    environment: input.environment,
    tags: input.tags,
    contexts: input.contexts,
    extra: input.extra
  };
}

function countBy(events: StoredMonitoringEvent[], getter: (event: StoredMonitoringEvent) => string) {
  return events.reduce<Record<string, number>>((acc, event) => {
    const key = getter(event) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function getPageKey(event: StoredMonitoringEvent): string {
  if (!event.pageUrl) return 'unknown';
  try {
    return new URL(event.pageUrl).pathname || '/';
  } catch {
    return event.pageUrl;
  }
}

function getMetricNumber(event: StoredMonitoringEvent, key: string): number | undefined {
  const metrics = (event.contexts?.metrics || {}) as Record<string, unknown>;
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function average(values: number[]) {
  if (values.length === 0) return undefined;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildSummary(events: StoredMonitoringEvent[]) {
  const now = Date.now();
  const last24h = events.filter((event) => {
    const t = Date.parse(event.timestamp);
    return Number.isFinite(t) && now - t <= 24 * 60 * 60 * 1000;
  });
  const navigationEvents = events.filter((event) => event.tags?.metric === 'navigation');
  const lcpEvents = events.filter((event) => event.tags?.metric === 'lcp');
  const clsEvents = events.filter((event) => event.tags?.metric === 'cls');

  return {
    total: events.length,
    last24h: last24h.length,
    errorsLast24h: last24h.filter(
      (event) => event.type === 'error' || event.type === 'unhandledrejection' || event.level === 'error'
    ).length,
    byType: countBy(events, (event) => event.type),
    byLevel: countBy(events, (event) => event.level),
    pages: countBy(events, getPageKey),
    latestEvents: events.slice(-20).reverse(),
    lastEventAt: events.length ? events[events.length - 1].timestamp : undefined,
    metrics: {
      avgTtfb: average(navigationEvents.map((event) => getMetricNumber(event, 'ttfb')).filter((v): v is number => v != null)),
      avgLoad: average(navigationEvents.map((event) => getMetricNumber(event, 'load')).filter((v): v is number => v != null)),
      latestLcp: lcpEvents.length ? getMetricNumber(lcpEvents[lcpEvents.length - 1], 'value') : undefined,
      clsTotal: Number(
        clsEvents
          .map((event) => getMetricNumber(event, 'value') || 0)
          .reduce((sum, value) => sum + value, 0)
          .toFixed(4)
      ),
      slowResources: events.filter((event) => event.tags?.metric === 'slow-resource').length,
      longTasks: events.filter((event) => event.tags?.metric === 'longtask').length
    },
    store: {
      file: EVENTS_FILE,
      maxEvents: MAX_STORED_EVENTS
    }
  };
}

function parseLimit(ctx: Context) {
  const raw = Number(ctx.query.limit || 200);
  if (!Number.isFinite(raw)) return 200;
  return Math.max(1, Math.min(1000, Math.floor(raw)));
}

function buildAnalysisPayload(events: StoredMonitoringEvent[]) {
  const summary = buildSummary(events);
  const latestEvents = events.slice(-80).reverse().map((event) => ({
    timestamp: event.timestamp,
    type: event.type,
    level: event.level,
    message: event.message,
    pageUrl: event.pageUrl,
    release: event.release,
    environment: event.environment,
    tags: event.tags,
    metrics: event.contexts?.metrics,
    error: event.contexts?.error
      ? {
          name: (event.contexts.error as Record<string, unknown>).name,
          message: (event.contexts.error as Record<string, unknown>).message,
          stack: String((event.contexts.error as Record<string, unknown>).stack || '').slice(0, 1200)
        }
      : undefined
  }));

  return {
    summary,
    latestEvents
  };
}

function buildMonitoringAnalysisPrompt(payload: ReturnType<typeof buildAnalysisPayload>) {
  return [
    '你是 A2UI Playground 的前端监控值班工程师。请基于下面的监控汇总和最近事件生成“处置结果”。',
    '',
    '要求：',
    '1. 用中文输出。',
    '2. 不要泛泛而谈，要结合事件类型、级别、页面、性能指标、错误消息。',
    '3. 如果没有明显错误，也要给出当前健康状态和后续观察点。',
    '4. 输出结构必须包含：',
    '   - 结论',
    '   - 影响范围',
    '   - 可能原因',
    '   - 优先级',
    '   - 处置步骤',
    '   - 需要继续观察的指标',
    '   - 给研发的建议',
    '5. 如果数据不足，请明确说明缺什么数据。',
    '',
    '监控数据 JSON：',
    JSON.stringify(payload, null, 2)
  ].join('\n');
}

export function createMonitoringRouter(): Router {
  const router = new Router();

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

  router.post('/api/monitoring/analyze', async (ctx: Context) => {
    const client = getOpenAiCompatibleClient();
    if (!client) {
      ctx.status = 503;
      ctx.body = {
        error:
          'LLM 未配置：请在 .env 中设置 KIMI_API_KEY、OPENAI_API_KEY，或兼容网关的 LLM_API_KEY + LLM_BASE_URL'
      };
      return;
    }

    const events = await readEvents();
    const payload = buildAnalysisPayload(events);
    const model = getDefaultChatModel();

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content:
              '你是资深前端稳定性工程师，擅长根据监控数据判断故障影响、定位方向和处置动作。'
          },
          {
            role: 'user',
            content: buildMonitoringAnalysisPrompt(payload)
          }
        ]
      });
      ctx.body = {
        model,
        generatedAt: new Date().toISOString(),
        analysis: completion.choices[0]?.message?.content || '模型未返回分析结果',
        input: {
          totalEvents: events.length,
          analyzedEvents: payload.latestEvents.length,
          summary: payload.summary
        }
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      ctx.status = 502;
      ctx.body = { error: message };
    }
  });

  return router;
}
