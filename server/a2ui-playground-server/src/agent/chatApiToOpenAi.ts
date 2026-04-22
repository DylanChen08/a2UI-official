import type OpenAI from 'openai';
import { agUiPartsToOpenAiContentParts, type AgUiContentPart } from './agUiContentToOpenAi';

/**
 * `POST /api/chat` 单条消息 → OpenAI ChatCompletion 消息（支持纯文本与图片多模态）。
 */
export function chatApiMessageToOpenAi(m: {
  role: string;
  content: unknown;
}): OpenAI.Chat.ChatCompletionMessageParam | null {
  const role = m.role;
  if (role !== 'user' && role !== 'assistant') return null;
  const c = m.content;
  if (typeof c === 'string' && c.trim()) {
    return { role: role as 'user' | 'assistant', content: c };
  }
  if (role === 'user' && Array.isArray(c)) {
    let oaParts = agUiPartsToOpenAiContentParts(c as AgUiContentPart[]);
    if (oaParts.length === 0) return null;
    if (!oaParts.some((x) => x.type === 'text')) {
      oaParts = [{ type: 'text', text: '请根据图片回答或完成任务。' }, ...oaParts];
    }
    return { role: 'user', content: oaParts };
  }
  return null;
}
