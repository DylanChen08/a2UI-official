/**
 * 数据模型：邻接表 contents、path 解析、merge、BoundValue 解析（与协议 v0_8 对齐）
 */

export interface DataEntry {
  key: string;
  valueString?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueMap?: MapEntry[];
}

/** 邻接表条目；`valueMap` 嵌套时表示对象（用于 dataModelUpdate 表达列表项等） */
export interface MapEntry {
  key: string;
  valueString?: string;
  valueNumber?: number;
  valueBoolean?: boolean;
  valueMap?: MapEntry[];
}

export interface DataModelUpdatePayload {
  surfaceId: string;
  path?: string;
  contents: DataEntry[];
}

function mapEntryToValue(m: MapEntry): unknown {
  if (m.valueMap !== undefined && m.valueMap.length > 0) {
    const o: Record<string, unknown> = {};
    for (const inner of m.valueMap) {
      o[inner.key] = mapEntryToValue(inner);
    }
    return o;
  }
  if (m.valueString !== undefined) return m.valueString;
  if (m.valueNumber !== undefined) return m.valueNumber;
  if (m.valueBoolean !== undefined) return m.valueBoolean;
  return undefined;
}

function dataEntryToValue(e: DataEntry): unknown {
  if (e.valueString !== undefined) return e.valueString;
  if (e.valueNumber !== undefined) return e.valueNumber;
  if (e.valueBoolean !== undefined) return e.valueBoolean;
  if (e.valueMap !== undefined) {
    const o: Record<string, unknown> = {};
    for (const m of e.valueMap) {
      o[m.key] = mapEntryToValue(m);
    }
    return o;
  }
  return undefined;
}

/** 将 dataModelUpdate.contents 邻接表转为嵌套对象 */
export function contentsToObject(contents: DataEntry[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const e of contents) {
    o[e.key] = dataEntryToValue(e);
  }
  return o;
}

/** path 字符串规范为段数组，如 "/user/name" -> ["user","name"] */
export function normalizePathSegments(path: string): string[] {
  return path
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/** 从根对象按 path（/a/b 或 a/b）取值 */
export function getByPath(root: unknown, path: string): unknown {
  if (!path || path === '/') return root;
  let cur: unknown = root;
  for (const seg of normalizePathSegments(path)) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/** 在嵌套对象上写入叶子（创建中间对象） */
export function setValueAtPath(
  root: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const segs = normalizePathSegments(path);
  if (segs.length === 0) return;
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    const next = cur[s];
    if (!isPlainObject(next)) {
      const n: Record<string, unknown> = {};
      cur[s] = n;
      cur = n;
    } else {
      cur = next as Record<string, unknown>;
    }
  }
  cur[segs[segs.length - 1]] = value as unknown;
}

/**
 * 将一次 dataModelUpdate 合并进现有模型。
 * path 缺省、空串或 "/"：整表替换为 contents 转成的对象。
 * 否则在 path 指向处合并 blob（对象则浅合并）。
 */
export function mergeDataModelUpdate(
  existing: unknown,
  path: string | undefined,
  contents: DataEntry[]
): unknown {
  const blob = contentsToObject(contents);
  if (!path || path === '/' || path === '') {
    return blob;
  }
  const base: Record<string, unknown> = isPlainObject(existing)
    ? JSON.parse(JSON.stringify(existing))
    : {};
  const segs = normalizePathSegments(path);
  if (segs.length === 0) return blob;
  let cur: Record<string, unknown> = base;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    const next = cur[s];
    if (!isPlainObject(next)) {
      const n: Record<string, unknown> = {};
      cur[s] = n;
      cur = n;
    } else {
      cur = cur[s] as Record<string, unknown>;
    }
  }
  const last = segs[segs.length - 1];
  const prev = cur[last];
  if (isPlainObject(prev) && isPlainObject(blob)) {
    cur[last] = { ...prev, ...blob };
  } else {
    cur[last] = blob;
  }
  return base;
}

/** BoundValue 文本：仅 literal、仅 path、或二者（渲染时以模型为准，模型无则 literal） */
export function resolveBoundText(
  bound: { literalString?: string; path?: string } | undefined,
  dataModel: unknown
): string {
  if (!bound) return '';
  if (bound.path !== undefined && bound.path !== '') {
    const v = getByPath(dataModel, bound.path);
    if (v !== undefined && v !== null) return String(v);
  }
  if (bound.literalString !== undefined) return bound.literalString;
  return '';
}

export function isImplicitBoundInitializer(obj: unknown): obj is {
  path: string;
  literalString?: string;
  literalNumber?: number;
  literalBoolean?: boolean;
} {
  if (!isPlainObject(obj)) return false;
  if (typeof obj.path !== 'string' || obj.path === '') return false;
  const hasLit =
    'literalString' in obj || 'literalNumber' in obj || 'literalBoolean' in obj;
  return hasLit;
}

export function implicitInitializerValue(obj: {
  literalString?: string;
  literalNumber?: number;
  literalBoolean?: boolean;
}): unknown {
  if (obj.literalString !== undefined) return obj.literalString;
  if (obj.literalNumber !== undefined) return obj.literalNumber;
  if (obj.literalBoolean !== undefined) return obj.literalBoolean;
  return undefined;
}

/** 深度遍历 component 对象，对隐式 literal+path 写入数据模型 */
export function walkImplicitBoundInits(
  surfaceId: string,
  node: unknown,
  setAtPath: (surfaceId: string, path: string, value: unknown) => void
): void {
  if (node === null || node === undefined) return;
  if (typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkImplicitBoundInits(surfaceId, item, setAtPath);
    return;
  }
  const o = node as Record<string, unknown>;
  if (isImplicitBoundInitializer(o)) {
    const v = implicitInitializerValue(o as any);
    if (v !== undefined) setAtPath(surfaceId, o.path as string, v);
  }
  const rec = o as Record<string, unknown>;
  for (const k of Object.keys(rec)) {
    walkImplicitBoundInits(surfaceId, rec[k], setAtPath);
  }
}
