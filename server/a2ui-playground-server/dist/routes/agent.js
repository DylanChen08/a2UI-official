"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentRouter = createAgentRouter;
const stream_1 = require("stream");
const koa_router_1 = __importDefault(require("koa-router"));
const encoder_1 = require("@ag-ui/encoder");
const core_1 = require("@ag-ui/core");
const mockStream_1 = require("../agent/mockStream");
const llmA2uiAgentStream_1 = require("../agent/llmA2uiAgentStream");
const loadA2uiMock_1 = require("../loadA2uiMock");
const provider_1 = require("../provider");
const a2uiAgentLog_1 = require("../debug/a2uiAgentLog");
const mergeA2uiTools_1 = require("../agent/mergeA2uiTools");
/** 默认使用 SSE；`sse=0|false|no|off|json` 时改为一次性 JSON（`{ events }`）。 */
function useSseFromQuery(ctx) {
    const v = ctx.query.sse;
    if (v === undefined)
        return true;
    const s = Array.isArray(v) ? v[0] : v;
    const lower = String(s).toLowerCase();
    if (['0', 'false', 'no', 'off', 'json'].includes(lower))
        return false;
    return true;
}
function normalizeRunAgentBody(body) {
    if (!body || typeof body !== 'object') {
        return { tools: mergeAgentToolsMaybe([]), context: [] };
    }
    const b = body;
    const clientTools = Array.isArray(b.tools) ? b.tools : [];
    return {
        ...b,
        tools: mergeAgentToolsMaybe(clientTools),
        context: Array.isArray(b.context) ? b.context : []
    };
}
/** 合并内置 get_antd_icons；`A2UI_AGENT_ICONS_TOOL=0` 时关闭注入。 */
function mergeAgentToolsMaybe(clientTools) {
    const disable = process.env.A2UI_AGENT_ICONS_TOOL?.trim() === '0';
    if (disable)
        return clientTools;
    return (0, mergeA2uiTools_1.mergeA2uiAgentTools)(clientTools);
}
/** 未配置 LLM、或 AGENT_USE_MOCK=1、或 query mock=1 时使用随机 mock；否则走 LLM + A2UI 中文 system prompt */
function useMockA2uiAgent(ctx) {
    const q = ctx.query.mock;
    if (q === '1' || q === 'true')
        return true;
    const env = process.env.AGENT_USE_MOCK?.trim().toLowerCase();
    if (env === '1' || env === 'true' || env === 'yes')
        return true;
    return (0, provider_1.getOpenAiCompatibleClient)() === null;
}
function createAgentRouter() {
    const router = new koa_router_1.default();
    router.post('/api/agent', async (ctx) => {
        const normalized = normalizeRunAgentBody(ctx.request.body);
        const parsed = core_1.RunAgentInputSchema.safeParse(normalized);
        if (!parsed.success) {
            (0, a2uiAgentLog_1.a2uiAgentInfo)('invalid body', { details: parsed.error.flatten() });
            ctx.status = 400;
            ctx.body = {
                error: 'Invalid RunAgentInput',
                details: parsed.error.flatten()
            };
            return;
        }
        const input = parsed.data;
        const useSse = useSseFromQuery(ctx);
        const client = (0, provider_1.getOpenAiCompatibleClient)();
        const useMock = useMockA2uiAgent(ctx);
        const mode = client && !useMock ? 'llm' : 'mock';
        (0, a2uiAgentLog_1.a2uiAgentInfo)('request', {
            threadId: input.threadId,
            runId: input.runId,
            mode,
            sse: useSse,
            messageCount: input.messages?.length ?? 0,
            mockForced: useMock && client !== null
        });
        async function* traceEvents(source) {
            const counts = {};
            let n = 0;
            try {
                for await (const ev of source) {
                    n += 1;
                    const t = ev.type ?? 'unknown';
                    counts[t] = (counts[t] ?? 0) + 1;
                    (0, a2uiAgentLog_1.a2uiAgentDbg)('sse event', n, t);
                    yield ev;
                }
                (0, a2uiAgentLog_1.a2uiAgentInfo)('stream generator finished', {
                    threadId: input.threadId,
                    runId: input.runId,
                    mode,
                    eventCount: n,
                    counts
                });
            }
            catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                (0, a2uiAgentLog_1.a2uiAgentInfo)('stream generator threw', {
                    threadId: input.threadId,
                    runId: input.runId,
                    mode,
                    afterEvents: n,
                    message
                });
                throw e;
            }
        }
        async function* agentEvents() {
            const core = mode === 'llm'
                ? (0, llmA2uiAgentStream_1.llmA2uiAgentEventStream)(input, client)
                : (0, mockStream_1.mockAgentEventStream)(input, loadA2uiMock_1.loadA2uiMockJson);
            yield* traceEvents(core);
        }
        if (!useSse) {
            const events = [];
            for await (const event of agentEvents()) {
                events.push(event);
            }
            ctx.set('Content-Type', 'application/json; charset=utf-8');
            ctx.body = { events };
            ctx.status = 200;
            return;
        }
        // AG-UI 客户端常带 `Accept: ... application/vnd.ag-ui.event+proto`，若交给 EventEncoder 协商，
        // getContentType() 会变为 proto，但此处始终用 encodeSSE 发文本帧，会导致类型与正文不一致、被当成二进制。
        // 本接口固定为 SSE（data 行内 JSON），忽略客户端对 protobuf 的协商。
        const encoder = new encoder_1.EventEncoder({ accept: 'text/event-stream' });
        ctx.set('Content-Type', 'text/event-stream');
        ctx.set('Cache-Control', 'no-cache');
        ctx.set('Connection', 'keep-alive');
        ctx.set('X-Accel-Buffering', 'no');
        async function* eventStrings() {
            for await (const event of agentEvents()) {
                yield encoder.encodeSSE(event);
            }
        }
        ctx.body = stream_1.Readable.from(eventStrings(), { objectMode: false });
        ctx.status = 200;
    });
    return router;
}
//# sourceMappingURL=agent.js.map