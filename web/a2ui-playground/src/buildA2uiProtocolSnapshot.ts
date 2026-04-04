import type { DataEntry, HydrateNode, Surface } from 'a2ui-core';

type MapEntryLike = NonNullable<DataEntry['valueMap']>[number];

function valueToMapEntry(key: string, v: unknown): MapEntryLike {
  if (v === null || v === undefined) {
    return { key, valueString: '' };
  }
  if (typeof v === 'string') return { key, valueString: v };
  if (typeof v === 'number') return { key, valueNumber: v };
  if (typeof v === 'boolean') return { key, valueBoolean: v };
  if (Array.isArray(v)) {
    return { key, valueString: JSON.stringify(v) };
  }
  if (typeof v === 'object') {
    return {
      key,
      valueMap: objectToMapEntries(v as Record<string, unknown>)
    };
  }
  return { key, valueString: String(v) };
}

function objectToMapEntries(obj: Record<string, unknown>): MapEntryLike[] {
  return Object.keys(obj).map((k) => valueToMapEntry(k, obj[k]));
}

function topLevelObjectToDataEntries(root: Record<string, unknown>): DataEntry[] {
  return Object.keys(root).map((k) => {
    const v = root[k];
    if (v === null || v === undefined) {
      return { key: k, valueString: '' };
    }
    if (typeof v === 'string') return { key: k, valueString: v };
    if (typeof v === 'number') return { key: k, valueNumber: v };
    if (typeof v === 'boolean') return { key: k, valueBoolean: v };
    if (Array.isArray(v)) {
      return { key: k, valueString: JSON.stringify(v) };
    }
    if (typeof v === 'object') {
      return {
        key: k,
        valueMap: objectToMapEntries(v as Record<string, unknown>)
      };
    }
    return { key: k, valueString: String(v) };
  });
}

function hasDataModelContent(dm: unknown): boolean {
  if (dm === undefined || dm === null) return false;
  if (typeof dm !== 'object') return true;
  return Object.keys(dm as object).length > 0;
}

function buildSingleSurfaceSnapshot(
  surface: Surface,
  hydrateNodeMap: Record<string, HydrateNode>,
  dataModelBySurfaceId: Record<string, unknown>,
  surfaceId: string
): Record<string, unknown> {
  const components = Object.values(hydrateNodeMap)
    .filter((n) => n.ownerSurfaceId === surfaceId)
    .map((n) => JSON.parse(n.protocal) as { id: string; component: unknown });

  const dm = dataModelBySurfaceId[surfaceId];
  const out: Record<string, unknown> = {
    beginRendering: {
      surfaceId,
      root: surface.rootNode.componentId
    },
    surfaceUpdate: {
      surfaceId,
      components
    }
  };

  if (hasDataModelContent(dm)) {
    out.dataModelUpdate = {
      surfaceId,
      contents:
        typeof dm === 'object' && dm !== null && !Array.isArray(dm)
          ? topLevelObjectToDataEntries(dm as Record<string, unknown>)
          : [{ key: '_root', valueString: JSON.stringify(dm) }]
    };
  }

  return out;
}

/**
 * 从当前 store 状态反推与 server_to_client 一致的 A2UI 协议 JSON（用于调试/展示）。
 * 数据模型由运行时对象序列化为 `dataModelUpdate.contents`，可能与原始消息的 path/拆分方式不同，但语义等价。
 */
export function buildA2uiProtocolSnapshot(state: {
  surfaceMap: Record<string, Surface>;
  hydrateNodeMap: Record<string, HydrateNode>;
  dataModelBySurfaceId: Record<string, unknown>;
}): unknown {
  const surfaceIds = Object.keys(state.surfaceMap);
  if (surfaceIds.length === 0) {
    return { _note: 'No surface in store' };
  }
  if (surfaceIds.length === 1) {
    const sid = surfaceIds[0];
    return buildSingleSurfaceSnapshot(
      state.surfaceMap[sid],
      state.hydrateNodeMap,
      state.dataModelBySurfaceId,
      sid
    );
  }
  return {
    _note: 'Multiple surfaces; one object per surface',
    messages: surfaceIds.map((sid) =>
      buildSingleSurfaceSnapshot(
        state.surfaceMap[sid],
        state.hydrateNodeMap,
        state.dataModelBySurfaceId,
        sid
      )
    )
  };
}
