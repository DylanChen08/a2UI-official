import { Readable } from 'stream';
import type { Context } from 'koa';
import Router from 'koa-router';
import { EventEncoder } from '@ag-ui/encoder';
import { RunAgentInputSchema } from '@ag-ui/core';
import type { BaseEvent } from '@ag-ui/core';
import { mockAgentEventStream } from '../agent/mockStream';
import { llmA2uiAgentEventStream } from '../agent/llmA2uiAgentStream';
import { loadA2uiMockJson } from '../loadA2uiMock';
import { getOpenAiCompatibleClient } from '../provider';
import { a2uiAgentDbg, a2uiAgentInfo } from '../debug/a2uiAgentLog';

/** 默认使用 SSE；`sse=0|false|no|off|json` 时改为一次性 JSON（`{ events }`）。 */
function useSseFromQuery(ctx: Context): boolean {
  const v = ctx.query.sse;
  if (v === undefined) return true;
  const s = Array.isArray(v) ? v[0] : v;
  const lower = String(s).toLowerCase();
  if (['0', 'false', 'no', 'off', 'json'].includes(lower)) return false;
  return true;
}

function normalizeRunAgentBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') {
    return { tools: [], context: [] };
  }
  const b = body as Record<string, unknown>;
  return {
    ...b,
    tools: Array.isArray(b.tools) ? b.tools : [],
    context: Array.isArray(b.context) ? b.context : []
  };
}

/** 未配置 LLM、或 AGENT_USE_MOCK=1、或 query mock=1 时使用随机 mock；否则走 LLM + A2UI 中文 system prompt */
function useMockA2uiAgent(ctx: Context): boolean {
  const q = ctx.query.mock;
  if (q === '1' || q === 'true') return true;
  const env = process.env.AGENT_USE_MOCK?.trim().toLowerCase();
  if (env === '1' || env === 'true' || env === 'yes') return true;
  return getOpenAiCompatibleClient() === null;
}

export function createAgentRouter(): Router {
  const router = new Router();

  router.post('/api/agent', async (ctx: Context) => {
    const normalized = normalizeRunAgentBody(ctx.request.body);
    const parsed = RunAgentInputSchema.safeParse(normalized);
    if (!parsed.success) {
      a2uiAgentInfo('invalid body', { details: parsed.error.flatten() });
      ctx.status = 400;
      ctx.body = {
        error: 'Invalid RunAgentInput',
        details: parsed.error.flatten()
      };
      return;
    }

    const input = parsed.data;
    const useSse = useSseFromQuery(ctx);

    const client = getOpenAiCompatibleClient();
    const useMock = useMockA2uiAgent(ctx);
    const mode: 'llm' | 'mock' = client && !useMock ? 'llm' : 'mock';

    a2uiAgentInfo('request', {
      threadId: input.threadId,
      runId: input.runId,
      mode,
      sse: useSse,
      messageCount: input.messages?.length ?? 0,
      mockForced: useMock && client !== null
    });

    async function* traceEvents(
      source: AsyncGenerator<BaseEvent>
    ): AsyncGenerator<BaseEvent> {
      const counts: Record<string, number> = {};
      let n = 0;
      try {
        for await (const ev of source) {
          n += 1;
          const t = (ev as { type?: string }).type ?? 'unknown';
          counts[t] = (counts[t] ?? 0) + 1;
          a2uiAgentDbg('sse event', n, t);
          yield ev;
        }
        a2uiAgentInfo('stream generator finished', {
          threadId: input.threadId,
          runId: input.runId,
          mode,
          eventCount: n,
          counts
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        a2uiAgentInfo('stream generator threw', {
          threadId: input.threadId,
          runId: input.runId,
          mode,
          afterEvents: n,
          message
        });
        throw e;
      }
    }

    async function* agentEvents(): AsyncGenerator<BaseEvent> {
      const core =
        mode === 'llm'
          ? llmA2uiAgentEventStream(input, client!)
          : mockAgentEventStream(input, loadA2uiMockJson);
      yield* traceEvents(core);
    }

    if (!useSse) {
      const events: BaseEvent[] = [];
      for await (const event of agentEvents()) {
        events.push(event as BaseEvent);
      }
      ctx.set('Content-Type', 'application/json; charset=utf-8');
      ctx.body = { events };
      ctx.status = 200;
      return;
    }

    // AG-UI 客户端常带 `Accept: ... application/vnd.ag-ui.event+proto`，若交给 EventEncoder 协商，
    // getContentType() 会变为 proto，但此处始终用 encodeSSE 发文本帧，会导致类型与正文不一致、被当成二进制。
    // 本接口固定为 SSE（data 行内 JSON），忽略客户端对 protobuf 的协商。
    const encoder = new EventEncoder({ accept: 'text/event-stream' });

    ctx.set('Content-Type', 'text/event-stream');
    ctx.set('Cache-Control', 'no-cache');
    ctx.set('Connection', 'keep-alive');
    ctx.set('X-Accel-Buffering', 'no');

    async function* eventStrings(): AsyncGenerator<string> {
      for await (const event of agentEvents()) {
        yield encoder.encodeSSE(event as BaseEvent);
      }
    }

    ctx.body = Readable.from(eventStrings(), { objectMode: false });
    ctx.status = 200;
  });

  return router;
}
