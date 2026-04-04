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
const loadA2uiMock_1 = require("../loadA2uiMock");
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
        return { tools: [], context: [] };
    }
    const b = body;
    return {
        ...b,
        tools: Array.isArray(b.tools) ? b.tools : [],
        context: Array.isArray(b.context) ? b.context : []
    };
}
function createAgentRouter() {
    const router = new koa_router_1.default();
    router.post('/api/agent', async (ctx) => {
        const normalized = normalizeRunAgentBody(ctx.request.body);
        const parsed = core_1.RunAgentInputSchema.safeParse(normalized);
        if (!parsed.success) {
            ctx.status = 400;
            ctx.body = {
                error: 'Invalid RunAgentInput',
                details: parsed.error.flatten()
            };
            return;
        }
        const input = parsed.data;
        const useSse = useSseFromQuery(ctx);
        if (!useSse) {
            const events = [];
            for await (const event of (0, mockStream_1.mockAgentEventStream)(input, loadA2uiMock_1.loadA2uiMockJson)) {
                events.push(event);
            }
            ctx.set('Content-Type', 'application/json; charset=utf-8');
            ctx.body = { events };
            ctx.status = 200;
            return;
        }
        const accept = ctx.get('accept') || 'text/event-stream';
        const encoder = new encoder_1.EventEncoder({ accept });
        ctx.set('Content-Type', encoder.getContentType());
        ctx.set('Cache-Control', 'no-cache');
        ctx.set('Connection', 'keep-alive');
        ctx.set('X-Accel-Buffering', 'no');
        async function* eventStrings() {
            for await (const event of (0, mockStream_1.mockAgentEventStream)(input, loadA2uiMock_1.loadA2uiMockJson)) {
                yield encoder.encodeSSE(event);
            }
        }
        ctx.body = stream_1.Readable.from(eventStrings(), { objectMode: false });
        ctx.status = 200;
    });
    return router;
}
//# sourceMappingURL=agent.js.map