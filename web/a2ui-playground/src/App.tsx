import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import {
  Button,
  Card,
  Typography,
  Alert,
  Select,
  Spin,
  Input,
  Flex,
  Space,
  Divider,
  Tag,
  Collapse,
  message,
  ConfigProvider,
  Layout,
  Drawer,
  Tabs,
  Badge,
  Tooltip,
  Segmented
} from 'antd';
import ReactDOM from 'react-dom/client';
import { init, a2uiParser, A2UIMessage, type DataModelUpdatePayload } from 'a2ui-core';
import { createRenderMap, type OpenLinkSpec } from 'a2ui-react';
import mockComplexNestedTree from '../../../packages/a2ui-core/mock/complex-nested-tree.json';
import mockRowColumnMixed from '../../../packages/a2ui-core/mock/row-column-mixed.json';
import mockCardDemo from '../../../packages/a2ui-core/mock/card-demo.json';
import mockDataBindingSmoke from '../../../packages/a2ui-core/mock/data-binding-smoke.json';
import mockListTemplateSmoke from '../../../packages/a2ui-core/mock/list-template-smoke.json';
import mockCartListSmoke from '../../../packages/a2ui-core/mock/cart-list-smoke.json';
import mockLocalActionTextDemo from '../../../packages/a2ui-core/mock/local-action-text-demo.json';
import mockAgentBack from '../../../packages/a2ui-core/mock/agent-back.json';
import { StreamSimulator } from './mock/stream-simulator';
import { buildA2uiProtocolSnapshot } from './buildA2uiProtocolSnapshot';
import './App.css';

const { Title, Text } = Typography;
const { Sider, Header, Content } = Layout;
const { Option } = Select;
const { TextArea } = Input;

const PLAYGROUND_RENDER_THROTTLE_MS = 400;

/** 浏览器控制台：执行 `localStorage.setItem('a2uiAgentDebug','1')` 后刷新，可看到 /api/agent 客户端解析日志 */
function a2uiClientDbg(...args: unknown[]) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('a2uiAgentDebug') === '1') {
      console.log('[a2ui-agent client]', ...args);
    }
  } catch {
    /* ignore */
  }
}
/** 服务端按整条 JSONL 协议切片的流（推荐） */
const A2UI_JSONL_CHUNK_NAME = 'a2ui.jsonl.chunk';
/** 整条 A2UI 消息对象一条 CUSTOM（兼容旧 mock） */
const A2UI_MESSAGE_NAME = 'a2ui.message';
/** LLM 完整原文（调试） */
const A2UI_LLM_RAW_NAME = 'a2ui.llm.raw';

/** 将 AG-UI CUSTOM 事件转为写入 parser 缓冲区的字符串 */
function a2uiCustomEventToWriteString(ev: Record<string, unknown>): string | null {
  if (ev.type !== 'CUSTOM') return null;
  const name = ev.name as string | undefined;
  if (name === A2UI_JSONL_CHUNK_NAME && typeof ev.value === 'string') {
    return ev.value;
  }
  if (name === A2UI_MESSAGE_NAME && ev.value != null) {
    return `${JSON.stringify(ev.value)}\n`;
  }
  return null;
}

type ChatRole = 'user' | 'assistant';

/** 助手流式回复：连接中 / 已收到首包正在输出 */
type AssistantStreamPhase = 'connecting' | 'streaming';

/** A2UI /api/agent：模型侧返回 → 协议流式渲染 → 完成 */
type A2uiAgentPhase = 'awaiting_model' | 'rendering_protocol' | 'done';

/** 随用户消息发往 Agent 的图片（AG-UI `binary` + base64 `data`）；`id` 仅客户端用于预览列表与删除 */
interface ChatImageAttachment {
  id?: string;
  mimeType: string;
  base64Data: string;
}

function newChatAttachmentId(): string {
  return crypto.randomUUID?.() ?? `att-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** 部分系统上 `File.type` 为空，需用扩展名推断 */
function guessImageMimeFromFileName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return null;
}

function resolveLocalImageFileMime(f: File): { ok: true; mime: string } | { ok: false } {
  if (f.type.startsWith('image/')) return { ok: true, mime: f.type };
  if (!f.type || f.type === 'application/octet-stream') {
    const g = guessImageMimeFromFileName(f.name);
    if (g) return { ok: true, mime: g };
  }
  return { ok: false };
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** 多模态：与 `content` 一并发送给 `/api/agent` / `/api/chat` */
  attachments?: ChatImageAttachment[];
  streamPhase?: AssistantStreamPhase;
  /** 非「仅模型对话」且走 /api/agent 时使用 */
  a2uiPhase?: A2uiAgentPhase;
  /** /api/agent LLM 路径：完整模型输出（CUSTOM a2ui.llm.raw） */
  llmRawOutput?: string;
}

const DEFAULT_MULTIMODAL_USER_PROMPT =
  '请根据图片生成符合 A2UI 的合并 JSON（可含 beginRendering、surfaceUpdate、dataModelUpdate 等）。';

const MAX_CHAT_IMAGES = 6;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const SCENARIO_OPTIONS = [
  {
    value: 'complex-nested-tree',
    label: '复杂嵌套树',
    description: '测试多层嵌套组件、布局容器与基础文本渲染。'
  },
  {
    value: 'row-column-mixed',
    label: '行列混排',
    description: '测试 Row / Column 混合布局与响应式结构。'
  },
  {
    value: 'card-demo',
    label: '卡片示例',
    description: '生成典型内容卡片，适合检查容器、标题和操作区。'
  },
  {
    value: 'data-binding-smoke',
    label: '数据绑定',
    description: '验证 dataModel 绑定、局部更新和动态文案刷新。'
  },
  {
    value: 'list-template-smoke',
    label: '列表模板',
    description: '测试列表模板渲染和重复项结构。'
  },
  {
    value: 'cart-list-smoke',
    label: '购物车列表',
    description: '生成购物车条目，验证列表、价格和操作交互。'
  },
  {
    value: 'local-action-text-demo',
    label: '本地动作',
    description: '测试本地 action 触发 dataModel 更新。'
  },
  {
    value: 'agent-back',
    label: 'Agent Back',
    description: '测试列布局、文案和按钮组合的基础 Agent 返回。'
  }
];

function readFileAsBase64Data(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      resolve(s.includes('base64,') ? (s.split('base64,')[1] ?? s) : s);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type AgentApiContentPart =
  | { type: 'text'; text: string }
  | { type: 'binary'; mimeType: string; data: string };

function parseSseDataLinesToEvents(text: string): unknown[] {
  const events: unknown[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (!payload) continue;
    try {
      events.push(JSON.parse(payload));
    } catch {
      /* skip */
    }
  }
  return events;
}

function a2uiDoneTagOk(content: string): boolean {
  return !/请求失败|客户端错误|RUN_ERROR|调用失败|无法解析|已取消/.test(content);
}

/**
 * 把聊天历史转成 /api/agent 的 messages。
 * 当本请求会带 `forwardedProps.a2uiCurrentProtocol` 时，助手轮仅保留短说明，避免与快照重复占 token；
 * 否则仍可将上一轮 llmRawOutput 拼进助手 content（无快照时的回退）。
 */
function chatMessagesToAgentApiPayload(
  messages: ChatMessage[],
  options?: { shortenAssistantWhenSnapshot?: boolean }
): Array<{ id: string; role: string; content: string | AgentApiContentPart[] }> {
  const shorten = options?.shortenAssistantWhenSnapshot === true;
  return messages.map((m) => {
    if (m.role === 'assistant' && shorten) {
      return {
        id: m.id,
        role: m.role,
        content:
          '（上一轮 UI 已渲染；当前完整协议以本请求 forwardedProps.a2uiCurrentProtocol 及最后一条 user 中的「当前画布协议快照」为准；请只输出增量 JSON。）'
      };
    }
    if (m.role === 'assistant' && typeof m.llmRawOutput === 'string' && m.llmRawOutput.trim() && !shorten) {
      const lines = [
        '【供多轮修改的上下文：上一轮你输出的 A2UI JSON 如下】',
        m.llmRawOutput.trim(),
        '',
        '（若用户要求调整界面，请输出增量 surfaceUpdate / dataModelUpdate；保持 surfaceId 与组件 id 稳定；除非用户要求整屏重画，否则不要再次发送 beginRendering。）',
        m.content?.trim() ? `【本轮状态说明】${m.content.trim()}` : ''
      ].filter(Boolean);
      return { id: m.id, role: m.role, content: lines.join('\n') };
    }
    if (m.role === 'user' && m.attachments?.length) {
      const text = m.content.trim() || DEFAULT_MULTIMODAL_USER_PROMPT;
      return {
        id: m.id,
        role: 'user',
        content: [
          { type: 'text', text },
          ...m.attachments.map((a) => ({
            type: 'binary' as const,
            mimeType: a.mimeType,
            data: a.base64Data
          }))
        ]
      };
    }
    return { id: m.id, role: m.role, content: m.content };
  });
}

/** 将 JSONL 每行格式化为可读多段 JSON */
function formatJsonlLinesPretty(jsonl: string): string {
  const lines = jsonl.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return '';
  const out: string[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.stringify(JSON.parse(line), null, 2));
    } catch {
      out.push(line);
    }
  }
  return out.join('\n\n---\n\n');
}

/** 展示模型返回：合并 JSON、JSONL 或原文 */
function formatAgentLlmRawDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return '—';
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length > 1 && lines.every((l) => l.trim().startsWith('{'))) {
    return formatJsonlLinesPretty(t);
  }
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return raw;
  }
}

function getSearchMatchCount(text: string, keyword: string): number {
  const q = keyword.trim().toLowerCase();
  if (!q) return 0;
  return text
    .split(/\r?\n/)
    .filter((line) => line.toLowerCase().includes(q)).length;
}

function JsonViewer({
  title,
  description,
  value,
  search,
  onSearch
}: {
  title: string;
  description?: React.ReactNode;
  value: string;
  search: string;
  onSearch: (value: string) => void;
}) {
  const matchCount = getSearchMatchCount(value, search);
  const copyValue = async () => {
    try {
      await navigator.clipboard.writeText(value || '');
      message.success('已复制');
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <div className="debug-block">
      <Flex justify="space-between" align="center" gap={12} wrap="wrap">
        <div>
          <Text strong>{title}</Text>
          {description ? <div className="debug-desc">{description}</div> : null}
        </div>
        <Space>
          {search.trim() ? <Tag color="blue">匹配 {matchCount} 行</Tag> : null}
          <Button size="small" onClick={copyValue} disabled={!value}>
            复制
          </Button>
        </Space>
      </Flex>
      <Input.Search
        allowClear
        size="middle"
        placeholder="搜索字段，例如 component / props / id"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="debug-search"
      />
      <pre className={search.trim() ? 'debug-pre is-searching' : 'debug-pre'}>{value || '-'}</pre>
    </div>
  );
}

/** 增量解析 AG-UI SSE：`data: {...}\\n\\n` */
async function consumeAgentSse(
  response: Response,
  onWrite: (chunk: string) => void,
  options?: { onEvent?: (ev: Record<string, unknown>) => void; onLlmRaw?: (text: string) => void }
): Promise<{ finishedSummary?: string; runError?: string }> {
  const body = response.body;
  if (!body) {
    a2uiClientDbg('consumeAgentSse: no body');
    return { runError: '响应无 body' };
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let finishedSummary: string | undefined;
  let runError: string | undefined;
  let bytes = 0;
  let sseBlocks = 0;
  const typeCounts: Record<string, number> = {};
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    bytes += value.byteLength;
    a2uiClientDbg('read chunk', { bytesSoFar: bytes, chunkBytes: value.byteLength });
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      sseBlocks += 1;
      const line = block.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      let ev: Record<string, unknown>;
      try {
        ev = JSON.parse(json) as Record<string, unknown>;
      } catch {
        continue;
      }
      const t = ev.type as string | undefined;
      if (t) typeCounts[t] = (typeCounts[t] ?? 0) + 1;
      a2uiClientDbg('sse block', { sseBlocks, type: t });
      options?.onEvent?.(ev);
      if (t === 'CUSTOM') {
        const cname = ev.name as string | undefined;
        if (cname === A2UI_LLM_RAW_NAME && typeof ev.value === 'string') {
          options?.onLlmRaw?.(ev.value);
        }
        const w = a2uiCustomEventToWriteString(ev);
        if (w !== null) onWrite(w);
      }
      if (t === 'RUN_FINISHED') {
        const r = ev.result;
        finishedSummary =
          r !== undefined ? `Agent 完成：${typeof r === 'object' ? JSON.stringify(r) : String(r)}` : 'Agent 完成';
      }
      if (t === 'RUN_ERROR') {
        runError = typeof ev.message === 'string' ? ev.message : 'RUN_ERROR';
      }
    }
  }
  const elapsed =
    typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : undefined;
  a2uiClientDbg('consumeAgentSse done', {
    bytes,
    sseBlocks,
    typeCounts,
    hasFinishedSummary: !!finishedSummary,
    runError,
    ms: elapsed
  });
  return { finishedSummary, runError };
}

/** 解析 /api/chat 的 SSE：`start` | `delta` | `done` | `error` */
async function consumeChatSse(
  response: Response,
  onEvent: (ev: { type: string; text?: string; message?: string }) => void
): Promise<void> {
  const body = response.body;
  if (!body) throw new Error('响应无 body');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const line = block.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const json = line.slice(5).trim();
      if (!json) continue;
      try {
        const ev = JSON.parse(json) as { type: string; text?: string; message?: string };
        onEvent(ev);
      } catch {
        /* skip */
      }
    }
  }
}

function App() {
  const storeRef = useRef<any>(null);
  const [storeState, setStoreState] = useState<any>(null);
  const [componentTree, setComponentTree] = useState<any>(null);
  const [debugDrawerOpen, setDebugDrawerOpen] = useState(false);
  const [activeDebugTab, setActiveDebugTab] = useState('json');
  const [debugSearch, setDebugSearch] = useState('');
  /** 最近一次 /api/agent：CUSTOM a2ui.llm.raw 与写入解析器的 JSONL 全文（成功/失败/中止均尽量保留） */
  const [agentProtocolView, setAgentProtocolView] = useState<{ llm: string; jsonl: string }>({
    llm: '',
    jsonl: ''
  });
  const agentLlmRawRef = useRef('');
  const agentJsonlAccumRef = useRef('');
  const [scenario, setScenario] = useState('complex-nested-tree');
  /** 开启后只调 POST /api/chat，不跑 A2UI /api/agent */
  const [llmChatOnly, setLlmChatOnly] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<TextAreaRef | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatImageAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const renderRef = useRef<HTMLDivElement>(null);
  const previewRootRef = useRef<ReturnType<typeof ReactDOM.createRoot> | null>(null);
  const threadIdRef = useRef(`thread-${crypto.randomUUID?.() ?? Date.now()}`);
  const abortRef = useRef<AbortController | null>(null);

  const selectedScenario = SCENARIO_OPTIONS.find((item) => item.value === scenario) ?? SCENARIO_OPTIONS[0];

  const onPickImages = () => fileInputRef.current?.click();

  const onImageFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const picked = input.files?.length ? Array.from(input.files) : [];
    input.value = '';
    if (picked.length === 0) return;

    const additions: ChatImageAttachment[] = [];
    for (const f of picked) {
      const resolved = resolveLocalImageFileMime(f);
      if (!resolved.ok) {
        message.warning(`已跳过非图片或无法识别类型：${f.name}`);
        continue;
      }
      if (f.size > MAX_IMAGE_BYTES) {
        message.warning(`图片过大（>${MAX_IMAGE_BYTES / (1024 * 1024)}MB）：${f.name}`);
        continue;
      }
      try {
        additions.push({
          id: newChatAttachmentId(),
          mimeType: resolved.mime,
          base64Data: await readFileAsBase64Data(f)
        });
      } catch {
        message.error(`读取失败：${f.name}`);
      }
    }
    if (additions.length === 0) return;
    setPendingAttachments((prev) => {
      const merged = [...prev, ...additions];
      if (merged.length > MAX_CHAT_IMAGES) {
        message.warning(`最多保留 ${MAX_CHAT_IMAGES} 张，已截断`);
        return merged.slice(0, MAX_CHAT_IMAGES);
      }
      return merged;
    });
  };

  const handleMountComplete = (componentId: string) => {
    if (storeRef.current) {
      storeRef.current.getState().setHydrateNodeMounted(componentId);
    }
  };

  const getHasMounted = (componentId: string): boolean => {
    if (!storeRef.current) return false;
    const node = storeRef.current.getState().getHydrateNode(componentId);
    return node?.hasMounted ?? false;
  };

  const localRenderOptions = {
    applyLocalDataModelUpdate: (payload: DataModelUpdatePayload) => {
      storeRef.current?.getState().applyDataModelUpdate(payload);
    },
    requestTreeRefresh: () => {
      a2uiParser.flushPendingRender();
    },
    openExternalLink: ({ url, target }: OpenLinkSpec) => {
      const t = target ?? '_blank';
      const trimmed = url.trim();
      if (!trimmed || /^javascript:/i.test(trimmed)) return;
      let href: string;
      try {
        href = new URL(trimmed, window.location.href).href;
      } catch {
        return;
      }
      if (t === '_self') {
        window.location.assign(href);
      } else {
        window.open(href, t, 'noopener,noreferrer');
      }
    }
  };

  const bootstrapRenderer = useCallback(() => {
    const animatedRenderMap = createRenderMap(getHasMounted, handleMountComplete, localRenderOptions);
    const createdStore = init({
      renderMap: animatedRenderMap,
      renderThrottleMs: PLAYGROUND_RENDER_THROTTLE_MS,
      onRender: (rootVNode) => {
        setComponentTree(rootVNode);
      }
    });
    storeRef.current = createdStore;
    return createdStore;
  }, []);

  useEffect(() => {
    a2uiParser.resetRuntimeState();
    bootstrapRenderer();
    setStoreState(storeRef.current?.getState() ?? null);
  }, [bootstrapRenderer]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (llmChatOnly) {
      previewRootRef.current?.render(null);
      return;
    }
    const el = renderRef.current;
    if (!el) return;
    if (!previewRootRef.current) {
      previewRootRef.current = ReactDOM.createRoot(el);
    }
    if (componentTree) {
      previewRootRef.current.render(componentTree);
    } else {
      previewRootRef.current.render(null);
    }
  }, [componentTree, llmChatOnly]);

  /** Ctrl/⌘ + 点击预览区：将命中的 A2UI 组件 id 追加到左侧输入框（避免与普通点击/按钮冲突） */
  const handlePreviewPointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (llmChatOnly) return;
      if (!e.ctrlKey && !e.metaKey) return;
      const root = renderRef.current;
      if (!root) return;
      const target = e.target;
      if (!(target instanceof HTMLElement) || !root.contains(target)) return;

      const map = storeRef.current?.getState()?.hydrateNodeMap;
      if (!map || Object.keys(map).length === 0) return;

      let el: HTMLElement | null = target;
      while (el && el !== root) {
        const cid = el.id;
        if (cid && map[cid]) {
          e.preventDefault();
          e.stopPropagation();
          setChatInput((prev) => {
            const t = prev.trim();
            return t.length ? `${t} ${cid}` : cid;
          });
          message.success(`已插入组件 id：${cid}`);
          window.setTimeout(() => chatInputRef.current?.focus(), 0);
          return;
        }
        el = el.parentElement;
      }
    },
    [llmChatOnly]
  );

  const simulateStream = useCallback(async () => {
    if (llmChatOnly) return;
    try {
      setIsStreaming(true);
      a2uiParser.resetRuntimeState();
      bootstrapRenderer();
      const createdStore = storeRef.current;

      a2uiParser.initStreamMode();

      let selectedMockData: Record<string, unknown>;
      switch (scenario) {
        case 'complex-nested-tree':
          selectedMockData = mockComplexNestedTree;
          break;
        case 'row-column-mixed':
          selectedMockData = mockRowColumnMixed;
          break;
        case 'card-demo':
          selectedMockData = mockCardDemo;
          break;
        case 'data-binding-smoke':
          selectedMockData = mockDataBindingSmoke;
          break;
        case 'list-template-smoke':
          selectedMockData = mockListTemplateSmoke as unknown as Record<string, unknown>;
          break;
        case 'cart-list-smoke':
          selectedMockData = mockCartListSmoke as unknown as Record<string, unknown>;
          break;
        case 'local-action-text-demo':
          selectedMockData = mockLocalActionTextDemo;
          break;
        case 'agent-back':
          selectedMockData = mockAgentBack as unknown as Record<string, unknown>;
          break;
        default:
          selectedMockData = mockComplexNestedTree;
      }

      const messagesQueue: A2UIMessage[] = [];
      if (scenario === 'list-template-smoke') {
        a2uiParser.endStream();
        a2uiParser.resetRuntimeState();
        a2uiParser.initStreamMode();
        messagesQueue.push(mockListTemplateSmoke as A2UIMessage);
      } else if (scenario === 'cart-list-smoke') {
        a2uiParser.endStream();
        a2uiParser.resetRuntimeState();
        a2uiParser.initStreamMode();
        messagesQueue.push(mockCartListSmoke as A2UIMessage);
      } else {
        if ('beginRendering' in selectedMockData && selectedMockData.beginRendering) {
          messagesQueue.push({ beginRendering: selectedMockData.beginRendering as A2UIMessage['beginRendering'] });
        }
        if ('surfaceUpdate' in selectedMockData && selectedMockData.surfaceUpdate) {
          messagesQueue.push({ surfaceUpdate: selectedMockData.surfaceUpdate as A2UIMessage['surfaceUpdate'] });
        }
        if ('dataModelUpdate' in selectedMockData && selectedMockData.dataModelUpdate) {
          messagesQueue.push({
            dataModelUpdate: selectedMockData.dataModelUpdate as NonNullable<A2UIMessage['dataModelUpdate']>
          });
        }
      }

      const simulator = new StreamSimulator(
        messagesQueue,
        { chunkSize: 50, chunkDelay: 50 },
        (data) => {
          a2uiParser.write(data);
        },
        (error) => {
          console.error('Stream error:', error);
        }
      );

      await simulator.start();
      a2uiParser.endStream();
      a2uiParser.flushPendingRender();
      setStoreState(createdStore!.getState());
    } catch (error) {
      console.error('Stream error:', error);
    } finally {
      setIsStreaming(false);
    }
  }, [bootstrapRenderer, llmChatOnly, scenario]);

  const sendAgentMessage = async () => {
    const text = chatInput.trim();
    if ((!text && pendingAttachments.length === 0) || isStreaming) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text || (pendingAttachments.length ? '（见附图）' : ''),
      ...(pendingAttachments.length ? { attachments: [...pendingAttachments] } : {})
    };
    const history = [...messages, userMsg];
    setMessages(history);
    setChatInput('');
    setPendingAttachments([]);
    setIsStreaming(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    let a2uiAssistantIdForAbort: string | undefined;

    try {
      if (llmChatOnly) {
        const openAiMessages = history.map((m) => {
          if (m.role === 'user' && m.attachments?.length) {
            const c =
              m.content.trim() ||
              '请根据图片回答或描述内容。';
            return {
              role: 'user' as const,
              content: [
                { type: 'text' as const, text: c },
                ...m.attachments.map((a) => ({
                  type: 'binary' as const,
                  mimeType: a.mimeType,
                  data: a.base64Data
                }))
              ]
            };
          }
          return { role: m.role, content: m.content };
        });
        const assistantId = `a-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: 'assistant',
            content: '',
            streamPhase: 'connecting'
          }
        ]);

        const res = await fetch(`/api/chat?t=${Date.now()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          signal: abortRef.current.signal,
          body: JSON.stringify({
            messages: openAiMessages,
            stream: true
          })
        });

        const failAssistant = (errText: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: errText, streamPhase: undefined }
                : m
            )
          );
        };

        if (!res.ok) {
          const rawText = await res.text();
          let errMsg = rawText;
          try {
            const j = JSON.parse(rawText) as { error?: string };
            errMsg = j.error ?? rawText;
          } catch {
            /* keep */
          }
          failAssistant(`请求失败（HTTP ${res.status}）：${errMsg.slice(0, 500)}`);
          return;
        }

        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('text/event-stream') && !ct.includes('event-stream')) {
          const rawText = await res.text();
          try {
            const data = JSON.parse(rawText) as { content?: string; error?: string };
            if (data.error) {
              failAssistant(data.error);
              return;
            }
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: typeof data.content === 'string' ? data.content : '',
                      streamPhase: undefined
                    }
                  : m
              )
            );
          } catch {
            failAssistant(rawText.slice(0, 400));
          }
          return;
        }

        try {
          await consumeChatSse(res, (ev) => {
            if (ev.type === 'start') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, streamPhase: 'streaming' } : m
                )
              );
            }
            if (ev.type === 'delta' && typeof ev.text === 'string' && ev.text.length > 0) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: m.content + ev.text,
                        streamPhase: 'streaming'
                      }
                    : m
                )
              );
            }
            if (ev.type === 'done') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, streamPhase: undefined } : m
                )
              );
            }
            if (ev.type === 'error') {
              const msg = typeof ev.message === 'string' ? ev.message : '未知错误';
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content ? `${m.content}\n\n${msg}` : msg, streamPhase: undefined }
                    : m
                )
              );
            }
          });
        } catch (e) {
          failAssistant(`流式读取失败：${e instanceof Error ? e.message : String(e)}`);
        } finally {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId && m.streamPhase
                ? { ...m, streamPhase: undefined }
                : m
            )
          );
        }
        return;
      }

      const assistantId = `a-${Date.now()}`;
      a2uiAssistantIdForAbort = assistantId;
      agentLlmRawRef.current = '';
      agentJsonlAccumRef.current = '';
      setAgentProtocolView({ llm: '', jsonl: '' });
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          a2uiPhase: 'awaiting_model'
        }
      ]);

      const hasPriorA2uiAgentOutput = messages.some(
        (m) =>
          m.role === 'assistant' &&
          typeof m.llmRawOutput === 'string' &&
          m.llmRawOutput.trim().length > 0
      );

      const storeState = storeRef.current?.getState();
      const hasSurfaceInStore =
        !!storeState &&
        typeof storeState.surfaceMap === 'object' &&
        Object.keys(storeState.surfaceMap).length > 0;
      const forwardedProps =
        hasSurfaceInStore && storeState
          ? { a2uiCurrentProtocol: buildA2uiProtocolSnapshot(storeState) }
          : {};

      a2uiParser.endStream();
      if (!hasPriorA2uiAgentOutput) {
        a2uiParser.resetRuntimeState();
        bootstrapRenderer();
      }
      const createdStore = storeRef.current;
      a2uiParser.initStreamMode();

      const res = await fetch(`/api/agent?t=${Date.now()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          threadId: threadIdRef.current,
          runId: `run-${Date.now()}`,
          state: {},
          messages: chatMessagesToAgentApiPayload(history, {
            shortenAssistantWhenSnapshot: hasSurfaceInStore
          }),
          tools: [],
          context: [],
          forwardedProps
        })
      });

      a2uiClientDbg('fetch /api/agent response', {
        ok: res.ok,
        status: res.status,
        contentType: res.headers.get('content-type')
      });

      if (!res.ok) {
        const errBody = await res.text();
        let detail = errBody;
        try {
          const j = JSON.parse(errBody) as { error?: string };
          detail = j.error ?? errBody;
        } catch {
          /* keep */
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: `请求失败（HTTP ${res.status}）：${detail.slice(0, 500)}`,
                  a2uiPhase: 'done'
                }
              : m
          )
        );
        return;
      }

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/event-stream') && !ct.includes('event-stream')) {
        const raw = await res.text();
        const events = parseSseDataLinesToEvents(raw);
        let sawCustom = false;
        let llmAcc = '';
        let jsonlAcc = '';
        for (const ev of events) {
          const e = ev as Record<string, unknown>;
          if (
            e.type === 'CUSTOM' &&
            e.name === A2UI_LLM_RAW_NAME &&
            typeof e.value === 'string'
          ) {
            llmAcc = e.value as string;
            agentLlmRawRef.current = llmAcc;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, llmRawOutput: e.value as string } : m
              )
            );
          }
          const w = a2uiCustomEventToWriteString(e);
          if (w !== null) {
            jsonlAcc += w;
            agentJsonlAccumRef.current = jsonlAcc;
            if (!sawCustom) {
              sawCustom = true;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, a2uiPhase: 'rendering_protocol' } : m
                )
              );
            }
            a2uiParser.write(w);
          }
        }
        a2uiParser.endStream();
        a2uiParser.flushPendingRender();
        setStoreState(createdStore!.getState());
        setAgentProtocolView({ llm: llmAcc || agentLlmRawRef.current, jsonl: jsonlAcc });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: '已处理响应（非标准 SSE Content-Type，已尝试按 data: 行解析）。',
                  a2uiPhase: 'done'
                }
              : m
          )
        );
        return;
      }

      const { finishedSummary, runError } = await consumeAgentSse(
        res,
        (chunk) => {
          agentJsonlAccumRef.current += chunk;
          a2uiParser.write(chunk);
        },
        {
          onLlmRaw: (text) => {
            agentLlmRawRef.current = text;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, llmRawOutput: text } : m))
            );
          },
          onEvent: (ev) => {
            const t = ev.type as string | undefined;
            if (t === 'CUSTOM') {
              const name = ev.name as string | undefined;
              if (name === A2UI_LLM_RAW_NAME) return;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId && m.a2uiPhase !== 'done'
                    ? { ...m, a2uiPhase: 'rendering_protocol' }
                    : m
                )
              );
            }
          }
        }
      );
      a2uiParser.endStream();
      a2uiParser.flushPendingRender();
      setStoreState(createdStore!.getState());

      const assistantText =
        runError ?? finishedSummary ?? '流结束（未收到 RUN_FINISHED）。';
      setAgentProtocolView({
        llm: agentLlmRawRef.current,
        jsonl: agentJsonlAccumRef.current
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: assistantText, a2uiPhase: 'done' }
            : m
        )
      );
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        if (a2uiAssistantIdForAbort) {
          setAgentProtocolView({
            llm: agentLlmRawRef.current,
            jsonl: agentJsonlAccumRef.current
          });
          setMessages((prev) =>
            prev.map((m) =>
              m.id === a2uiAssistantIdForAbort
                ? { ...m, content: '已取消', a2uiPhase: 'done' }
                : m
            )
          );
        }
        return;
      }
      if (a2uiAssistantIdForAbort) {
        setAgentProtocolView({
          llm: agentLlmRawRef.current,
          jsonl: agentJsonlAccumRef.current
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === a2uiAssistantIdForAbort
              ? {
                  ...m,
                  content: `客户端错误：${e instanceof Error ? e.message : String(e)}`,
                  a2uiPhase: 'done'
                }
              : m
          )
        );
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: `客户端错误：${e instanceof Error ? e.message : String(e)}`
        }
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const openDebugDrawer = (tab: string) => {
    setActiveDebugTab(tab);
    setDebugDrawerOpen(true);
  };

  const applyPromptExample = (prompt: string) => {
    setChatInput(prompt);
    window.setTimeout(() => chatInputRef.current?.focus(), 0);
  };

  const storeSnapshot = storeRef.current?.getState?.() ?? storeState;
  const currentProtocolSnapshot = storeSnapshot
    ? JSON.stringify(buildA2uiProtocolSnapshot(storeSnapshot), null, 2)
    : '—';
  const storeJson = storeSnapshot ? JSON.stringify(storeSnapshot, null, 2) : '';
  const errorEntries = Object.entries(storeSnapshot?.errorMap || {}) as Array<[string, any]>;
  const errorCount = errorEntries.length;
  const componentCount = Object.keys(storeSnapshot?.hydrateNodeMap || {}).length;
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastRunFailed =
    !!lastAssistant?.content &&
    (lastAssistant.content.includes('请求失败') ||
      lastAssistant.content.includes('客户端错误') ||
      (lastAssistant.a2uiPhase === 'done' && !a2uiDoneTagOk(lastAssistant.content)));
  const previewStatus = llmChatOnly
    ? 'Chat 模式'
    : isStreaming
      ? '生成中'
      : lastRunFailed || errorCount > 0
        ? '需检查'
        : componentTree
          ? '已完成'
          : '待生成';
  const previewStatusColor =
    previewStatus === '已完成'
      ? 'success'
      : previewStatus === '需检查'
        ? 'error'
        : previewStatus === '生成中'
          ? 'processing'
          : 'default';
  const errorsJson = errorCount
    ? JSON.stringify(
        errorEntries.map(([id, error]) => ({ id, ...error })),
        null,
        2
      )
    : '';

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1677ff',
          colorBgLayout: '#f5f7fb',
          colorBorder: '#e5e7eb',
          colorText: '#1f2937',
          colorTextSecondary: '#6b7280',
          borderRadius: 10,
          fontSize: 14
        },
        components: {
          Button: { borderRadius: 8, controlHeight: 34 },
          Card: { borderRadiusLG: 12 },
          Input: { borderRadius: 8 },
          Select: { borderRadius: 8 }
        }
      }}
    >
      <Layout className="app-shell">
        <Sider width={360} className="agent-sider">
          <div className="agent-header">
            <div>
              <Title level={4} className="agent-title">
                Agent Playground
              </Title>
              <Text type="secondary">A2UI 生成与调试控制台</Text>
            </div>
            <Tag color={llmChatOnly ? 'purple' : 'blue'}>{llmChatOnly ? 'Chat' : 'Agent'}</Tag>
          </div>

          <div className="panel-section">
            <Flex justify="space-between" align="center" className="section-title">
              <Text strong>运行配置</Text>
              <Tooltip title="Agent 会请求 /api/agent 并流式渲染 A2UI；Chat 只请求 /api/chat，不更新预览。">
                <Text type="secondary">说明</Text>
              </Tooltip>
            </Flex>
            <Segmented
              block
              value={llmChatOnly ? 'chat' : 'agent'}
              options={[
                { label: 'Agent', value: 'agent' },
                { label: 'Chat', value: 'chat' }
              ]}
              onChange={(value) => setLlmChatOnly(value === 'chat')}
            />
            <div className="config-meta">
              <Text type="secondary">
                {llmChatOnly
                  ? '仅模型对话：不会请求 /api/agent，也不会更新右侧 A2UI 画布。'
                  : 'Agent 模式：支持多轮微调、图片输入和 SSE 协议流式渲染。'}
              </Text>
            </div>
          </div>

          <div className="panel-section">
            <Flex justify="space-between" align="center" className="section-title">
              <Text strong>Mock 场景</Text>
              <Tooltip title="本地模拟流会直接将选中 mock 写入解析器，用于快速检查渲染与 store。">
                <Text type="secondary">调试</Text>
              </Tooltip>
            </Flex>
            <Select value={scenario} onChange={setScenario} disabled={llmChatOnly} className="full-width">
              {SCENARIO_OPTIONS.map((item) => (
                <Option key={item.value} value={item.value}>
                  {item.label}
                </Option>
              ))}
            </Select>
            <div className="scenario-desc">
              <Text strong>{selectedScenario.label}</Text>
              <Text type="secondary">{selectedScenario.description}</Text>
            </div>
            <Button
              block
              type="primary"
              ghost
              loading={isStreaming && !llmChatOnly}
              onClick={() => void simulateStream()}
              disabled={isStreaming || llmChatOnly}
            >
              {isStreaming && !llmChatOnly ? '正在生成...' : componentTree ? '重新生成 Mock 页面' : '生成 Mock 页面'}
            </Button>
          </div>

          <div className="history-section">
            <Flex justify="space-between" align="center" className="section-title">
              <Text strong>生成记录</Text>
              <Tag color={previewStatusColor}>{previewStatus}</Tag>
            </Flex>
            {messages.length === 0 ? (
              componentTree ? (
                <div className="message-card assistant">
                  <Flex justify="space-between" align="center" gap={8}>
                    <Text strong>Mock 流</Text>
                    <Tag color="success">已完成</Tag>
                  </Flex>
                  <div className="message-content">
                    {selectedScenario.label} 已渲染，当前组件数 {componentCount}。
                  </div>
                </div>
              ) : (
                <div className="empty-history">
                  <Text type="secondary">
                    {llmChatOnly
                      ? '发送消息后会在这里显示模型回复。'
                      : '发送 Prompt 或生成 Mock 后会在这里显示请求、流式状态和完成结果。'}
                  </Text>
                </div>
              )
            ) : (
              <Flex vertical gap={10}>
                {messages.map((m) => (
                  <div key={m.id} className={m.role === 'user' ? 'message-card user' : 'message-card assistant'}>
                    <Flex justify="space-between" align="center" gap={8}>
                      <Text strong>{m.role === 'user' ? '你' : 'Agent'}</Text>
                      {m.role === 'assistant' && m.a2uiPhase === 'done' && m.content ? (
                        <Tag color={a2uiDoneTagOk(m.content) ? 'success' : 'error'}>
                          {a2uiDoneTagOk(m.content) ? '已完成' : '未正常完成'}
                        </Tag>
                      ) : null}
                    </Flex>
                    {m.role === 'assistant' && m.a2uiPhase === 'awaiting_model' && (
                      <Flex align="center" gap={8} className="message-status">
                        <Spin size="small" />
                        <Text type="secondary">模型返回中...</Text>
                      </Flex>
                    )}
                    {m.role === 'assistant' && m.a2uiPhase === 'rendering_protocol' && (
                      <Flex align="center" gap={8} className="message-status">
                        <Spin size="small" />
                        <Text type="secondary">协议渲染中...</Text>
                      </Flex>
                    )}
                    {m.role === 'assistant' && !m.a2uiPhase && m.streamPhase === 'connecting' && (
                      <Flex align="center" gap={8} className="message-status">
                        <Spin size="small" />
                        <Text type="secondary">正在连接模型...</Text>
                      </Flex>
                    )}
                    {m.role === 'assistant' && !m.a2uiPhase && m.streamPhase === 'streaming' && !m.content && (
                      <Flex align="center" gap={8} className="message-status">
                        <Spin size="small" />
                        <Text type="secondary">正在生成...</Text>
                      </Flex>
                    )}
                    {m.role === 'user' && m.attachments?.length ? (
                      <Flex wrap="wrap" gap={8} className="message-images">
                        {m.attachments.map((a, idx) => (
                          <img key={a.id ?? `${m.id}-img-${idx}`} alt="" src={`data:${a.mimeType};base64,${a.base64Data}`} />
                        ))}
                      </Flex>
                    ) : null}
                    {m.content ? <div className="message-content">{m.content}</div> : null}
                    {m.role === 'assistant' && m.llmRawOutput && (
                      <Collapse
                        size="small"
                        className="raw-collapse"
                        items={[
                          {
                            key: 'llm-raw',
                            label: '模型原始输出',
                            children: <pre className="raw-pre">{m.llmRawOutput}</pre>
                          }
                        ]}
                      />
                    )}
                    {m.role === 'assistant' && !m.a2uiPhase && m.streamPhase === 'streaming' && !!m.content && (
                      <Text type="secondary" className="streaming-text">
                        输出中...
                      </Text>
                    )}
                  </div>
                ))}
              </Flex>
            )}
          </div>

          <div className="prompt-panel">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden-file"
              onChange={onImageFilesSelected}
            />
            <Flex justify="space-between" align="center" className="section-title">
              <Text strong>输入 Prompt</Text>
              <Button type="link" size="small" onClick={() => setChatInput('')} disabled={!chatInput || isStreaming}>
                清空
              </Button>
            </Flex>
            <Space wrap className="prompt-examples">
              {[
                ['统计页', '生成一个用户统计信息页面，包含关键指标和刷新按钮'],
                ['表单', '生成一个用户信息表单，包含姓名、邮箱、年龄和提交按钮'],
                ['Dashboard', '生成一个设备监控 Dashboard，包含状态卡片和告警列表'],
                ['错误状态', '生成一个渲染失败后的错误状态页面，包含重试操作']
              ].map(([label, prompt]) => (
                <Tag key={label} className="prompt-chip" onClick={() => applyPromptExample(prompt)}>
                  {label}
                </Tag>
              ))}
            </Space>
            {pendingAttachments.length > 0 ? (
              <div className="attachment-panel">
                <Flex justify="space-between" align="center">
                  <Text type="secondary">待发送图片（{pendingAttachments.length}/{MAX_CHAT_IMAGES}）</Text>
                  <Button type="link" size="small" danger onClick={() => setPendingAttachments([])}>
                    全部移除
                  </Button>
                </Flex>
                <Flex wrap="wrap" gap={10} className="attachment-list">
                  {pendingAttachments.map((a, idx) => (
                    <div key={a.id ?? `pending-${idx}`} className="attachment-thumb">
                      <img alt="" src={`data:${a.mimeType};base64,${a.base64Data}`} />
                      <button
                        type="button"
                        title="移除此图"
                        aria-label="移除此图"
                        onClick={() =>
                          setPendingAttachments((prev) =>
                            prev.filter((x, i) => (a.id != null ? x.id !== a.id : i !== idx))
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </Flex>
              </div>
            ) : null}
            <TextArea
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="请描述你想生成的页面、组件或交互..."
              autoSize={{ minRows: 3, maxRows: 6 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  void sendAgentMessage();
                }
              }}
              disabled={isStreaming}
            />
            <Flex justify="space-between" align="center" className="prompt-actions">
              <Space>
                <Button onClick={onPickImages} disabled={isStreaming || pendingAttachments.length >= MAX_CHAT_IMAGES}>
                  上传图片
                </Button>
                <Text type="secondary">≤ {MAX_IMAGE_BYTES / (1024 * 1024)}MB/张</Text>
              </Space>
              <Button type="primary" loading={isStreaming} onClick={() => void sendAgentMessage()}>
                {isStreaming ? '发送中...' : '发送'}
              </Button>
            </Flex>
          </div>
        </Sider>

        <Layout className="workspace-layout">
          <Header className="top-toolbar">
            <div>
              <Title level={4} className="workspace-title">
                A2UI Playground
              </Title>
              <Text type="secondary">实时渲染 Agent 输出的 A2UI 页面</Text>
            </div>
            <Space wrap>
              <Tag color={llmChatOnly ? 'purple' : 'blue'}>{llmChatOnly ? 'Chat 模式' : 'Agent 模式'}</Tag>
              <Tag color={previewStatusColor}>状态：{previewStatus}</Tag>
              <Tag>组件数：{componentCount}</Tag>
              <Button onClick={() => openDebugDrawer('json')}>协议 JSON</Button>
              <Button onClick={() => openDebugDrawer('store')}>状态树</Button>
              <Badge count={errorCount} size="small">
                <Button danger={errorCount > 0} onClick={() => openDebugDrawer('errors')}>
                  错误
                </Button>
              </Badge>
            </Space>
          </Header>

          <Content className="workspace-content">
            <div className="preview-shell">
              <Flex justify="space-between" align="center" gap={12} wrap="wrap" className="preview-header">
                <div>
                  <Text strong>{llmChatOnly ? 'A2UI 预览已跳过' : 'Preview'}</Text>
                  <div>
                    <Text type="secondary">
                      {llmChatOnly
                        ? '当前只进行模型对话，右侧画布不会接收 A2UI 协议。'
                        : 'Ctrl/⌘ + 点击预览元素可将组件 id 写入左侧输入框。'}
                    </Text>
                  </div>
                </div>
                <Space>
                  {isStreaming ? <Spin size="small" /> : null}
                  <Tag color={previewStatusColor}>{previewStatus}</Tag>
                </Space>
              </Flex>

              {lastRunFailed || errorCount > 0 ? (
                <Alert
                  className="preview-alert"
                  type="error"
                  showIcon
                  message="渲染需要检查"
                  description="最近一次生成未正常完成，或 Store 中存在解析/渲染错误。可打开协议 JSON 与错误面板定位问题。"
                  action={
                    <Space>
                      <Button size="small" onClick={() => openDebugDrawer('json')}>
                        查看 JSON
                      </Button>
                      <Button size="small" danger onClick={() => openDebugDrawer('errors')}>
                        查看错误
                      </Button>
                    </Space>
                  }
                />
              ) : null}

              <div className="preview-canvas-wrap">
                {llmChatOnly ? (
                  <div className="preview-empty">
                    <div className="preview-empty-card">
                      <div className="preview-empty-mark">CHAT</div>
                      <div className="preview-empty-title">Chat 模式下不渲染 A2UI</div>
                      <div className="preview-empty-desc">
                        当前只进行模型对话，不会请求 <code>/api/agent</code> 或更新右侧画布。
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="preview-canvas-stack">
                    {!componentTree ? (
                      <div className="a2ui-preview-placeholder">
                        <div className="preview-empty-card">
                          <div className="preview-empty-mark">A2UI</div>
                          <div className="preview-empty-title">等待 A2UI 预览</div>
                          <div className="preview-empty-desc">
                            左侧发送消息后，将通过 SSE 流式接收并渲染。服务端默认端口为 <code>3847</code>。
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div
                      ref={renderRef}
                      onPointerDownCapture={handlePreviewPointerDownCapture}
                      className="preview-canvas"
                    />
                  </div>
                )}
              </div>
            </div>
          </Content>
        </Layout>

        <Drawer
          title="调试面板"
          width={680}
          open={debugDrawerOpen}
          onClose={() => setDebugDrawerOpen(false)}
          destroyOnClose={false}
        >
          <Tabs
            activeKey={activeDebugTab}
            onChange={setActiveDebugTab}
            items={[
              {
                key: 'json',
                label: '协议 JSON',
                children: (
                  <>
                    <Text type="secondary" className="drawer-intro">
                      最近一次 /api/agent 的模型原文、JSONL 协议流，以及当前 store 反推协议。
                    </Text>
                    {agentProtocolView.llm ? (
                      <JsonViewer
                        title="模型返回（完整）"
                        value={formatAgentLlmRawDisplay(agentProtocolView.llm)}
                        search={debugSearch}
                        onSearch={setDebugSearch}
                      />
                    ) : null}
                    {agentProtocolView.jsonl ? (
                      <JsonViewer
                        title="下发 JSONL"
                        description="与解析器输入一致。"
                        value={formatJsonlLinesPretty(agentProtocolView.jsonl)}
                        search={debugSearch}
                        onSearch={setDebugSearch}
                      />
                    ) : null}
                    <Divider plain>当前 store 反推</Divider>
                    <JsonViewer
                      title="A2UI 协议快照"
                      description="字段顺序或 path 可能与原始下发 JSONL 略有差异。"
                      value={currentProtocolSnapshot}
                      search={debugSearch}
                      onSearch={setDebugSearch}
                    />
                  </>
                )
              },
              {
                key: 'store',
                label: '状态树',
                children: (
                  <>
                    <div className="store-summary">
                      <Tag>组件总数：{componentCount}</Tag>
                      <Tag>错误数：{errorCount}</Tag>
                      <Tag>Surface：{Object.keys(storeSnapshot?.surfaceMap || {}).length}</Tag>
                    </div>
                    {storeSnapshot?.dataModelBySurfaceId &&
                    Object.keys(storeSnapshot.dataModelBySurfaceId).length > 0 ? (
                      <JsonViewer
                        title="数据模型"
                        value={JSON.stringify(storeSnapshot.dataModelBySurfaceId, null, 2)}
                        search={debugSearch}
                        onSearch={setDebugSearch}
                      />
                    ) : null}
                    <JsonViewer title="Store State" value={storeJson} search={debugSearch} onSearch={setDebugSearch} />
                  </>
                )
              },
              {
                key: 'errors',
                label: `错误 ${errorCount}`,
                children:
                  errorCount > 0 ? (
                    <Flex vertical gap={12}>
                      {errorEntries.map(([errorId, error]) => (
                        <Alert key={errorId} message={error.type} description={error.content} type="error" showIcon />
                      ))}
                      <JsonViewer title="Errors JSON" value={errorsJson} search={debugSearch} onSearch={setDebugSearch} />
                    </Flex>
                  ) : (
                    <div className="debug-empty">当前没有错误</div>
                  )
              }
            ]}
          />
        </Drawer>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
