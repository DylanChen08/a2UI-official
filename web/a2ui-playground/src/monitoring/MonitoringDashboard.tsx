import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Flex, Input, Select, Space, Spin, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ReactMarkdown from 'react-markdown';
import { fetchMonitoringJson, reportCustomMonitoringEvent } from './client';

const { Text, Title } = Typography;

type ColumnKey = 'timestamp' | 'type' | 'level' | 'message' | 'metric';

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
          <Tag color={value === 'error' || value === 'unhandledrejection' ? 'red' : value === 'performance' ? 'blue' : 'default'}>
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

  if (loading && !summary) {
    return (
      <div className="monitoring-page">
        <div className="monitoring-loading">
          <Spin />
          <Text type="secondary">正在读取本地监控数据...</Text>
        </div>
      </div>
    );
  }

  return (
    <div className="monitoring-page">
      <div className="monitoring-page-header">
        <div>
          <Text className="monitoring-kicker">A2UI Observability</Text>
          <Title level={2}>前端监控后台</Title>
          <Text type="secondary">Sentry 事件、本地错误、性能指标与慢资源统一落盘到 Node JSON。</Text>
        </div>
        <Space wrap>
          <Button onClick={onBack}>返回 A2UI Playground</Button>
          <Button onClick={() => void generateAnalysis()} loading={analysisLoading}>
            AI 生成处置结果
          </Button>
          <Button type="primary" onClick={() => void loadData()} loading={loading}>
            刷新数据
          </Button>
        </Space>
      </div>

      <div className="monitoring-dashboard">

        {error ? <Alert type="error" showIcon message="监控数据读取失败" description={error} className="monitoring-alert" /> : null}
        {analysisError ? <Alert type="error" showIcon message="AI 分析失败" description={analysisError} className="monitoring-alert" /> : null}

        <div className="monitoring-stats">
          <Card>
            <Statistic title="总事件" value={summary?.total ?? 0} />
          </Card>
          <Card>
            <Statistic title="24h 事件" value={summary?.last24h ?? 0} />
          </Card>
          <Card>
            <Statistic title="24h 错误" value={summary?.errorsLast24h ?? 0} valueStyle={{ color: (summary?.errorsLast24h ?? 0) > 0 ? '#cf1322' : undefined }} />
          </Card>
          <Card>
            <Statistic title="慢资源" value={summary?.metrics.slowResources ?? 0} />
          </Card>
          <Card>
            <Statistic title="长任务" value={summary?.metrics.longTasks ?? 0} />
          </Card>
          <Card>
            <Statistic title="最新 LCP" value={summary?.metrics.latestLcp ?? 0} suffix="ms" />
          </Card>
        </div>

        <Card className="monitoring-analysis-card">
          <Flex justify="space-between" align="center" wrap="wrap" gap={10}>
            <div>
              <Text strong>AI 处置结果</Text>
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
        </Card>

        <div className="monitoring-breakdown">
          <div>
            <Text strong>事件类型</Text>
            <Space wrap className="monitoring-tags">
              {Object.entries(summary?.byType || {}).map(([key, value]) => (
                <Tag key={key}>
                  {key} {value}
                </Tag>
              ))}
            </Space>
          </div>
          <div>
            <Text strong>页面分布</Text>
            <Space wrap className="monitoring-tags">
              {Object.entries(summary?.pages || {}).slice(0, 6).map(([key, value]) => (
                <Tag key={key}>
                  {key || '/'} {value}
                </Tag>
              ))}
            </Space>
          </div>
        </div>

        <Flex justify="space-between" align="center" wrap="wrap" gap={10} className="monitoring-filters">
          <Space wrap>
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              style={{ width: 160 }}
              options={[
                { label: '全部类型', value: 'all' },
                { label: 'Error', value: 'error' },
                { label: 'Unhandled', value: 'unhandledrejection' },
                { label: 'Performance', value: 'performance' },
                { label: 'Resource', value: 'resource' },
                { label: 'Custom', value: 'custom' }
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
          <Text type="secondary">当前 {filteredEvents.length} 条</Text>
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
      </div>
    </div>
  );
}
