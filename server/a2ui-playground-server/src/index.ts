import path from 'path';
import { config as loadEnv } from 'dotenv';
import Koa from 'koa';

loadEnv({ path: path.resolve(__dirname, '../.env') });
import bodyParser from 'koa-bodyparser';
import cors from 'koa-cors';
import { createAgentRouter } from './routes/agent';
import { createChatRouter } from './routes/chat';

const app = new Koa();

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin || '*'
  })
);
app.use(bodyParser());

const agentRouter = createAgentRouter();
const chatRouter = createChatRouter();
app.use(agentRouter.routes());
app.use(agentRouter.allowedMethods());
app.use(chatRouter.routes());
app.use(chatRouter.allowedMethods());

const PORT = Number(process.env.PORT || 3847);
app.listen(PORT, () => {
  console.log(`a2ui-playground-server listening on http://localhost:${PORT}`);
});
