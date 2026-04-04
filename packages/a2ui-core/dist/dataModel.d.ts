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
/** 将 dataModelUpdate.contents 邻接表转为嵌套对象 */
export declare function contentsToObject(contents: DataEntry[]): Record<string, unknown>;
/** path 字符串规范为段数组，如 "/user/name" -> ["user","name"] */
export declare function normalizePathSegments(path: string): string[];
/** 从根对象按 path（/a/b 或 a/b）取值 */
export declare function getByPath(root: unknown, path: string): unknown;
/** 在嵌套对象上写入叶子（创建中间对象） */
export declare function setValueAtPath(root: Record<string, unknown>, path: string, value: unknown): void;
/**
 * 将一次 dataModelUpdate 合并进现有模型。
 * path 缺省、空串或 "/"：整表替换为 contents 转成的对象。
 * 否则在 path 指向处合并 blob（对象则浅合并）。
 */
export declare function mergeDataModelUpdate(existing: unknown, path: string | undefined, contents: DataEntry[]): unknown;
/** BoundValue 文本：仅 literal、仅 path、或二者（渲染时以模型为准，模型无则 literal） */
export declare function resolveBoundText(bound: {
    literalString?: string;
    path?: string;
} | undefined, dataModel: unknown): string;
export declare function isImplicitBoundInitializer(obj: unknown): obj is {
    path: string;
    literalString?: string;
    literalNumber?: number;
    literalBoolean?: boolean;
};
export declare function implicitInitializerValue(obj: {
    literalString?: string;
    literalNumber?: number;
    literalBoolean?: boolean;
}): unknown;
/** 深度遍历 component 对象，对隐式 literal+path 写入数据模型 */
export declare function walkImplicitBoundInits(surfaceId: string, node: unknown, setAtPath: (surfaceId: string, path: string, value: unknown) => void): void;
//# sourceMappingURL=dataModel.d.ts.map