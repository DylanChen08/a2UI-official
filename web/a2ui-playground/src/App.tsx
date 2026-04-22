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
  Modal,
  Switch,
  Tag,
  Collapse,
  message
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

const { Title, Text } = Typography;
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
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isErrorModalVisible, setIsErrorModalVisible] = useState(false);
  const [isProtocolModalVisible, setIsProtocolModalVisible] = useState(false);
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
    const el = renderRef.current;
    if (!el) return;
    if (!previewRootRef.current) {
      previewRootRef.current = ReactDOM.createRoot(el);
    }
    if (componentTree) {
      previewRootRef.current.render(componentTree);
    } else {
      previewRootRef.current.render(
        <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>
          暂无 A2UI 预览。左侧发送消息，将通过 SSE 流式接收并渲染（需本机运行 <code>pnpm dev:server</code>，默认端口 3847）。
        </div>
      );
    }
  }, [componentTree]);

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

  const showModal = () => setIsModalVisible(true);
  const handleCancel = () => setIsModalVisible(false);
  const showErrorModal = () => setIsErrorModalVisible(true);
  const handleErrorModalCancel = () => setIsErrorModalVisible(false);
  const showProtocolModal = () => setIsProtocolModalVisible(true);
  const handleProtocolModalCancel = () => setIsProtocolModalVisible(false);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f5f5f5' }}>
      <div
        style={{
          width: 420,
          minWidth: 320,
          borderRight: '1px solid #e8e8e8',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff'
        }}
      >
        <div style={{ padding: '16px 16px 8px' }}>
          <Flex justify="space-between" align="flex-start" gap={12}>
            <div style={{ flex: 1 }}>
              <Title level={4} style={{ margin: 0 }}>
                Agent 对话
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {llmChatOnly
                  ? '已开启「仅模型对话」：请求 POST /api/chat，不加载 A2UI。'
                  : '右侧为 A2UI 预览；多轮对话可在同一画布上微调（后续轮次会带上上一轮协议 JSON）。服务端将 JSONL 切片为 CUSTOM / a2ui.jsonl.chunk 流式推送。'}
              </Text>
            </div>
            <Flex align="center" gap={8} style={{ flexShrink: 0 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                仅模型对话
              </Text>
              <Switch checked={llmChatOnly} onChange={setLlmChatOnly} />
            </Flex>
          </Flex>
        </div>
        <div style={{ padding: '0 16px 12px' }}>
          <Text strong style={{ display: 'block', marginBottom: 6 }}>
            本地模拟流 · 场景
          </Text>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            {llmChatOnly
              ? '关闭「仅模型对话」后可选择场景并走 /api/agent 或本地模拟流。'
              : '通过 /api/agent 时服务端每次随机选复合场景 mock；「本地模拟流」使用下方选择。'}
          </Text>
          <Select
            value={scenario}
            style={{ width: '100%' }}
            onChange={setScenario}
            disabled={llmChatOnly}
          >
            <Option value="complex-nested-tree">Complex Nested Tree</Option>
            <Option value="row-column-mixed">Row and Column Mixed</Option>
            <Option value="card-demo">Card Demo</Option>
            <Option value="data-binding-smoke">Data binding</Option>
            <Option value="list-template-smoke">List + template</Option>
            <Option value="cart-list-smoke">Shopping cart list</Option>
            <Option value="local-action-text-demo">Local action → dataModel</Option>
            <Option value="agent-back">Agent back（测试列+文案+按钮）</Option>
          </Select>
        </div>
        <Divider style={{ margin: 0 }} />
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {messages.length === 0 ? (
            <Text type="secondary">
              {llmChatOnly
                ? '输入消息后发送，将调用 POST /api/chat（需在服务端 .env 配置 OPENAI_API_KEY）。'
                : '可附加图片（多模态），输入消息后发送，将通过 /api/agent 流式加载右侧预览；可继续发消息做文案/布局微调。'}
            </Text>
          ) : (
            <Flex vertical gap={12} style={{ width: '100%' }}>
              {messages.map((m) => (
                <Flex key={m.id} justify={m.role === 'user' ? 'flex-end' : 'flex-start'}>
                  <Card
                    size="small"
                    styles={{
                      body: { padding: '8px 12px' }
                    }}
                    style={{
                      maxWidth: '100%',
                      background: m.role === 'user' ? '#e6f4ff' : '#fafafa',
                      borderColor: '#f0f0f0'
                    }}
                  >
                    {m.role === 'assistant' && m.a2uiPhase === 'awaiting_model' && (
                      <Flex align="center" gap={8}>
                        <Spin size="small" />
                        <Text type="secondary">模型返回中…</Text>
                      </Flex>
                    )}
                    {m.role === 'assistant' && m.a2uiPhase === 'rendering_protocol' && (
                      <Flex align="center" gap={8}>
                        <Spin size="small" />
                        <Text type="secondary">协议渲染中…</Text>
                      </Flex>
                    )}
                    {m.role === 'assistant' && !m.a2uiPhase && m.streamPhase === 'connecting' && (
                      <Flex align="center" gap={8} style={{ marginBottom: m.content ? 8 : 0 }}>
                        <Spin size="small" />
                        <Text type="secondary">正在连接模型…</Text>
                      </Flex>
                    )}
                    {m.role === 'assistant' &&
                      !m.a2uiPhase &&
                      m.streamPhase === 'streaming' &&
                      !m.content && (
                        <Flex align="center" gap={8}>
                          <Spin size="small" />
                          <Text type="secondary">正在生成…</Text>
                        </Flex>
                      )}
                    {m.role === 'user' && m.attachments?.length ? (
                      <Flex wrap="wrap" gap={8} style={{ marginBottom: m.content ? 8 : 0 }}>
                        {m.attachments.map((a, idx) => (
                          <img
                            key={a.id ?? `${m.id}-img-${idx}`}
                            alt=""
                            src={`data:${a.mimeType};base64,${a.base64Data}`}
                            style={{
                              maxWidth: 160,
                              maxHeight: 160,
                              objectFit: 'cover',
                              borderRadius: 4,
                              border: '1px solid #d9d9d9'
                            }}
                          />
                        ))}
                      </Flex>
                    ) : null}
                    {m.content || (m.role === 'user' && m.attachments?.length) ? (
                      <div>
                        {m.content ? (
                          <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {m.content}
                          </Text>
                        ) : null}
                        {m.role === 'assistant' && m.a2uiPhase === 'done' && m.content ? (
                          <Tag
                            color={a2uiDoneTagOk(m.content) ? 'success' : 'error'}
                            style={{ marginTop: 8 }}
                          >
                            {a2uiDoneTagOk(m.content) ? '已完成' : '未正常完成'}
                          </Tag>
                        ) : null}
                      </div>
                    ) : null}
                    {m.role === 'assistant' && m.llmRawOutput && (
                      <Collapse
                        size="small"
                        style={{ marginTop: m.content ? 8 : 0 }}
                        items={[
                          {
                            key: 'llm-raw',
                            label: '模型原始输出（调试）',
                            children: (
                              <pre
                                style={{
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-all',
                                  maxHeight: 360,
                                  overflow: 'auto',
                                  fontSize: 11,
                                  margin: 0
                                }}
                              >
                                {m.llmRawOutput}
                              </pre>
                            )
                          }
                        ]}
                      />
                    )}
                    {m.role === 'assistant' &&
                      !m.a2uiPhase &&
                      m.streamPhase === 'streaming' &&
                      !!m.content && (
                        <Text type="secondary" style={{ fontSize: 12, marginTop: 6 }}>
                          输出中…
                        </Text>
                      )}
                  </Card>
                </Flex>
              ))}
            </Flex>
          )}
        </div>
        <div style={{ padding: 16, borderTop: '1px solid #f0f0f0' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={onImageFilesSelected}
          />
          {pendingAttachments.length > 0 ? (
            <div
              style={{
                marginBottom: 10,
                padding: '10px 12px',
                background: '#fafafa',
                border: '1px solid #f0f0f0',
                borderRadius: 8
              }}
            >
              <Flex justify="space-between" align="center" style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  待发送图片（{pendingAttachments.length}/{MAX_CHAT_IMAGES}）
                </Text>
                <Button
                  type="link"
                  size="small"
                  danger
                  style={{ padding: 0, height: 'auto' }}
                  onClick={() => setPendingAttachments([])}
                >
                  全部移除
                </Button>
              </Flex>
              <Flex wrap="wrap" gap={10}>
                {pendingAttachments.map((a, idx) => (
                  <div
                    key={a.id ?? `pending-${idx}`}
                    style={{
                      position: 'relative',
                      width: 96,
                      height: 96,
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: '1px solid #d9d9d9',
                      flexShrink: 0,
                      background: '#fff'
                    }}
                  >
                    <img
                      alt=""
                      src={`data:${a.mimeType};base64,${a.base64Data}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                    />
                    <button
                      type="button"
                      title="移除此图"
                      aria-label="移除此图"
                      onClick={() =>
                        setPendingAttachments((prev) =>
                          prev.filter((x, i) => (a.id != null ? x.id !== a.id : i !== idx))
                        )
                      }
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 26,
                        height: 26,
                        border: 'none',
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.55)',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: 16,
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.25)'
                      }}
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
            placeholder="输入消息…可点「附加图片」选择截图（多模态）；Enter 发送，Shift+Enter 换行"
            autoSize={{ minRows: 2, maxRows: 6 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                void sendAgentMessage();
              }
            }}
            disabled={isStreaming}
          />
          <Flex justify="space-between" align="center" style={{ marginTop: 8 }}>
            <Button
              onClick={onPickImages}
              disabled={isStreaming || pendingAttachments.length >= MAX_CHAT_IMAGES}
            >
              附加图片
            </Button>
            <Text type="secondary" style={{ fontSize: 12 }}>
              最多 {MAX_CHAT_IMAGES} 张，单张 ≤ {MAX_IMAGE_BYTES / (1024 * 1024)}MB
            </Text>
            <Button type="primary" loading={isStreaming} onClick={() => void sendAgentMessage()}>
              发送
            </Button>
          </Flex>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, padding: 16 }}>
        <Flex justify="space-between" align="center" style={{ marginBottom: 12 }} wrap="wrap" gap={8}>
          <Title level={4} style={{ margin: 0 }}>
            A2UI Playground
          </Title>
          <Space wrap>
            <Button type="primary" onClick={showModal}>
              View Store
            </Button>
            <Button danger onClick={showErrorModal}>
              View Errors
            </Button>
            <Button onClick={showProtocolModal}>View A2UI JSON</Button>
            <Button
              type="dashed"
              onClick={() => void simulateStream()}
              disabled={isStreaming || llmChatOnly}
            >
              {isStreaming ? 'Streaming…' : '本地模拟流'}
            </Button>
          </Space>
        </Flex>

        <Card
          title={
            <Space wrap>
              <span>{llmChatOnly ? 'A2UI 预览（已跳过）' : '预览区'}</span>
              {!llmChatOnly && (
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                  Ctrl/⌘ + 点击元素可将组件 id 写入左侧输入框
                </Text>
              )}
              {isStreaming && <Spin size="small" />}
            </Space>
          }
          styles={{ body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {llmChatOnly ? (
            <div
              style={{
                flex: 1,
                minHeight: 280,
                border: '1px dashed #d9d9d9',
                padding: 24,
                borderRadius: 4,
                background: '#fafafa',
                color: '#666'
              }}
            >
              <Text>
                当前为<strong>仅模型对话</strong>模式：不请求 <Text code>/api/agent</Text>，不渲染
                A2UI。请在左侧查看助手回复；配置见服务端{' '}
                <Text code>.env</Text> 中 <Text code>OPENAI_API_KEY</Text>、
                <Text code>OPENAI_BASE_URL</Text>、<Text code>OPENAI_MODEL</Text>。
              </Text>
            </div>
          ) : (
            <div
              ref={renderRef}
              onPointerDownCapture={handlePreviewPointerDownCapture}
              style={{
                flex: 1,
                minHeight: 280,
                border: '1px dashed #ccc',
                padding: 20,
                borderRadius: 4,
                overflow: 'auto',
                background: '#fff',
                cursor: 'default'
              }}
            />
          )}
        </Card>
      </div>

      <Modal
        title="Store State"
        open={isModalVisible}
        onCancel={handleCancel}
        footer={[
          <Button key="close" onClick={handleCancel}>
            Close
          </Button>
        ]}
        width={800}
      >
        {storeState ? (
          <>
            <div style={{ marginBottom: 15, padding: 10, backgroundColor: '#f0f2f5', borderRadius: 4 }}>
              <Text strong>组件总数: </Text>
              <Text>{Object.keys(storeState.hydrateNodeMap || {}).length}</Text>
            </div>
            {storeState.dataModelBySurfaceId &&
              Object.keys(storeState.dataModelBySurfaceId).length > 0 && (
                <div style={{ marginBottom: 15, padding: 10, backgroundColor: '#e6f7ff', borderRadius: 4 }}>
                  <Text strong>数据模型 (dataModelBySurfaceId)</Text>
                  <pre
                    style={{
                      marginTop: 8,
                      marginBottom: 0,
                      background: '#fff',
                      padding: 10,
                      borderRadius: 4,
                      overflow: 'auto',
                      maxHeight: 200
                    }}
                  >
                    {JSON.stringify(storeState.dataModelBySurfaceId, null, 2)}
                  </pre>
                </div>
              )}
            <pre
              style={{
                background: '#f5f5f5',
                padding: 15,
                borderRadius: 5,
                overflow: 'auto',
                maxHeight: 500
              }}
            >
              {JSON.stringify(storeState, null, 2)}
            </pre>
          </>
        ) : (
          <Text type="secondary">Loading store...</Text>
        )}
      </Modal>

      <Modal
        title="Errors"
        open={isErrorModalVisible}
        onCancel={handleErrorModalCancel}
        footer={[
          <Button key="close" onClick={handleErrorModalCancel}>
            Close
          </Button>
        ]}
        width={600}
      >
        {storeState && Object.keys(storeState.errorMap || {}).length > 0 ? (
          <div>
            {Object.entries(storeState.errorMap).map(([errorId, error]: [string, any]) => (
              <Alert
                key={errorId}
                message={error.type}
                description={error.content}
                type="error"
                style={{ marginBottom: 10 }}
              />
            ))}
          </div>
        ) : (
          <Text type="secondary">No errors</Text>
        )}
      </Modal>

      <Modal
        title="View A2UI JSON"
        open={isProtocolModalVisible}
        onCancel={handleProtocolModalCancel}
        footer={[
          <Button key="close" onClick={handleProtocolModalCancel}>
            Close
          </Button>
        ]}
        width={900}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          最近一次 <Text code>/api/agent</Text>：无论解析是否成功，均可查看模型完整输出与服务端下发的 JSONL（与解析器输入一致）。
        </Text>
        {agentProtocolView.llm ? (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>
              模型返回（完整）
            </Text>
            <pre
              style={{
                background: '#f5f5f5',
                padding: 12,
                borderRadius: 4,
                overflow: 'auto',
                maxHeight: 280,
                margin: 0,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {formatAgentLlmRawDisplay(agentProtocolView.llm)}
            </pre>
          </div>
        ) : null}
        {agentProtocolView.jsonl ? (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>
              下发 JSONL（协议流，与解析器输入一致）
            </Text>
            <pre
              style={{
                background: '#f0f7ff',
                padding: 12,
                borderRadius: 4,
                overflow: 'auto',
                maxHeight: 280,
                margin: 0,
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {formatJsonlLinesPretty(agentProtocolView.jsonl)}
            </pre>
          </div>
        ) : null}
        {!agentProtocolView.llm && !agentProtocolView.jsonl ? (
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            尚无最近一次 Agent 流记录（未发送 /api/agent 或请求失败）。以下为当前 store 反推协议：
          </Text>
        ) : (
          <Divider plain style={{ margin: '12px 0' }}>
            当前 store 反推（可选对照）
          </Divider>
        )}
        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
          由当前 store 中的 surface、组件 protocal 与数据模型反推，与原始下发 JSONL 的字段顺序或 path 可能略有差异。
        </Text>
        <pre
          style={{
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 4,
            overflow: 'auto',
            maxHeight: 360,
            margin: 0,
            fontSize: 12
          }}
        >
          {storeRef.current
            ? JSON.stringify(buildA2uiProtocolSnapshot(storeRef.current.getState()), null, 2)
            : '—'}
        </pre>
      </Modal>
    </div>
  );
}

export default App;
