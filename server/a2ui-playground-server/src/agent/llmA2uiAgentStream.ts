import type { z } from 'zod';
import type OpenAI from 'openai';
import {
  EventType,
  RunAgentInputSchema,
  type BaseEvent,
  type CustomEvent,
  type RunFinishedEvent,
  type RunStartedEvent
} from '@ag-ui/core';
import { getDefaultChatModel, getVisionChatModel } from '../provider';
import {
  agUiPartsToOpenAiContentParts,
  runAgentInputHasUserImages,
  type AgUiContentPart
} from './agUiContentToOpenAi';
import { buildA2uiAgentSystemPrompt } from '../prompt';
import { splitCombinedA2uiMessage } from '../a2ui/splitCombinedMessage';
import { mergeA2uiProtocol } from '../a2ui/mergeA2uiProtocol';
import {
  a2uiAgentDbg,
  a2uiAgentInfo,
  logA2uiLlmAssistantRaw,
  logA2uiSystemPromptFull
} from '../debug/a2uiAgentLog';
import { executeServerTool } from './executeServerTool';

type RunAgentInput = z.infer<typeof RunAgentInputSchema>;

const A2UI_JSONL_CHUNK_NAME = 'a2ui.jsonl.chunk';
/** 完整 LLM 文本，供 Playground 调试（与解析成功与否无关） */
const A2UI_LLM_RAW_NAME = 'a2ui.llm.raw';

const CHUNK_GAP_MS_MIN = 20;
const CHUNK_GAP_MS_MAX = 120;
const PROTO_CHUNK_CHARS_MIN = 4;
const PROTO_CHUNK_CHARS_MAX = 48;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

async function sleepRandomGap(min: number, max: number): Promise<void> {
  await sleep(randomBetween(min, max));
}

function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 从 AG-UI Message 抽取可送入 OpenAI 的纯文本 */
function extractMessagePlainText(m: { role: string; content?: unknown }): string | null {
  const c = m.content;
  if (typeof c === 'string' && c.trim()) return c.trim();
  if (Array.isArray(c)) {
    const parts: string[] = [];
    for (const p of c) {
      if (p && typeof p === 'object' && 'type' in p) {
        const o = p as { type?: string; text?: string };
        if (o.type === 'text' && typeof o.text === 'string') parts.push(o.text);
      }
    }
    const joined = parts.join('\n').trim();
    return joined || null;
  }
  return null;
}

function shouldInjectCurrentProtocol(proto: unknown): boolean {
  if (proto == null || typeof proto !== 'object') return false;
  const p = proto as Record<string, unknown>;
  if (p._note === 'No surface in store') return false;
  return !!(p.beginRendering || p.surfaceUpdate);
}

function injectSnapshotIntoUserText(text: string, proto: unknown): string {
  return `【当前画布协议快照（Playground 从已渲染状态导出，与右侧预览一致）】\n${JSON.stringify(
    proto
  )}\n\n【用户本次指令】\n${text}`;
}

/**
 * RunAgentInput → OpenAI messages：首条为 A2UI 中文 system prompt，其余为 user/assistant 轮次（文本或多模态图片）。
 * `forwardedProps.a2uiCurrentProtocol` 存在时，在**最后一条 user** 中注入「当前画布协议快照」（纯文本或与首段 text 合并）。
 */
export function buildOpenAiMessagesForA2uiAgent(
  input: RunAgentInput
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const fp = input.forwardedProps as { a2uiCurrentProtocol?: unknown } | undefined;
  const proto = fp?.a2uiCurrentProtocol;

  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildA2uiAgentSystemPrompt() }
  ];

  const msgList = input.messages ?? [];
  let lastUserIdx = -1;
  for (let i = msgList.length - 1; i >= 0; i--) {
    if (msgList[i]?.role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  for (let i = 0; i < msgList.length; i++) {
    const m = msgList[i];
    if (m.role !== 'user' && m.role !== 'assistant') continue;

    if (m.role === 'assistant') {
      const text = extractMessagePlainText(m as { role: string; content?: unknown });
      if (!text) continue;
      out.push({ role: 'assistant', content: text });
      continue;
    }

    const inject =
      shouldInjectCurrentProtocol(proto) && i === lastUserIdx ? (proto as unknown) : null;

    const rawContent = (m as { content?: unknown }).content;
    if (typeof rawContent === 'string') {
      let text = rawContent.trim();
      if (!text) continue;
      if (inject != null) text = injectSnapshotIntoUserText(text, inject);
      out.push({ role: 'user', content: text });
      continue;
    }

    if (Array.isArray(rawContent)) {
      const parts = rawContent.map((p) => ({ ...(p as object) })) as AgUiContentPart[];
      if (parts.length === 0) continue;

      if (inject != null) {
        const snapPrefix = `【当前画布协议快照（Playground 从已渲染状态导出，与右侧预览一致）】\n${JSON.stringify(
          inject
        )}\n\n【用户本次指令】\n`;
        let hitText = false;
        for (const p of parts) {
          if (p.type === 'text' && typeof p.text === 'string') {
            p.text = snapPrefix + p.text;
            hitText = true;
            break;
          }
        }
        if (!hitText) {
          parts.unshift({
            type: 'text',
            text:
              snapPrefix +
              '（本条仅含图片时，请结合图片与界面需求输出符合 A2UI 的合并 JSON。）'
          });
        }
      }

      let oaParts = agUiPartsToOpenAiContentParts(parts);
      if (oaParts.length === 0) continue;
      const hasText = oaParts.some((x) => x.type === 'text');
      if (!hasText) {
        oaParts = [{ type: 'text', text: '请根据图片生成符合 A2UI 的合并 JSON。' }, ...oaParts];
      }
      out.push({ role: 'user', content: oaParts });
      continue;
    }
  }

  if (out.length === 1) {
    out.push({
      role: 'user',
      content: '请根据需求生成符合 A2UI 的合并 JSON（可含 beginRendering、surfaceUpdate、dataModelUpdate 等顶层键）。'
    });
  }
  return out;
}

function toOpenAiTools(
  tools: RunAgentInput['tools']
): OpenAI.Chat.ChatCompletionTool[] {
  if (!tools?.length) return [];
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: (t.parameters ?? { type: 'object', properties: {} }) as Record<
        string,
        unknown
      >
    }
  }));
}

function tryParseJsonObject(s: string): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(s) as unknown;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return obj as Record<string, unknown>;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** 从文本中切出顶层 JSON 对象片段（支持多对象紧挨或换行，忽略字符串内的括号） */
function extractTopLevelJsonObjects(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (c === '\\') {
        esc = true;
      } else if (c === '"') {
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

/**
 * 解析模型返回中的 JSON（去掉可选 markdown 围栏）。
 * 支持单行对象、JSONL（每行一个对象）、或同一文本内多个顶层对象（合并为一条）。
 */
export function parseLlmJsonFromAssistantContent(raw: string): Record<string, unknown> {
  let t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m;
  const fm = t.match(fence);
  if (fm) t = fm[1].trim();

  const single = tryParseJsonObject(t);
  if (single) return single;

  const merged: Record<string, unknown> = {};
  const lines = t.split(/\r?\n/);
  for (const line of lines) {
    const lineTrim = line.trim();
    if (!lineTrim || !lineTrim.startsWith('{')) continue;
    const part = tryParseJsonObject(lineTrim);
    if (part) Object.assign(merged, part);
  }
  if (Object.keys(merged).length > 0) return merged;

  for (const slice of extractTopLevelJsonObjects(t)) {
    const part = tryParseJsonObject(slice);
    if (part) Object.assign(merged, part);
  }
  if (Object.keys(merged).length > 0) return merged;

  throw new Error('模型输出不是 JSON 对象');
}

/**
 * 使用已配置 LLM + A2UI system prompt 生成合并 A2UI JSON，再按与 mock 相同方式切 JSONL chunk 流式下发。
 */
export async function* llmA2uiAgentEventStream(
  input: RunAgentInput,
  client: OpenAI
): AsyncGenerator<BaseEvent> {
  const started: RunStartedEvent = {
    type: EventType.RUN_STARTED,
    threadId: input.threadId,
    runId: input.runId,
    input
  };
  yield started;

  const model = runAgentInputHasUserImages(input.messages ?? [])
    ? getVisionChatModel()
    : getDefaultChatModel();
  const openAiTools = toOpenAiTools(input.tools);
  let messages = buildOpenAiMessagesForA2uiAgent(input);
  const sys0 = messages[0];
  if (sys0?.role === 'system' && typeof sys0.content === 'string') {
    logA2uiSystemPromptFull(sys0.content);
  }
  a2uiAgentDbg('llm messages built', {
    model,
    openAiMessageCount: messages.length,
    toolCount: openAiTools.length,
    threadId: input.threadId,
    runId: input.runId
  });

  let raw = '';
  const t0 = Date.now();
  const maxToolRounds = 6;
  try {
    a2uiAgentInfo('llm request start', { model, threadId: input.threadId, runId: input.runId });
    for (let round = 0; round < maxToolRounds; round++) {
      const completion = await client.chat.completions.create({
        model,
        messages,
        ...(openAiTools.length > 0 ? { tools: openAiTools, tool_choice: 'auto' as const } : {}),
        temperature: 0.1
      });
      const choice = completion.choices[0]?.message;
      if (!choice) {
        throw new Error('LLM 无有效 message');
      }
      const toolCalls = choice.tool_calls;
      if (toolCalls?.length) {
        messages.push({
          role: 'assistant',
          content: choice.content,
          tool_calls: toolCalls
        });
        for (const tc of toolCalls) {
          if (tc.type !== 'function') continue;
          const out = await executeServerTool(tc.function.name, tc.function.arguments ?? '{}');
          messages.push({ role: 'tool', tool_call_id: tc.id, content: out });
        }
        a2uiAgentDbg('llm tool round', { round, toolCallCount: toolCalls.length });
        continue;
      }
      raw = choice.content ?? '';
      break;
    }
    if (!raw.trim()) {
      throw new Error('LLM 未输出正文（可能仅发起了 tool_calls 而未给出最终 JSON）');
    }
    const ms = Date.now() - t0;
    logA2uiLlmAssistantRaw(raw, {
      model,
      threadId: input.threadId,
      runId: input.runId,
      ms
    });
    a2uiAgentInfo('llm request ok', {
      ms,
      rawChars: raw.length,
      threadId: input.threadId,
      runId: input.runId
    });
    a2uiAgentDbg('llm raw head', raw.slice(0, 800));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    a2uiAgentInfo('llm request failed', {
      ms: Date.now() - t0,
      message: msg,
      threadId: input.threadId,
      runId: input.runId
    });
    yield { type: EventType.RUN_ERROR, message: `LLM 调用失败: ${msg}` };
    return;
  }

  const rawCustom: CustomEvent = {
    type: EventType.CUSTOM,
    name: A2UI_LLM_RAW_NAME,
    value: raw
  };
  yield rawCustom;

  let combined: Record<string, unknown>;
  try {
    combined = parseLlmJsonFromAssistantContent(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    a2uiAgentInfo('llm output parse json failed', {
      message: msg,
      rawHead: raw.slice(0, 400),
      threadId: input.threadId,
      runId: input.runId
    });
    yield {
      type: EventType.RUN_ERROR,
      message: `无法解析模型输出为 A2UI JSON: ${msg}。完整原始输出见 Playground「模型原始输出」区块。`
    };
    return;
  }

  const fp = input.forwardedProps as { a2uiCurrentProtocol?: unknown } | undefined;
  const baseProto = fp?.a2uiCurrentProtocol;
  if (shouldInjectCurrentProtocol(baseProto)) {
    const merged = mergeA2uiProtocol(baseProto as Record<string, unknown>, combined);
    a2uiAgentDbg('merged delta into current protocol snapshot', {
      threadId: input.threadId,
      deltaKeys: Object.keys(combined),
      mergedKeys: Object.keys(merged)
    });
    combined = merged;
  }

  const fragments = splitCombinedA2uiMessage(combined);
  a2uiAgentDbg('split fragments', { count: fragments.length, threadId: input.threadId });
  if (fragments.length === 0) {
    a2uiAgentInfo('llm output has no a2ui keys', {
      keys: Object.keys(combined),
      threadId: input.threadId,
      runId: input.runId
    });
    yield {
      type: EventType.RUN_ERROR,
      message: '模型输出的 JSON 中未包含 beginRendering / surfaceUpdate / dataModelUpdate / deleteSurface 任一键'
    };
    return;
  }

  const jsonl = fragments.map((f) => JSON.stringify(f)).join('\n') + '\n';
  a2uiAgentDbg('jsonl ready', { jsonlBytes: jsonl.length, threadId: input.threadId });

  let chunkCount = 0;
  let pos = 0;
  while (pos < jsonl.length) {
    const remaining = jsonl.length - pos;
    const size = Math.min(
      remaining,
      Math.max(1, randomIntInclusive(PROTO_CHUNK_CHARS_MIN, PROTO_CHUNK_CHARS_MAX))
    );
    const chunk = jsonl.slice(pos, pos + size);
    pos += size;
    chunkCount += 1;

    const custom: CustomEvent = {
      type: EventType.CUSTOM,
      name: A2UI_JSONL_CHUNK_NAME,
      value: chunk
    };
    yield custom;

    if (pos < jsonl.length) {
      await sleepRandomGap(CHUNK_GAP_MS_MIN, CHUNK_GAP_MS_MAX);
    }
  }

  const finished: RunFinishedEvent = {
    type: EventType.RUN_FINISHED,
    threadId: input.threadId,
    runId: input.runId,
    result: {
      source: 'llm',
      a2uiMessageCount: fragments.length,
      protocolChunkCount: chunkCount,
      jsonlBytes: jsonl.length,
      streamMode: 'jsonl-chunks'
    }
  };
  a2uiAgentInfo('llm stream chunks done', {
    protocolChunkCount: chunkCount,
    a2uiMessageCount: fragments.length,
    threadId: input.threadId,
    runId: input.runId
  });
  yield finished;
}
