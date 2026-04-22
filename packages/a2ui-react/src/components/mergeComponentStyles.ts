import type { CSSProperties } from 'react';

/** 将协议中的 `styles`（camelCase CSS）合并到宿主默认 inline style 之上 */
export function mergeComponentStyles(base: CSSProperties, overlay?: CSSProperties): CSSProperties {
  if (!overlay || Object.keys(overlay).length === 0) return base;
  return { ...base, ...overlay };
}
