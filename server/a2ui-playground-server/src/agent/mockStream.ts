import type { z } from 'zod';
import {
  EventType,
  RunAgentInputSchema,
  type BaseEvent,
  type CustomEvent,
  type RunFinishedEvent,
  type RunStartedEvent
} from '@ag-ui/core';
import { splitCombinedA2uiMessage } from '../a2ui/splitCombinedMessage';
import { a2uiAgentDbg, a2uiAgentInfo } from '../debug/a2uiAgentLog';

type RunAgentInput = z.infer<typeof RunAgentInputSchema>;

/**
 * 整条 A2UI 协议先序列化为 JSONL（多行），再切成多段字符串流式下发；
 * 客户端将 chunk 直接写入解析器缓冲区，与「每条消息一个 CUSTOM 整对象」相对。
 */
const A2UI_JSONL_CHUNK_NAME = 'a2ui.jsonl.chunk';

/** `RUN_STARTED` 之后到首段 JSONL 字节的等待（毫秒），模拟 agent 思考 */
const THINK_DELAY_MS_MIN = 40;
const THINK_DELAY_MS_MAX = 220;

/** 相邻两段 JSONL chunk 之间的间隔（毫秒） */
const CHUNK_GAP_MS_MIN = 20;
const CHUNK_GAP_MS_MAX = 120;

/** 单段 chunk 长度（字符数，UTF-16 码元）；可跨 JSON 边界，由客户端 JSONL 缓冲拼行 */
const PROTO_CHUNK_CHARS_MIN = 4;
const PROTO_CHUNK_CHARS_MAX = 48;

/**
 * 与 `packages/a2ui-core/mock/*.json` 文件名（不含扩展名）一致；每次请求随机选一个。
 * 不含以 Text / Image / Icon / Button 等原子组件为主的演示（如 simple-text、button-demo）。
 */
const A2UI_MOCK_NAMES = [
  'complex-nested-tree',
  'row-column-mixed',
  'card-demo',
  'data-binding-smoke',
  'list-template-smoke',
  'cart-list-smoke',
  'local-action-text-demo',
  'agent-back'
] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

async function sleepRandomGap(min: number, max: number): Promise<void> {
  await sleep(randomBetween(min, max));
}

function pickRandomMockName(): string {
  const i = Math.floor(Math.random() * A2UI_MOCK_NAMES.length);
  return A2UI_MOCK_NAMES[i];
}

function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 从合并的 A2UI JSON 生成 AG-UI 事件序列（Mock Agent）。
 */
export async function* mockAgentEventStream(
  input: RunAgentInput,
  loadMock: (name: string) => Record<string, unknown>
): AsyncGenerator<BaseEvent> {
  const mockName = pickRandomMockName();
  a2uiAgentInfo('mock agent start', {
    mockName,
    threadId: input.threadId,
    runId: input.runId
  });
  let combined: Record<string, unknown>;
  try {
    combined = loadMock(mockName);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    a2uiAgentInfo('mock load failed', { mockName, message: err });
    yield {
      type: EventType.RUN_ERROR,
      message: `Failed to load mock "${mockName}": ${err}`
    };
    return;
  }

  const started: RunStartedEvent = {
    type: EventType.RUN_STARTED,
    threadId: input.threadId,
    runId: input.runId,
    input
  };
  yield started;
  await sleepRandomGap(THINK_DELAY_MS_MIN, THINK_DELAY_MS_MAX);

  const fragments = splitCombinedA2uiMessage(combined);
  const jsonl = fragments.map((f) => JSON.stringify(f)).join('\n') + '\n';
  a2uiAgentDbg('mock jsonl', {
    mockName,
    fragmentCount: fragments.length,
    jsonlBytes: jsonl.length
  });

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
      mock: mockName,
      a2uiMessageCount: fragments.length,
      protocolChunkCount: chunkCount,
      jsonlBytes: jsonl.length,
      random: true,
      streamMode: 'jsonl-chunks'
    }
  };
  a2uiAgentInfo('mock stream chunks done', {
    mockName,
    protocolChunkCount: chunkCount,
    a2uiMessageCount: fragments.length,
    threadId: input.threadId,
    runId: input.runId
  });
  yield finished;
}
