import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
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
  schemaVersion: 'monitoring.event.v1';
  id: string;
  timestamp: string;
  receivedAt: string;
  level: MonitoringLevel;
  source: string;
  fingerprint: string;
  pageUrl?: string;
  userAgent?: string;
  release?: string;
  environment?: string;
  tags?: Record<string, string>;
  contexts?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  governance?: {
    sanitized: boolean;
    sanitizedFields?: string[];
    ipHash?: string;
  };
}

const DATA_DIR = path.resolve(__dirname, '../../data');
const EVENTS_FILE = path.join(DATA_DIR, 'monitoring-events.json');
const MAX_STORED_EVENTS = Number(process.env.MONITORING_MAX_EVENTS || 5000);
const MAX_EVENTS_PER_REQUEST = Number(process.env.MONITORING_MAX_EVENTS_PER_REQUEST || 50);
const RATE_LIMIT_WINDOW_MS = Number(process.env.MONITORING_RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.MONITORING_RATE_LIMIT_MAX_REQUESTS || 120);
const INGEST_BUFFER_MAX_EVENTS = Number(process.env.MONITORING_INGEST_BUFFER_MAX_EVENTS || 1000);
const INGEST_FLUSH_INTERVAL_MS = Number(process.env.MONITORING_INGEST_FLUSH_INTERVAL_MS || 1000);
const INGEST_FLUSH_BATCH_SIZE = Number(process.env.MONITORING_INGEST_FLUSH_BATCH_SIZE || 100);
const CIRCUIT_FAILURE_THRESHOLD = Number(process.env.MONITORING_CIRCUIT_FAILURE_THRESHOLD || 3);
const CIRCUIT_OPEN_MS = Number(process.env.MONITORING_CIRCUIT_OPEN_MS || 30_000);

let writeQueue = Promise.resolve();
let ingestBuffer: StoredMonitoringEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let consecutiveWriteFailures = 0;
let circuitOpenedUntil = 0;

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

const SENSITIVE_KEY_PATTERN =
  /token|cookie|authorization|password|passwd|secret|api[-_]?key|session|credential|jwt|openid|access[-_]?key/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const ID_CARD_PATTERN = /(?<!\d)\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g;

interface SanitizedValue {
  value: unknown;
  fields: string[];
}

function newEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stableHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function hashIp(input: string): string {
  const salt = process.env.MONITORING_IP_HASH_SALT || 'a2ui-monitoring-local';
  return stableHash(`${salt}:${input}`);
}

function getClientIp(ctx: Context): string {
  const forwarded = ctx.get('x-forwarded-for').split(',')[0]?.trim();
  return forwarded || ctx.ip || ctx.req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(ctx: Context): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  const key = hashIp(getClientIp(ctx));
  const current = rateLimitBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  current.count += 1;
  if (current.count > RATE_LIMIT_MAX_REQUESTS) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  }
  return { ok: true };
}

function pruneRateLimitBuckets() {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}

function sanitizeString(value: string, pathLabel: string): SanitizedValue {
  const fields: string[] = [];
  let next = value;
  if (next.match(EMAIL_PATTERN)) {
    fields.push(`${pathLabel}:email`);
    next = next.replace(EMAIL_PATTERN, '[Filtered:email]');
  }
  if (next.match(PHONE_PATTERN)) {
    fields.push(`${pathLabel}:phone`);
    next = next.replace(PHONE_PATTERN, '[Filtered:phone]');
  }
  if (next.match(ID_CARD_PATTERN)) {
    fields.push(`${pathLabel}:idCard`);
    next = next.replace(ID_CARD_PATTERN, '[Filtered:idCard]');
  }
  return { value: next, fields };
}

function sanitizeValue(value: unknown, pathLabel = 'root', depth = 0): SanitizedValue {
  if (depth > 6) {
    return { value: '[Truncated:depth]', fields: [`${pathLabel}:depth`] };
  }
  if (typeof value === 'string') {
    const sanitized = sanitizeString(value, pathLabel);
    return {
      value: String(sanitized.value).slice(0, 5000),
      fields: sanitized.fields
    };
  }
  if (value == null || typeof value !== 'object') {
    return { value, fields: [] };
  }
  if (Array.isArray(value)) {
    const fields: string[] = [];
    const next = value.slice(0, 50).map((item, index) => {
      const sanitized = sanitizeValue(item, `${pathLabel}[${index}]`, depth + 1);
      fields.push(...sanitized.fields);
      return sanitized.value;
    });
    if (value.length > 50) fields.push(`${pathLabel}:arrayTruncated`);
    return { value: next, fields };
  }

  const out: Record<string, unknown> = {};
  const fields: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
    const childPath = `${pathLabel}.${key}`;
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = '[Filtered]';
      fields.push(childPath);
      continue;
    }
    const sanitized = sanitizeValue(child, childPath, depth + 1);
    out[key] = sanitized.value;
    fields.push(...sanitized.fields);
  }
  return { value: out, fields };
}

function normalizeType(input?: MonitoringEventType): MonitoringEventType {
  if (
    input === 'error' ||
    input === 'unhandledrejection' ||
    input === 'performance' ||
    input === 'resource' ||
    input === 'custom'
  ) {
    return input;
  }
  return 'custom';
}

function normalizeLevel(input: MonitoringEvent['level'], type: MonitoringEventType): MonitoringLevel {
  if (input === 'debug' || input === 'info' || input === 'warning' || input === 'error' || input === 'fatal') {
    return input;
  }
  return type === 'error' || type === 'unhandledrejection' ? 'error' : 'info';
}

function normalizeTimestamp(input?: string): string {
  if (!input) return new Date().toISOString();
  const t = Date.parse(input);
  if (!Number.isFinite(t)) return new Date().toISOString();
  return new Date(t).toISOString();
}

function sanitizeUrl(input?: string): { value?: string; fields: string[] } {
  if (!input) return { value: undefined, fields: [] };
  const sanitized = sanitizeString(input, 'pageUrl');
  try {
    const url = new URL(String(sanitized.value));
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        url.searchParams.set(key, '[Filtered]');
        sanitized.fields.push(`pageUrl.search.${key}`);
      }
    }
    return { value: url.toString().slice(0, 1200), fields: sanitized.fields };
  } catch {
    return { value: String(sanitized.value).slice(0, 1200), fields: sanitized.fields };
  }
}

function normalizeTags(input?: Record<string, string>): Record<string, string> | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const entries = Object.entries(input).slice(0, 30).map(([key, value]) => [
    key.trim().slice(0, 60),
    String(value).trim().slice(0, 120)
  ]);
  return Object.fromEntries(entries);
}

function eventFingerprint(event: Pick<StoredMonitoringEvent, 'type' | 'message' | 'pageUrl' | 'release'>): string {
  const normalizedMessage = event.message.replace(/\d+/g, '#').slice(0, 240);
  return stableHash([event.type, normalizedMessage, event.pageUrl || '', event.release || ''].join('|'));
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

function normalizeEvent(input: MonitoringEvent, ctx: Context): StoredMonitoringEvent {
  const type = normalizeType(input.type);
  const level = normalizeLevel(input.level, type);
  const messageSource =
    typeof input.message === 'string' && input.message.trim()
      ? input.message.trim().slice(0, 2000)
      : 'monitoring event';
  const message = sanitizeString(messageSource, 'message');
  const contexts = sanitizeValue(input.contexts, 'contexts');
  const extra = sanitizeValue(input.extra, 'extra');
  const pageUrl = sanitizeUrl(input.pageUrl);
  const sanitizedFields = [
    ...message.fields,
    ...contexts.fields,
    ...extra.fields,
    ...pageUrl.fields
  ];

  const event: StoredMonitoringEvent = {
    schemaVersion: 'monitoring.event.v1',
    id: typeof input.id === 'string' && input.id ? input.id : newEventId(),
    timestamp: normalizeTimestamp(input.timestamp),
    receivedAt: new Date().toISOString(),
    type,
    level,
    message: String(message.value),
    source: input.source || 'web',
    fingerprint: '',
    pageUrl: pageUrl.value,
    userAgent: typeof input.userAgent === 'string' ? input.userAgent.slice(0, 500) : undefined,
    release: typeof input.release === 'string' ? input.release.slice(0, 120) : undefined,
    environment: typeof input.environment === 'string' ? input.environment.slice(0, 80) : undefined,
    tags: normalizeTags(input.tags),
    contexts: contexts.value as Record<string, unknown> | undefined,
    extra: extra.value as Record<string, unknown> | undefined,
    governance: {
      sanitized: sanitizedFields.length > 0,
      sanitizedFields: Array.from(new Set(sanitizedFields)).slice(0, 80),
      ipHash: hashIp(getClientIp(ctx))
    }
  };
  event.fingerprint = eventFingerprint(event);
  return event;
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

function isCircuitOpen(): boolean {
  return Date.now() < circuitOpenedUntil;
}

function openCircuit() {
  circuitOpenedUntil = Date.now() + CIRCUIT_OPEN_MS;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    void flushIngestBuffer();
  }, INGEST_FLUSH_INTERVAL_MS);
}

async function flushIngestBuffer(): Promise<void> {
  if (ingestBuffer.length === 0) return;
  const batch = ingestBuffer.splice(0, INGEST_FLUSH_BATCH_SIZE);
  writeQueue = writeQueue.then(async () => {
    try {
      const current = await readEvents();
      await writeEvents([...current, ...batch]);
      consecutiveWriteFailures = 0;
    } catch (e) {
      consecutiveWriteFailures += 1;
      ingestBuffer = [...batch, ...ingestBuffer].slice(0, INGEST_BUFFER_MAX_EVENTS);
      if (consecutiveWriteFailures >= CIRCUIT_FAILURE_THRESHOLD) openCircuit();
    }
  });
  try {
    await writeQueue;
  } catch {
    /* circuit state is updated above */
  }
  if (ingestBuffer.length > 0 && !isCircuitOpen()) scheduleFlush();
}

function enqueueEvents(events: StoredMonitoringEvent[]): { accepted: number; dropped: number } {
  if (isCircuitOpen()) {
    return { accepted: 0, dropped: events.length };
  }
  pruneRateLimitBuckets();
  const capacity = Math.max(0, INGEST_BUFFER_MAX_EVENTS - ingestBuffer.length);
  const acceptedEvents = events.slice(0, capacity);
  const dropped = events.length - acceptedEvents.length;
  ingestBuffer.push(...acceptedEvents);
  if (ingestBuffer.length >= INGEST_FLUSH_BATCH_SIZE) {
    void flushIngestBuffer();
  } else {
    scheduleFlush();
  }
  return { accepted: acceptedEvents.length, dropped };
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
    if (isCircuitOpen()) {
      ctx.status = 503;
      ctx.set('Retry-After', String(Math.ceil((circuitOpenedUntil - Date.now()) / 1000)));
      ctx.body = { error: 'monitoring ingest circuit open' };
      return;
    }

    const rateLimit = checkRateLimit(ctx);
    if (!rateLimit.ok) {
      ctx.status = 429;
      ctx.set('Retry-After', String(rateLimit.retryAfterSeconds));
      ctx.body = { error: 'monitoring ingest rate limited', retryAfterSeconds: rateLimit.retryAfterSeconds };
      return;
    }

    const body = ctx.request.body as MonitoringEvent | MonitoringEvent[] | { events?: MonitoringEvent[] };
    const rawEvents = Array.isArray(body)
      ? body
      : 'events' in body && Array.isArray(body.events)
        ? body.events
        : [body as MonitoringEvent];
    const limitedRawEvents = rawEvents.filter(Boolean).slice(0, MAX_EVENTS_PER_REQUEST);
    const normalized = limitedRawEvents.map((event) => normalizeEvent(event, ctx));
    const result = enqueueEvents(normalized);

    ctx.status = result.accepted > 0 ? 202 : 503;
    ctx.body = {
      ok: result.accepted > 0,
      accepted: result.accepted,
      dropped: result.dropped + Math.max(0, rawEvents.length - limitedRawEvents.length),
      buffered: ingestBuffer.length,
      governance: {
        data: 'sanitized-and-standardized',
        traffic: 'rate-limited-buffered-circuit-protected'
      }
    };
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
