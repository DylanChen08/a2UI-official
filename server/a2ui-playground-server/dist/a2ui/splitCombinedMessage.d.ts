/**
 * 将合并的 A2UI 服务端消息（一个 JSON 对象里多个顶层键）拆成
 * 协议要求的「每条消息只含一个」的片段，便于流式下发。
 */
declare const A2UI_MESSAGE_KEYS: readonly ["beginRendering", "surfaceUpdate", "dataModelUpdate", "deleteSurface"];
export type A2uiMessageKey = (typeof A2UI_MESSAGE_KEYS)[number];
export declare function splitCombinedA2uiMessage(combined: Record<string, unknown>): Record<string, unknown>[];
export {};
//# sourceMappingURL=splitCombinedMessage.d.ts.map