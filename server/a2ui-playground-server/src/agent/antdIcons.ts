/**
 * 列出 @ant-design/icons 的 React 组件导出名，供 HTTP / LLM 工具 get_antd_icons 使用。
 */

let cachedNames: string[] | null = null;

const EXCLUDED = new Set([
  'createFromIconfontCN',
  'IconProvider',
  'default',
  'setTwoToneColor',
  'getTwoToneColor'
]);

/** forwardRef 图标在运行时 typeof 常为 object，故按导出名模式筛选。 */
const ICON_EXPORT_NAME_RE = /^[A-Z][a-zA-Z0-9]*(Outlined|Filled|TwoTone)$/;

export async function getAntdIconNames(): Promise<string[]> {
  if (cachedNames) return cachedNames;
  const mod = await import('@ant-design/icons');
  cachedNames = Object.keys(mod).filter((k) => {
    if (EXCLUDED.has(k)) return false;
    return ICON_EXPORT_NAME_RE.test(k);
  });
  cachedNames.sort((a, b) => a.localeCompare(b));
  return cachedNames;
}

export async function searchAntdIcons(
  query: string,
  limit: number
): Promise<{ names: string[]; total: number; truncated: boolean }> {
  const all = await getAntdIconNames();
  const q = query.trim().toLowerCase();
  const filtered = q ? all.filter((n) => n.toLowerCase().includes(q)) : all;
  const lim = Math.min(200, Math.max(1, Number.isFinite(limit) ? limit : 80));
  const names = filtered.slice(0, lim);
  return {
    names,
    total: filtered.length,
    truncated: filtered.length > lim
  };
}
