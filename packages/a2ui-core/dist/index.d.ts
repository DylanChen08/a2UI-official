import { a2uiStore, RenderMap } from './store';
import { A2UIParser, a2uiParser } from './parser';
export * from './store';
export * from './parser';
export { contentsToObject, getByPath, mergeDataModelUpdate, normalizePathSegments, resolveBoundText, walkImplicitBoundInits, type DataEntry, type DataModelUpdatePayload } from './dataModel';
export interface InitOptions {
    renderMap?: RenderMap;
    onRender?: (rootVNode: React.ReactElement) => void;
    /**
     * 两次渲染之间的最小间隔（毫秒），用于降低高频 surfaceUpdate 下的重绘次数。
     * 默认 400。设为 0 表示不节流。
     */
    renderThrottleMs?: number;
}
export declare function init(options?: InitOptions): import("zustand/vanilla").StoreApi<import("./store").A2uiStoreState>;
export { a2uiStore, a2uiParser, A2UIParser };
//# sourceMappingURL=index.d.ts.map