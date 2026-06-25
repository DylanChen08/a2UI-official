import * as Sentry from '@sentry/react';

export type MonitoringEventType =
  | 'js_error'
  | 'promise_error'
  | 'api_error'
  | 'performance'
  | 'business';

export type MonitoringLevel = 'info' | 'warning' | 'error' | 'fatal';

export interface LocalMonitoringEvent {
  id?: string;
  timestamp?: string;
  type: MonitoringEventType;
  level?: MonitoringLevel;
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

const MONITORING_ENDPOINT = '/api/monitoring/events';
let initialized = false;
const INFO_SAMPLE_RATE = Number(import.meta.env.VITE_MONITORING_INFO_SAMPLE_RATE || 0.1);
const DEBUG_ENABLED =
  import.meta.env.DEV || import.meta.env.VITE_MONITORING_DEBUG === '1';

const SENSITIVE_KEY_PATTERN =
  /token|cookie|authorization|password|passwd|secret|api[-_]?key|session|credential|jwt|openid|access[-_]?key/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const ID_CARD_PATTERN = /(?<!\d)\d{6}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g;

function isLocalHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function getMonitoringApiCandidates(pathname: string): string[] {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const candidates = [path];
  if (isLocalHost(window.location.hostname)) {
    candidates.push(`http://localhost:3847${path}`);
    candidates.push(`http://localhost:3857${path}`);
  }
  return Array.from(new Set(candidates));
}

export async function fetchMonitoringJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  let lastError: unknown;
  for (const url of getMonitoringApiCandidates(pathname)) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        lastError = new Error(`${url} ${res.status}`);
        continue;
      }
      return (await res.json()) as T;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || '监控接口不可用'));
}

function getRuntimeContext() {
  const url = new URL(window.location.href);
  for (const key of Array.from(url.searchParams.keys())) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      url.searchParams.set(key, '[Filtered]');
    }
  }
  return {
    timestamp: new Date().toISOString(),
    source: 'web' as const,
    pageUrl: sanitizeString(url.toString()),
    userAgent: navigator.userAgent,
    release: import.meta.env.VITE_APP_VERSION || 'local',
    environment: import.meta.env.MODE || 'development'
  };
}

function sanitizeString(value: string): string {
  const masked = value
    .replace(EMAIL_PATTERN, '[Filtered:email]')
    .replace(PHONE_PATTERN, '[Filtered:phone]')
    .replace(ID_CARD_PATTERN, '[Filtered:idCard]');
  try {
    const url = new URL(masked);
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        url.searchParams.set(key, '[Filtered]');
      }
    }
    return url.toString();
  } catch {
    return masked;
  }
}

function sanitizeMonitoringPayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Truncated:depth]';
  if (typeof value === 'string') return sanitizeString(value).slice(0, 5000);
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeMonitoringPayload(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = '[Filtered]';
      continue;
    }
    out[key] = sanitizeMonitoringPayload(child, depth + 1);
  }
  return out;
}

function normalizeMonitoringLevel(level: unknown, type: MonitoringEventType): MonitoringLevel | null {
  if (level === 'fatal' || level === 'error' || level === 'warning' || level === 'info') return level;
  if (level === 'debug') return DEBUG_ENABLED ? 'info' : null;
  return type === 'js_error' || type === 'promise_error' || type === 'api_error' ? 'error' : 'info';
}

function shouldSampleEvent(level: MonitoringLevel): boolean {
  if (!import.meta.env.PROD) return true;
  if (level !== 'info') return true;
  if (INFO_SAMPLE_RATE >= 1) return true;
  if (INFO_SAMPLE_RATE <= 0) return false;
  return Math.random() < INFO_SAMPLE_RATE;
}

function sendLocalMonitoringEvent(event: LocalMonitoringEvent) {
  const level = normalizeMonitoringLevel(event.level, event.type);
  if (!level || !shouldSampleEvent(level)) return;
  const payload = sanitizeMonitoringPayload({
    ...getRuntimeContext(),
    ...event,
    level,
    contexts: {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      ...(event.contexts || {})
    }
  }) as LocalMonitoringEvent;

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

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
  }
  return {
    message: typeof error === 'string' ? error : JSON.stringify(error),
    name: 'UnknownError',
    stack: undefined
  };
}

function observePerformance() {
  try {
    const navigation = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navigation) {
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
    }
  } catch {
    /* ignore */
  }

  if (!('PerformanceObserver' in window)) return;

  const observerMap: Array<{
    type: string;
    handler: (entry: PerformanceEntry) => void;
  }> = [
    {
      type: 'largest-contentful-paint',
      handler: (entry) =>
        sendLocalMonitoringEvent({
          type: 'performance',
          level: 'info',
          message: 'largest-contentful-paint',
          tags: { metric: 'lcp' },
          contexts: { metrics: { value: Math.round(entry.startTime) } }
        })
    },
    {
      type: 'layout-shift',
      handler: (entry) => {
        const layoutShift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        if (layoutShift.hadRecentInput) return;
        sendLocalMonitoringEvent({
          type: 'performance',
          level: 'info',
          message: 'layout-shift',
          tags: { metric: 'cls' },
          contexts: { metrics: { value: Number((layoutShift.value ?? 0).toFixed(4)) } }
        });
      }
    },
    {
      type: 'longtask',
      handler: (entry) =>
        sendLocalMonitoringEvent({
          type: 'performance',
          level: 'warning',
          message: 'longtask',
          tags: { metric: 'longtask' },
          contexts: { metrics: { duration: Math.round(entry.duration) } }
        })
    },
    {
      type: 'resource',
      handler: (entry) => {
        if (entry.duration < 1000) return;
        sendLocalMonitoringEvent({
          type: 'performance',
          level: 'warning',
          message: entry.name,
          tags: { metric: 'slow-resource' },
          contexts: {
            metrics: {
              duration: Math.round(entry.duration),
              initiatorType: (entry as PerformanceResourceTiming).initiatorType
            }
          }
        });
      }
    }
  ];

  observerMap.forEach(({ type, handler }) => {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach(handler);
      });
      observer.observe({ type, buffered: true });
    } catch {
      /* unsupported entry type */
    }
  });
}

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
        type: 'js_error',
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

  window.addEventListener('error', (ev) => {
    const normalized = normalizeError(ev.error || ev.message);
    sendLocalMonitoringEvent({
      type: 'js_error',
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
      type: 'promise_error',
      level: 'error',
      message: normalized.message,
      contexts: { error: normalized }
    });
  });

  window.setTimeout(observePerformance, 0);
}

export function reportFrontendError(error: unknown, context?: Record<string, unknown>) {
  const normalized = normalizeError(error);
  Sentry.captureException(error);
  sendLocalMonitoringEvent({
    type: 'js_error',
    level: 'error',
    message: normalized.message,
    contexts: {
      error: normalized,
      ...(context || {})
    }
  });
}

export function reportCustomMonitoringEvent(
  message: string,
  extra?: Record<string, unknown>,
  level: LocalMonitoringEvent['level'] = 'info'
) {
  Sentry.addBreadcrumb({ message, level });
  sendLocalMonitoringEvent({
    type: 'business',
    level,
    message,
    extra
  });
}
