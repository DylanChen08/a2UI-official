"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitCombinedA2uiMessage = splitCombinedA2uiMessage;
/**
 * 将合并的 A2UI 服务端消息（一个 JSON 对象里多个顶层键）拆成
 * 协议要求的「每条消息只含一个」的片段，便于流式下发。
 */
const A2UI_MESSAGE_KEYS = [
    'beginRendering',
    'surfaceUpdate',
    'dataModelUpdate',
    'deleteSurface'
];
function splitCombinedA2uiMessage(combined) {
    const out = [];
    for (const key of A2UI_MESSAGE_KEYS) {
        if (key in combined && combined[key] !== undefined) {
            out.push({ [key]: combined[key] });
        }
    }
    return out;
}
//# sourceMappingURL=splitCombinedMessage.js.map