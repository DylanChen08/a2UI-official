"use strict";
/**
 * 数据模型：邻接表 contents、path 解析、merge、BoundValue 解析（与协议 v0_8 对齐）
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentsToObject = contentsToObject;
exports.normalizePathSegments = normalizePathSegments;
exports.getByPath = getByPath;
exports.setValueAtPath = setValueAtPath;
exports.mergeDataModelUpdate = mergeDataModelUpdate;
exports.resolveBoundText = resolveBoundText;
exports.isImplicitBoundInitializer = isImplicitBoundInitializer;
exports.implicitInitializerValue = implicitInitializerValue;
exports.walkImplicitBoundInits = walkImplicitBoundInits;
function mapEntryToValue(m) {
    if (m.valueMap !== undefined && m.valueMap.length > 0) {
        const o = {};
        for (const inner of m.valueMap) {
            o[inner.key] = mapEntryToValue(inner);
        }
        return o;
    }
    if (m.valueString !== undefined)
        return m.valueString;
    if (m.valueNumber !== undefined)
        return m.valueNumber;
    if (m.valueBoolean !== undefined)
        return m.valueBoolean;
    return undefined;
}
function dataEntryToValue(e) {
    if (e.valueString !== undefined)
        return e.valueString;
    if (e.valueNumber !== undefined)
        return e.valueNumber;
    if (e.valueBoolean !== undefined)
        return e.valueBoolean;
    if (e.valueMap !== undefined) {
        const o = {};
        for (const m of e.valueMap) {
            o[m.key] = mapEntryToValue(m);
        }
        return o;
    }
    return undefined;
}
/** 将 dataModelUpdate.contents 邻接表转为嵌套对象 */
function contentsToObject(contents) {
    const o = {};
    for (const e of contents) {
        o[e.key] = dataEntryToValue(e);
    }
    return o;
}
/** path 字符串规范为段数组，如 "/user/name" -> ["user","name"] */
function normalizePathSegments(path) {
    return path
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .filter(Boolean);
}
function isPlainObject(x) {
    return x !== null && typeof x === 'object' && !Array.isArray(x);
}
/** 从根对象按 path（/a/b 或 a/b）取值 */
function getByPath(root, path) {
    if (!path || path === '/')
        return root;
    let cur = root;
    for (const seg of normalizePathSegments(path)) {
        if (!isPlainObject(cur))
            return undefined;
        cur = cur[seg];
    }
    return cur;
}
/** 在嵌套对象上写入叶子（创建中间对象） */
function setValueAtPath(root, path, value) {
    const segs = normalizePathSegments(path);
    if (segs.length === 0)
        return;
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
        const s = segs[i];
        const next = cur[s];
        if (!isPlainObject(next)) {
            const n = {};
            cur[s] = n;
            cur = n;
        }
        else {
            cur = next;
        }
    }
    cur[segs[segs.length - 1]] = value;
}
/**
 * 将一次 dataModelUpdate 合并进现有模型。
 * path 缺省、空串或 "/"：整表替换为 contents 转成的对象。
 * 否则在 path 指向处合并 blob（对象则浅合并）。
 */
function mergeDataModelUpdate(existing, path, contents) {
    const blob = contentsToObject(contents);
    if (!path || path === '/' || path === '') {
        return blob;
    }
    const base = isPlainObject(existing)
        ? JSON.parse(JSON.stringify(existing))
        : {};
    const segs = normalizePathSegments(path);
    if (segs.length === 0)
        return blob;
    let cur = base;
    for (let i = 0; i < segs.length - 1; i++) {
        const s = segs[i];
        const next = cur[s];
        if (!isPlainObject(next)) {
            const n = {};
            cur[s] = n;
            cur = n;
        }
        else {
            cur = cur[s];
        }
    }
    const last = segs[segs.length - 1];
    const prev = cur[last];
    if (isPlainObject(prev) && isPlainObject(blob)) {
        cur[last] = { ...prev, ...blob };
    }
    else {
        cur[last] = blob;
    }
    return base;
}
/** BoundValue 文本：仅 literal、仅 path、或二者（渲染时以模型为准，模型无则 literal） */
function resolveBoundText(bound, dataModel) {
    if (!bound)
        return '';
    if (bound.path !== undefined && bound.path !== '') {
        const v = getByPath(dataModel, bound.path);
        if (v !== undefined && v !== null)
            return String(v);
    }
    if (bound.literalString !== undefined)
        return bound.literalString;
    return '';
}
function isImplicitBoundInitializer(obj) {
    if (!isPlainObject(obj))
        return false;
    if (typeof obj.path !== 'string' || obj.path === '')
        return false;
    const hasLit = 'literalString' in obj || 'literalNumber' in obj || 'literalBoolean' in obj;
    return hasLit;
}
function implicitInitializerValue(obj) {
    if (obj.literalString !== undefined)
        return obj.literalString;
    if (obj.literalNumber !== undefined)
        return obj.literalNumber;
    if (obj.literalBoolean !== undefined)
        return obj.literalBoolean;
    return undefined;
}
/** 深度遍历 component 对象，对隐式 literal+path 写入数据模型 */
function walkImplicitBoundInits(surfaceId, node, setAtPath) {
    if (node === null || node === undefined)
        return;
    if (typeof node !== 'object')
        return;
    if (Array.isArray(node)) {
        for (const item of node)
            walkImplicitBoundInits(surfaceId, item, setAtPath);
        return;
    }
    const o = node;
    if (isImplicitBoundInitializer(o)) {
        const v = implicitInitializerValue(o);
        if (v !== undefined)
            setAtPath(surfaceId, o.path, v);
    }
    const rec = o;
    for (const k of Object.keys(rec)) {
        walkImplicitBoundInits(surfaceId, rec[k], setAtPath);
    }
}
//# sourceMappingURL=dataModel.js.map