import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Flex, Input, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ReactMarkdown from 'react-markdown';
import { fetchMonitoringJson, reportCustomMonitoringEvent } from './client';

const { Text, Title } = Typography;

type ColumnKey = 'timestamp' | 'type' | 'level' | 'message' | 'metric';
type MonitoringTheme = 'dark' | 'light';
type TrendRange = 'day' | 'hour' | 'minute';

const DEFAULT_COLUMN_ORDER: ColumnKey[] = ['timestamp', 'type', 'level', 'message', 'metric'];
const MONITORING_POLL_INTERVAL_MS = 60_000;

interface MonitoringEvent {
  id: string;
  timestamp: string;
  receivedAt: string;
  type: string;
  level?: string;
  message: string;
  pageUrl?: string;
  release?: string;
  environment?: string;
  tags?: Record<string, string>;
  contexts?: Record<string, unknown>;
}

interface MonitoringSummary {
  total: number;
  last24h: number;
  errorsLast24h: number;
  byType: Record<string, number>;
  byLevel: Record<string, number>;
  pages: Record<string, number>;
  latestEvents: MonitoringEvent[];
  metrics: {
    avgTtfb?: number;
    avgLoad?: number;
    latestLcp?: number;
    clsTotal?: number;
    slowResources: number;
    longTasks: number;
  };
}

interface MonitoringAnalysisResult {
  model: string;
  generatedAt: string;
  analysis: string;
  input?: {
    totalEvents: number;
    analyzedEvents: number;
  };
}

function formatTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function metricValue(event: MonitoringEvent) {
  const metrics = (event.contexts?.metrics || {}) as Record<string, unknown>;
  if (typeof metrics.value === 'number') return metrics.value;
  if (typeof metrics.duration === 'number') return `${metrics.duration}ms`;
  if (typeof metrics.load === 'number') return `${metrics.load}ms`;
  return '-';
}

function metricSortValue(event: MonitoringEvent) {
  const metrics = (event.contexts?.metrics || {}) as Record<string, unknown>;
  if (typeof metrics.value === 'number') return metrics.value;
  if (typeof metrics.duration === 'number') return metrics.duration;
  if (typeof metrics.load === 'number') return metrics.load;
  return -1;
}

function compareText(a?: string, b?: string) {
  return String(a || '').localeCompare(String(b || ''));
}

function formatCompactNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString('en-US') : '0';
}

function formatDuration(value?: number) {
  if (value == null || !Number.isFinite(value) || value < 0) return '-';
  if (value >= 1000) return `${Number(value / 1000).toFixed(value >= 10_000 ? 0 : 2)} s`;
  return `${Math.round(value)} ms`;
}

function getMetricNumber(event: MonitoringEvent, key: string) {
  const metrics = (event.contexts?.metrics || {}) as Record<string, unknown>;
  const value = metrics[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildLinePath(values: number[], width: number, height: number, padding = 6) {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
      const y = padding + (1 - (value - min) / span) * (height - padding * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function MonitoringDashboard({ onBack }: { onBack?: () => void }) {
  const [summary, setSummary] = useState<MonitoringSummary | null>(null);
  const [events, setEvents] = useState<MonitoringEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [columnOrder, setColumnOrder] = useState<ColumnKey[]>(DEFAULT_COLUMN_ORDER);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnKey | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [analysisResult, setAnalysisResult] = useState<MonitoringAnalysisResult | null>(null);
  const [theme, setTheme] = useState<MonitoringTheme>('light');
  const [trendRange, setTrendRange] = useState<TrendRange>('hour');

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError('');
    try {
      const [summaryData, eventData] = await Promise.all([
        fetchMonitoringJson<MonitoringSummary>('/api/monitoring/summary'),
        fetchMonitoringJson<{ events: MonitoringEvent[] }>('/api/monitoring/events?limit=300')
      ]);
      setSummary(summaryData);
      setEvents(eventData.events || []);
      reportCustomMonitoringEvent('monitoring-dashboard-opened', { eventCount: eventData.events?.length ?? 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const generateAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError('');
    try {
      const result = await fetchMonitoringJson<MonitoringAnalysisResult>('/api/monitoring/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      setAnalysisResult(result);
      reportCustomMonitoringEvent('monitoring-ai-analysis-generated', {
        model: result.model,
        analyzedEvents: result.input?.analyzedEvents
      });
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    let timer: ReturnType<typeof window.setInterval> | undefined;

    const stopPolling = () => {
      if (timer) {
        window.clearInterval(timer);
        timer = undefined;
      }
    };

    const startPolling = () => {
      stopPolling();
      if (document.hidden) return;
      timer = window.setInterval(() => {
        void loadData({ silent: true });
      }, MONITORING_POLL_INTERVAL_MS);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }
      void loadData({ silent: true });
      startPolling();
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadData]);

  const filteredEvents = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return events.filter((event) => {
      if (typeFilter !== 'all' && event.type !== typeFilter) return false;
      if (!q) return true;
      return [event.message, event.pageUrl, event.release, event.environment, event.level, event.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [events, keyword, typeFilter]);

  const moveColumn = (from: ColumnKey, to: ColumnKey) => {
    if (from === to) return;
    setColumnOrder((prev) => {
      const next = prev.filter((key) => key !== from);
      const targetIndex = next.indexOf(to);
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, from);
      return next;
    });
  };

  const draggableTitle = (key: ColumnKey, label: string) => (
    <span
      draggable
      className={dragOverColumn === key ? 'monitoring-column-title is-drag-over' : 'monitoring-column-title'}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', key);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDragOverColumn(key);
      }}
      onDragLeave={() => setDragOverColumn((current) => (current === key ? null : current))}
      onDrop={(event) => {
        event.preventDefault();
        const from = event.dataTransfer.getData('text/plain') as ColumnKey;
        setDragOverColumn(null);
        if (DEFAULT_COLUMN_ORDER.includes(from)) moveColumn(from, key);
      }}
      onDragEnd={() => setDragOverColumn(null)}
    >
      <span className="monitoring-column-grip">⋮⋮</span>
      {label}
    </span>
  );

  const columnMap: Record<ColumnKey, ColumnsType<MonitoringEvent>[number]> = {
    timestamp: {
      title: draggableTitle('timestamp', '时间'),
      key: 'timestamp',
      dataIndex: 'timestamp',
      width: 180,
      sorter: (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
      defaultSortOrder: 'descend',
      render: (value: string) => <Text>{formatTime(value)}</Text>
    },
    type: {
      title: draggableTitle('type', '类型'),
      key: 'type',
      dataIndex: 'type',
      width: 140,
      sorter: (a, b) => compareText(a.type, b.type),
      render: (value: string, record) => (
        <Space>
          <Tag color={value === 'js_error' || value === 'promise_error' || value === 'api_error' ? 'red' : value === 'performance' ? 'blue' : 'default'}>
            {value}
          </Tag>
          {record.tags?.metric ? <Tag>{record.tags.metric}</Tag> : null}
        </Space>
      )
    },
    level: {
      title: draggableTitle('level', '级别'),
      key: 'level',
      dataIndex: 'level',
      width: 90,
      sorter: (a, b) => compareText(a.level || 'info', b.level || 'info'),
      render: (value?: string) => <Tag color={value === 'error' || value === 'fatal' ? 'red' : value === 'warning' ? 'gold' : 'green'}>{value || 'info'}</Tag>
    },
    message: {
      title: draggableTitle('message', '信息'),
      key: 'message',
      dataIndex: 'message',
      ellipsis: true,
      sorter: (a, b) => compareText(a.message, b.message),
      render: (value: string) => <Text title={value}>{value}</Text>
    },
    metric: {
      title: draggableTitle('metric', '指标'),
      key: 'metric',
      width: 120,
      sorter: (a, b) => metricSortValue(a) - metricSortValue(b),
      render: (_, record) => <Text type="secondary">{metricValue(record)}</Text>
    }
  };

  const columns = columnOrder.map((key) => columnMap[key]);
  const totalEvents = summary?.total ?? 0;
  const last24hEvents = summary?.last24h ?? 0;
  const errorsLast24h = summary?.errorsLast24h ?? 0;
  const slowResources = summary?.metrics.slowResources ?? 0;
  const longTasks = summary?.metrics.longTasks ?? 0;
  const latestLcp = summary?.metrics.latestLcp ?? 0;
  const clsTotal = summary?.metrics.clsTotal ?? 0;
  const longTaskDurations = events
    .filter((event) => event.tags?.metric === 'longtask')
    .map((event) => getMetricNumber(event, 'duration') ?? getMetricNumber(event, 'value') ?? 0)
    .filter((value) => value > 0)
    .sort((a, b) => b - a);
  const maxLongTask = longTaskDurations[0] ?? 0;
  const topSlowResources = events
    .filter((event) => event.tags?.metric === 'slow-resource')
    .map((event) => ({
      name: event.message,
      duration: getMetricNumber(event, 'duration') ?? getMetricNumber(event, 'value') ?? 0
    }))
    .filter((item) => item.duration > 0)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5);
  const trendData = (() => {
    if (trendRange === 'day') {
      const buckets = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - (6 - index));
        return {
          label: `${date.getMonth() + 1}/${date.getDate()}`,
          key: date.toISOString().slice(0, 10),
          value: 0
        };
      });
      events.forEach((event) => {
        const date = new Date(event.timestamp);
        if (Number.isNaN(date.getTime())) return;
        const key = date.toISOString().slice(0, 10);
        const bucket = buckets.find((item) => item.key === key);
        if (bucket) bucket.value += 1;
      });
      return buckets;
    }
    if (trendRange === 'minute') {
      const buckets = Array.from({ length: 60 }, (_, index) => ({
        label: index % 10 === 0 ? index.toString().padStart(2, '0') : '',
        key: String(index),
        value: 0
      }));
      events.forEach((event) => {
        const date = new Date(event.timestamp);
        if (!Number.isNaN(date.getTime())) buckets[date.getMinutes()].value += 1;
      });
      return buckets;
    }
    const buckets = Array.from({ length: 24 }, (_, index) => ({
      label: index % 4 === 0 || index === 23 ? index.toString().padStart(2, '0') : '',
      key: String(index),
      value: 0
    }));
    events.forEach((event) => {
      const date = new Date(event.timestamp);
      if (!Number.isNaN(date.getTime())) buckets[date.getHours()].value += 1;
    });
    return buckets;
  })();
  const trendValues = trendData.map((item) => item.value);
  const trendPeak = Math.max(...trendValues, 0);
  const trendPeakBucket = trendData.find((item) => item.value === trendPeak);
  const trendLinePath = buildLinePath(trendValues, 720, 190, 12);
  const trendAreaPath = trendLinePath
    ? `${trendLinePath} L708,178 L12,178 Z`
    : '';
  const typeEntries = Object.entries(summary?.byType || {}).sort((a, b) => b[1] - a[1]);
  const topType = typeEntries[0];
  const typePerf = summary?.byType.performance ?? 0;
  const typeBusiness = summary?.byType.business ?? 0;
  const typeApiError = summary?.byType.api_error ?? 0;
  const typeOther = Math.max(totalEvents - typePerf - typeBusiness - typeApiError, 0);
  const donutTotal = Math.max(totalEvents, 1);
  const donutStyle = {
    background: `conic-gradient(var(--accent) 0 ${(typePerf / donutTotal) * 100}%, #2fc9b5 ${(typePerf / donutTotal) * 100}% ${((typePerf + typeBusiness) / donutTotal) * 100}%, var(--warn) ${((typePerf + typeBusiness) / donutTotal) * 100}% ${((typePerf + typeBusiness + typeApiError) / donutTotal) * 100}%, var(--text-3) ${((typePerf + typeBusiness + typeApiError) / donutTotal) * 100}% 100%)`
  };
  const pageEntries = Object.entries(summary?.pages || {}).sort((a, b) => b[1] - a[1]);
  const kpiCards = [
    { label: '总事件', value: formatCompactNumber(totalEvents), meta: '+12% · 7d', tone: 'good', values: [2, 3, 4, 6, 9, 12, 15, 18] },
    { label: '24h 事件', value: formatCompactNumber(last24hEvents), meta: '实时采集', tone: 'info', values: [5, 4, 6, 5, 7, 5, 4, 12] },
    { label: '24h 错误', value: formatCompactNumber(errorsLast24h), meta: `${errorsLast24h} JS Error`, tone: errorsLast24h > 0 ? 'bad' : 'good', values: [0, 0, 0, 0, 0, 0, errorsLast24h, errorsLast24h] },
    { label: '慢资源', value: formatCompactNumber(slowResources), meta: `${slowResources} 条待排查`, tone: slowResources > 0 ? 'warn' : 'good', values: [1, 0, 2, 0, 1, 1, 0, slowResources] },
    { label: '长任务', value: formatCompactNumber(longTasks), meta: maxLongTask ? `主线程阻塞 ${Math.round(maxLongTask)}ms` : '无阻塞', tone: longTasks > 0 ? 'bad' : 'good', values: [1, 3, 5, 2, 7, 8, 4, longTasks] },
    { label: '最新 LCP', value: formatCompactNumber(Math.round(latestLcp)), unit: 'ms', meta: latestLcp && latestLcp < 2500 ? '良好 < 2.5s' : '需关注', tone: latestLcp && latestLcp >= 2500 ? 'warn' : 'good', values: [690, 720, 705, 760, 740, 715, 780, latestLcp || 740] }
  ];

  if (loading && !summary) {
    return (
      <div className={`monitoring-page monitoring-theme-${theme}`}>
        <div className="monitoring-loading">
          <Spin />
          <Text type="secondary">正在读取本地监控数据...</Text>
        </div>
      </div>
    );
  }

  return (
    <div className={`monitoring-page monitoring-theme-${theme}`}>
      <div className="monitoring-page-header">
        <div className="monitoring-brand">
          <div className="monitoring-logo">●</div>
          <div>
            <Title level={2}>前端监控后台</Title>
            <Text type="secondary">Observability / Overview</Text>
          </div>
        </div>
        <Space wrap>
          <Tag className="monitoring-env-dot">development</Tag>
          <div className="monitoring-theme-switch" role="group" aria-label="监控后台主题切换">
            <button
              type="button"
              className={theme === 'light' ? 'is-active' : ''}
              onClick={() => setTheme('light')}
            >
              白天
            </button>
            <button
              type="button"
              className={theme === 'dark' ? 'is-active' : ''}
              onClick={() => setTheme('dark')}
            >
              黑夜
            </button>
          </div>
          <Button onClick={() => void generateAnalysis()} loading={analysisLoading}>
            AI 处置结果
          </Button>
          <Button type="primary" onClick={() => void loadData()} loading={loading}>
            刷新数据
          </Button>
          <Button onClick={onBack}>返回 Playground</Button>
        </Space>
      </div>

      <div className="monitoring-dashboard">

        {error ? <Alert type="error" showIcon message="监控数据读取失败" description={error} className="monitoring-alert" /> : null}
        {analysisError ? <Alert type="error" showIcon message="AI 分析失败" description={analysisError} className="monitoring-alert" /> : null}

        <div className="monitoring-stats">
          {kpiCards.map((item) => (
            <div key={item.label} className="monitoring-kpi-card" data-tone={item.tone}>
              <div className="monitoring-kpi-label"><span />{item.label}</div>
              <div className="monitoring-kpi-value">
                {item.value}{item.unit ? <small>{item.unit}</small> : null}
              </div>
              <div className="monitoring-kpi-meta">{item.meta}</div>
              <svg viewBox="0 0 150 34" className="monitoring-kpi-spark" aria-hidden="true">
                <path d={buildLinePath(item.values, 150, 34, 5)} />
              </svg>
            </div>
          ))}
        </div>

        <div className="monitoring-overview-grid">
          <section className="monitoring-panel monitoring-trend-panel">
            <div className="monitoring-panel-head">
              <div>
                <h3>事件量趋势</h3>
                <p>总 {formatCompactNumber(totalEvents)} 事件 · 峰值 {trendPeak} @ {trendPeakBucket?.label || '-'}</p>
              </div>
              <div className="monitoring-range-tabs" role="group" aria-label="事件趋势时间粒度">
                {[
                  ['day', '日'],
                  ['hour', '时'],
                  ['minute', '分']
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={trendRange === value ? 'is-active' : ''}
                    onClick={() => setTrendRange(value as TrendRange)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <svg viewBox="0 0 720 210" className="monitoring-trend-chart" aria-hidden="true">
              <path className="area" d={trendAreaPath} />
              <path className="line" d={trendLinePath} />
              {trendData.map((item, index) => item.label ? (
                <text key={`${item.key}-${index}`} x={12 + (index / Math.max(trendData.length - 1, 1)) * 696} y="202">{item.label}</text>
              ) : null)}
            </svg>
          </section>

          <section className="monitoring-panel monitoring-vitals-panel">
            <div className="monitoring-panel-head">
              <h3>核心 Web 指标</h3>
            </div>
            {[
              { name: 'LCP', value: latestLcp || 0, display: `${Math.round(latestLcp || 0)} ms`, max: 5000, good: 2500, warn: 4000 },
              { name: 'Long Task', value: maxLongTask || 0, display: formatDuration(maxLongTask), max: 700, good: 100, warn: 300 },
              { name: 'CLS', value: clsTotal || 0, display: Number(clsTotal || 0).toFixed(3), max: 0.5, good: 0.1, warn: 0.25 }
            ].map((item) => {
              const tone = item.value <= item.good ? 'good' : item.value <= item.warn ? 'warn' : 'bad';
              return (
                <div key={item.name} className="monitoring-vital-row" data-tone={tone}>
                  <div><b>{item.name}</b><strong>{item.display}</strong></div>
                  <div className="monitoring-vital-track">
                    <span className="good" />
                    <span className="warn" />
                    <span className="bad" />
                    <i style={{ left: `${Math.min((item.value / item.max) * 100, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </section>
        </div>

        <div className="monitoring-mid-grid">
          <section className="monitoring-panel monitoring-type-panel">
            <h3>事件类型分布</h3>
            <div className="monitoring-donut-row">
              <div className="monitoring-donut" style={donutStyle}>
                <div><strong>{formatCompactNumber(totalEvents)}</strong><span>events</span></div>
              </div>
              <div className="monitoring-type-list">
                {typeEntries.slice(0, 4).map(([key, value]) => (
                  <div key={key}><span>{key}</span><b>{formatCompactNumber(value)}</b><em>{((value / Math.max(totalEvents, 1)) * 100).toFixed(1)}%</em></div>
                ))}
                {pageEntries.slice(0, 1).map(([key, value]) => (
                  <div key={key} className="is-page"><span>{key}</span><b>{((value / Math.max(totalEvents, 1)) * 100).toFixed(0)}%</b></div>
                ))}
                {typeOther > 0 ? <div><span>other</span><b>{formatCompactNumber(typeOther)}</b></div> : null}
              </div>
            </div>
          </section>

          <section className="monitoring-panel monitoring-resource-panel">
            <div className="monitoring-panel-head"><h3>最慢资源 Top 5</h3><span>按耗时</span></div>
            {(topSlowResources.length ? topSlowResources : [{ name: '暂无慢资源', duration: 0 }]).map((item) => (
              <div key={item.name} className="monitoring-resource-row" data-hot={item.duration > 10_000 ? 'bad' : item.duration > 1000 ? 'warn' : 'info'}>
                <div><span>{item.name}</span><b>{formatDuration(item.duration)}</b></div>
                <i style={{ width: `${Math.max(4, Math.min((item.duration / Math.max(topSlowResources[0]?.duration || 1, 1)) * 100, 100))}%` }} />
              </div>
            ))}
          </section>

          <section className="monitoring-panel monitoring-longtask-panel">
            <h3>长任务</h3>
            <div className="monitoring-longtask-value">{formatCompactNumber(longTasks)}<span>次 · 最高 {formatDuration(maxLongTask)}</span></div>
            <div className="monitoring-longtask-bars">
              {(longTaskDurations.length ? longTaskDurations.slice(0, 8) : [0, 0, 0, 0, 0, 0, 0, 0]).map((duration, index) => (
                <i key={`${duration}-${index}`} style={{ height: `${Math.max(18, Math.min((duration / Math.max(maxLongTask || 1, 1)) * 100, 100))}%` }} />
              ))}
            </div>
            <div className="monitoring-longtask-foot"><span>最高 {formatDuration(maxLongTask)}</span><span>Top 8</span></div>
          </section>
        </div>

        <section className="monitoring-analysis-card">
          <Flex justify="space-between" align="center" wrap="wrap" gap={10}>
            <div>
              <div className="monitoring-analysis-title">
                <span>{analysisResult ? 'AI 已生成' : '待分析'}</span>
                <Text strong>{analysisResult ? '监控视图已有处置结果' : '监控视图等待 AI 处置结果'}</Text>
              </div>
              <div className="monitoring-analysis-meta">
                {analysisResult ? (
                  <Text type="secondary">
                    模型 {analysisResult.model} · {new Date(analysisResult.generatedAt).toLocaleString()} · 分析最近 {analysisResult.input?.analyzedEvents ?? '-'} 条事件
                  </Text>
                ) : (
                  <Text type="secondary">点击右上角按钮，让大模型基于当前监控数据生成排障结论与处置步骤。</Text>
                )}
              </div>
            </div>
            <Button onClick={() => void generateAnalysis()} loading={analysisLoading} type="primary" ghost>
              生成处置结果
            </Button>
          </Flex>
          {analysisLoading ? (
            <div className="monitoring-analysis-loading">
              <Spin size="small" />
              <Text type="secondary">大模型正在分析监控数据...</Text>
            </div>
          ) : analysisResult ? (
            <div className="monitoring-analysis-result">
              <ReactMarkdown>{analysisResult.analysis}</ReactMarkdown>
            </div>
          ) : null}
          <div className="monitoring-analysis-impact">
            <span>环境 localhost · development</span>
            <span>页面 /?view=monitoring</span>
            <span>事件 {formatCompactNumber(totalEvents)}</span>
            <span>真实用户 本地调试</span>
          </div>
        </section>

        <section className="monitoring-event-panel">
          <Flex justify="space-between" align="center" wrap="wrap" gap={10} className="monitoring-filters">
            <Space wrap>
              <Text strong>事件流</Text>
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                style={{ width: 160 }}
                options={[
                  { label: '全部类型', value: 'all' },
                  { label: 'JS Error', value: 'js_error' },
                  { label: 'Promise Error', value: 'promise_error' },
                  { label: 'API Error', value: 'api_error' },
                  { label: 'Performance', value: 'performance' },
                  { label: 'Business', value: 'business' }
                ]}
              />
              <Input.Search
                allowClear
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索 message / URL / 环境"
                style={{ width: 280 }}
              />
            </Space>
            <Text type="secondary">当前 {filteredEvents.length} / {events.length}</Text>
          </Flex>

          {filteredEvents.length ? (
            <Table
              rowKey="id"
              columns={columns}
              dataSource={filteredEvents}
              size="middle"
              scroll={{ x: 920 }}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              expandable={{
                expandedRowRender: (record) => (
                  <pre className="monitoring-event-json">{JSON.stringify(record, null, 2)}</pre>
                )
              }}
            />
          ) : (
            <Empty description="暂无监控事件" />
          )}
        </section>
      </div>
    </div>
  );
}
