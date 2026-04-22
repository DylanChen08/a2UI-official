import { Readable } from 'stream';
import type { Context } from 'koa';
import Router from 'koa-router';
import type OpenAI from 'openai';
import { getDefaultChatModel, getOpenAiCompatibleClient, getVisionChatModel } from '../provider';
import { runAgentInputHasUserImages } from '../agent/agUiContentToOpenAi';
import { chatApiMessageToOpenAi } from '../agent/chatApiToOpenAi';

export interface ChatRequestBody {
  /** 文本，或 AG-UI 风格多模态：`[{ type: 'text', text }, { type: 'binary', mimeType, data }]` */
  messages?: Array<{ role: string; content: string | unknown[] }>;
  model?: string;
  /** 为 true 时使用 SSE 流式返回正文增量 */
  stream?: boolean;
}

export function createChatRouter(): Router {
  const router = new Router();

  router.post('/api/chat', async (ctx: Context) => {
    const client = getOpenAiCompatibleClient();
    if (!client) {
      ctx.status = 503;
      ctx.body = {
        error:
          'LLM 未配置：请在 .env 中设置 OPENAI_API_KEY（或兼容网关的 LLM_API_KEY + LLM_BASE_URL）'
      };
      return;
    }

    const body = (ctx.request.body || {}) as ChatRequestBody;
    const raw = Array.isArray(body.messages) ? body.messages : [];
    if (raw.length === 0) {
      ctx.status = 400;
      ctx.body = { error: 'messages 不能为空' };
      return;
    }

    const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    for (const m of raw) {
      const conv = chatApiMessageToOpenAi(m as { role: string; content: unknown });
      if (conv) openAiMessages.push(conv);
    }

    if (openAiMessages.length === 0) {
      ctx.status = 400;
      ctx.body = { error: 'messages 不能为空' };
      return;
    }
    const hasUserOrAssistant = openAiMessages.some(
      (m) => m.role === 'user' || m.role === 'assistant'
    );
    if (!hasUserOrAssistant) {
      ctx.status = 400;
      ctx.body = { error: '至少需一条有效的 user 或 assistant 消息（非空 content）' };
      return;
    }

    const useVision = runAgentInputHasUserImages(
      raw as Array<{ role?: string; content?: unknown }>
    );
    const model =
      typeof body.model === 'string' && body.model.trim()
        ? body.model.trim()
        : useVision
          ? getVisionChatModel()
          : getDefaultChatModel();

    const wantStream = body.stream === true;

    if (wantStream) {
      const openai = client;
      ctx.set('Content-Type', 'text/event-stream; charset=utf-8');
      ctx.set('Cache-Control', 'no-cache');
      ctx.set('Connection', 'keep-alive');
      ctx.set('X-Accel-Buffering', 'no');

      async function* sseLines(): AsyncGenerator<string> {
        yield `data: ${JSON.stringify({ type: 'start' })}\n\n`;
        try {
          const streamResp = await openai.chat.completions.create({
            model,
            messages: openAiMessages,
            stream: true
          });
          for await (const part of streamResp) {
            const delta = part.choices[0]?.delta?.content ?? '';
            if (delta) {
              yield `data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`;
            }
          }
          yield `data: ${JSON.stringify({ type: 'done' })}\n\n`;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          yield `data: ${JSON.stringify({ type: 'error', message })}\n\n`;
        }
      }

      ctx.status = 200;
      ctx.body = Readable.from(sseLines(), { objectMode: false });
      return;
    }

    try {
      const completion = await client.chat.completions.create({
        model,
        messages: openAiMessages
      });
      const content = completion.choices[0]?.message?.content ?? '';
      ctx.set('Content-Type', 'application/json; charset=utf-8');
      ctx.status = 200;
      ctx.body = {
        role: 'assistant' as const,
        content
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      ctx.status = 502;
      ctx.body = { error: message };
    }
  });

  return router;
}
