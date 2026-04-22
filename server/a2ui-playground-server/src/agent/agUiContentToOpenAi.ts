import type OpenAI from 'openai';

/** 与 AG-UI `UserMessage` 中 `content` 数组项对齐（节选） */
export type AgUiContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'binary';
      mimeType: string;
      data?: string;
      url?: string;
    };

export function agUiPartsToOpenAiContentParts(
  parts: AgUiContentPart[]
): OpenAI.Chat.ChatCompletionContentPart[] {
  const out: OpenAI.Chat.ChatCompletionContentPart[] = [];
  for (const p of parts) {
    if (p.type === 'text' && typeof p.text === 'string' && p.text.length > 0) {
      out.push({ type: 'text', text: p.text });
    } else if (p.type === 'binary' && p.mimeType?.startsWith('image/')) {
      let url: string | undefined;
      if (typeof p.url === 'string' && p.url.trim()) {
        url = p.url.trim();
      } else if (typeof p.data === 'string' && p.data.trim()) {
        const raw = p.data.trim();
        const b64 = raw.includes('base64,') ? (raw.split('base64,').pop() ?? raw) : raw.replace(/\s/g, '');
        url = `data:${p.mimeType};base64,${b64}`;
      }
      if (url) {
        out.push({ type: 'image_url', image_url: { url } });
      }
    }
  }
  return out;
}

/** RunAgentInput / 请求体里是否包含用户图片（binary + image/*） */
export function runAgentInputHasUserImages(messages: Array<{ role?: string; content?: unknown }>): boolean {
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const c = m.content;
    if (!Array.isArray(c)) continue;
    for (const p of c) {
      if (p && typeof p === 'object' && (p as { type?: string }).type === 'binary') {
        const mime = (p as { mimeType?: string }).mimeType ?? '';
        if (mime.startsWith('image/')) return true;
      }
    }
  }
  return false;
}
