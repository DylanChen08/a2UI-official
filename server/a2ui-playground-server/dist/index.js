"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const koa_1 = __importDefault(require("koa"));
const koa_bodyparser_1 = __importDefault(require("koa-bodyparser"));
const koa_cors_1 = __importDefault(require("koa-cors"));
const agent_1 = require("./routes/agent");
const app = new koa_1.default();
const corsOrigin = process.env.CORS_ORIGIN;
app.use((0, koa_cors_1.default)({
    origin: corsOrigin || '*'
}));
app.use((0, koa_bodyparser_1.default)());
const agentRouter = (0, agent_1.createAgentRouter)();
app.use(agentRouter.routes());
app.use(agentRouter.allowedMethods());
const PORT = Number(process.env.PORT || 3847);
app.listen(PORT, () => {
    console.log(`a2ui-playground-server listening on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map