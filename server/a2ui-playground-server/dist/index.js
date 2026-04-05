"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = require("dotenv");
const koa_1 = __importDefault(require("koa"));
(0, dotenv_1.config)({ path: path_1.default.resolve(__dirname, '../.env') });
const koa_bodyparser_1 = __importDefault(require("koa-bodyparser"));
const koa_cors_1 = __importDefault(require("koa-cors"));
const agent_1 = require("./routes/agent");
const antdIcons_1 = require("./routes/antdIcons");
const chat_1 = require("./routes/chat");
const app = new koa_1.default();
const corsOrigin = process.env.CORS_ORIGIN;
app.use((0, koa_cors_1.default)({
    origin: corsOrigin || '*'
}));
app.use((0, koa_bodyparser_1.default)());
const agentRouter = (0, agent_1.createAgentRouter)();
const antdIconsRouter = (0, antdIcons_1.createAntdIconsRouter)();
const chatRouter = (0, chat_1.createChatRouter)();
app.use(agentRouter.routes());
app.use(agentRouter.allowedMethods());
app.use(antdIconsRouter.routes());
app.use(antdIconsRouter.allowedMethods());
app.use(chatRouter.routes());
app.use(chatRouter.allowedMethods());
const PORT = Number(process.env.PORT || 3847);
app.listen(PORT, () => {
    console.log(`a2ui-playground-server listening on http://localhost:${PORT}`);
});
//# sourceMappingURL=index.js.map