/**
 * 将 Agent 返回的增量 A2UI 对象与 Playground 导出的「当前画布」快照合并，
 * 得到完整协议后再 JSONL 下发给客户端解析。
 */

export type A2uiComponentEntry = { id: string; component: unknown };

function isNoSurfaceNote(base: Record<string, unknown>): boolean {
  return base._note === 'No surface in store';
}

function mergeComponentLists(
  base: A2uiComponentEntry[] | undefined,
  delta: A2uiComponentEntry[] | undefined
): A2uiComponentEntry[] {
  const map = new Map<string, A2uiComponentEntry>();
  for (const c of base ?? []) {
    if (c && typeof c.id === 'string') map.set(c.id, c);
  }
  for (const c of delta ?? []) {
    if (c && typeof c.id === 'string') map.set(c.id, c);
  }
  return Array.from(map.values());
}

/** 邻接表 contents 按 key 覆盖合并（浅层：同 key 整条替换） */
function mergeDataModelContents(
  baseContents: Array<Record<string, unknown>> | undefined,
  deltaContents: Array<Record<string, unknown>> | undefined
): Array<Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const e of baseContents ?? []) {
    const k = e.key;
    if (typeof k === 'string') map.set(k, e);
  }
  for (const e of deltaContents ?? []) {
    const k = e.key;
    if (typeof k === 'string') map.set(k, e);
  }
  return Array.from(map.values());
}

/**
 * @param base 来自 Playground `buildA2uiProtocolSnapshot` 的单 surface 对象，或含 `_note` 的空占位
 * @param delta 模型输出（可仅含 surfaceUpdate / dataModelUpdate / deleteSurface 等增量）
 */
export function mergeA2uiProtocol(
  base: Record<string, unknown> | null | undefined,
  delta: Record<string, unknown>
): Record<string, unknown> {
  if (!base || isNoSurfaceNote(base)) {
    return { ...delta };
  }

  const out: Record<string, unknown> = { ...delta };

  if (!delta.beginRendering && base.beginRendering) {
    out.beginRendering = base.beginRendering;
  }

  if (delta.surfaceUpdate) {
    const bsu = base.surfaceUpdate as
      | { surfaceId?: string; components?: A2uiComponentEntry[] }
      | undefined;
    const dsu = delta.surfaceUpdate as {
      surfaceId?: string;
      components?: A2uiComponentEntry[];
    };
    out.surfaceUpdate = {
      surfaceId: dsu.surfaceId ?? bsu?.surfaceId,
      components: mergeComponentLists(bsu?.components, dsu.components)
    };
  } else if (base.surfaceUpdate) {
    out.surfaceUpdate = base.surfaceUpdate;
  }

  if (delta.dataModelUpdate) {
    const bdm = base.dataModelUpdate as
      | { surfaceId?: string; contents?: Array<Record<string, unknown>>; path?: string }
      | undefined;
    const ddm = delta.dataModelUpdate as {
      surfaceId?: string;
      contents?: Array<Record<string, unknown>>;
      path?: string;
    };
    const mergedDm: Record<string, unknown> = {
      surfaceId: ddm.surfaceId ?? bdm?.surfaceId
    };
    if (ddm.path !== undefined || bdm?.path !== undefined) {
      mergedDm.path = ddm.path !== undefined ? ddm.path : bdm?.path;
    }
    mergedDm.contents = mergeDataModelContents(bdm?.contents, ddm.contents);
    out.dataModelUpdate = mergedDm;
  } else if (base.dataModelUpdate) {
    out.dataModelUpdate = base.dataModelUpdate;
  }

  if (!delta.deleteSurface && base.deleteSurface) {
    /* 保留 delta 语义：增量未提 delete 则不删 */
  }
  if (delta.deleteSurface) {
    out.deleteSurface = delta.deleteSurface;
  }

  return out;
}
