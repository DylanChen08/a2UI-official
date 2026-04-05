import type { Context } from 'koa';
import Router from 'koa-router';
import { searchAntdIcons } from '../agent/antdIcons';

/** GET /api/antd-icons?q=&limit= — 供调试或非 LLM 客户端拉取图标名列表 */
export function createAntdIconsRouter(): Router {
  const router = new Router();
  router.get('/api/antd-icons', async (ctx: Context) => {
    const q = String(ctx.query.q ?? ctx.query.query ?? '');
    const lr = ctx.query.limit;
    const limit = typeof lr === 'string' ? Number(lr) : 80;
    const result = await searchAntdIcons(q, Number.isFinite(limit) ? limit : 80);
    ctx.status = 200;
    ctx.body = result;
  });
  return router;
}
