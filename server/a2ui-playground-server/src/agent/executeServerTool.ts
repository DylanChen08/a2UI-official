import { searchAntdIcons } from './antdIcons';

/**
 * 执行 Playground 内置工具（OpenAI function name → JSON 字符串结果）。
 */
export async function executeServerTool(name: string, argsJson: string): Promise<string> {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
  } catch {
    return JSON.stringify({ error: 'invalid_tool_arguments_json' });
  }

  if (name === 'get_antd_icons') {
    const query = typeof args.query === 'string' ? args.query : '';
    const rawLimit = args.limit;
    const limit =
      typeof rawLimit === 'number' && Number.isFinite(rawLimit)
        ? rawLimit
        : typeof rawLimit === 'string'
          ? Number(rawLimit)
          : 80;
    const result = await searchAntdIcons(query, limit);
    return JSON.stringify(result);
  }

  return JSON.stringify({ error: 'unknown_tool', name });
}
