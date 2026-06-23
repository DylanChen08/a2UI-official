import path from 'path';
import { config as loadEnv } from 'dotenv';
import Koa from 'koa';

loadEnv({ path: path.resolve(__dirname, '../.env') });
import bodyParser from 'koa-bodyparser';
import cors from 'koa-cors';
import { createAgentRouter } from './routes/agent';
import { createAntdIconsRouter } from './routes/antdIcons';
import { createChatRouter } from './routes/chat';
import { createMonitoringRouter } from './routes/monitoring';

const app = new Koa();

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin || '*'
  })
);
app.use(
  bodyParser({
    jsonLimit: '50mb',
    formLimit: '50mb',
    textLimit: '50mb'
  })
);

const agentRouter = createAgentRouter();
const antdIconsRouter = createAntdIconsRouter();
const chatRouter = createChatRouter();
const monitoringRouter = createMonitoringRouter();
app.use(agentRouter.routes());
app.use(agentRouter.allowedMethods());
app.use(antdIconsRouter.routes());
app.use(antdIconsRouter.allowedMethods());
app.use(chatRouter.routes());
app.use(chatRouter.allowedMethods());
app.use(monitoringRouter.routes());
app.use(monitoringRouter.allowedMethods());


const PORT = Number(process.env.PORT || 3847);
app.listen(PORT, () => {
  console.log(`a2ui-playground-server listening on http://localhost:${PORT}`);
});
