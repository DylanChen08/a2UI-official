/**
 * 将合并的 A2UI 服务端消息（一个 JSON 对象里多个顶层键）拆成
 * 协议要求的「每条消息只含一个」的片段，便于流式下发。
 */
const A2UI_MESSAGE_KEYS = [
  'beginRendering',
  'surfaceUpdate',
  'dataModelUpdate',
  'deleteSurface'
] as const;

export type A2uiMessageKey = (typeof A2UI_MESSAGE_KEYS)[number];

export function splitCombinedA2uiMessage(
  combined: Record<string, unknown>
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const key of A2UI_MESSAGE_KEYS) {
    if (key in combined && combined[key] !== undefined) {
      out.push({ [key]: combined[key] });
    }
  }
  return out;
}
