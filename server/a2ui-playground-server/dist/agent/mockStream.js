"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockAgentEventStream = mockAgentEventStream;
const core_1 = require("@ag-ui/core");
const splitCombinedMessage_1 = require("../a2ui/splitCombinedMessage");
const A2UI_CUSTOM_NAME = 'a2ui.message';
/** Mock：两条 CUSTOM 之间的延迟（毫秒），模拟流式块 */
const MOCK_CHUNK_DELAY_MS = 80;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function mockPayloadFromUserContent(input) {
    const lastUser = [...input.messages]
        .reverse()
        .find((m) => m.role === 'user');
    const raw = typeof lastUser?.content === 'string'
        ? lastUser.content
        : '';
    const key = raw.trim().toLowerCase();
    if (key === 'local' || key.includes('local-action')) {
        return 'local-action-text-demo';
    }
    return null;
}
/**
 * 从合并的 A2UI JSON 生成 AG-UI 事件序列（Mock Agent）。
 */
async function* mockAgentEventStream(input, loadMock) {
    const pick = mockPayloadFromUserContent(input);
    const mockName = pick ?? 'column-with-texts';
    let combined;
    try {
        combined = loadMock(mockName);
    }
    catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        yield {
            type: core_1.EventType.RUN_ERROR,
            message: `Failed to load mock "${mockName}": ${err}`
        };
        return;
    }
    const started = {
        type: core_1.EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
        input
    };
    yield started;
    const fragments = (0, splitCombinedMessage_1.splitCombinedA2uiMessage)(combined);
    let first = true;
    for (const fragment of fragments) {
        if (!first)
            await sleep(MOCK_CHUNK_DELAY_MS);
        first = false;
        const custom = {
            type: core_1.EventType.CUSTOM,
            name: A2UI_CUSTOM_NAME,
            value: fragment
        };
        yield custom;
    }
    const finished = {
        type: core_1.EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
        result: { mock: mockName, a2uiMessageCount: fragments.length }
    };
    yield finished;
}
//# sourceMappingURL=mockStream.js.map