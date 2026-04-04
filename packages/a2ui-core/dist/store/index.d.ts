import { type DataModelUpdatePayload } from '../dataModel';
export declare enum ErrorType {
    PARE_ERROR = "PARE_ERROR"
}
export interface Error {
    type: ErrorType;
    content: string;
}
export interface ChildrenTemplateMeta {
    dataBinding: string;
    templateComponentId: string;
}
export interface HydrateNode {
    componentId: string;
    _vnode: any;
    ownerSurfaceId: string;
    protocal: string;
    children?: string[];
    childrenTemplate?: ChildrenTemplateMeta;
    hasMounted?: boolean;
}
export interface Surface {
    surfaceId: string;
    beginrender: boolean;
    rootNode: HydrateNode;
}
export interface RenderFunction {
    (props: any): any;
}
export interface RenderMap {
    [componentName: string]: RenderFunction;
}
export interface A2uiStoreState {
    surfaceMap: Record<string, Surface>;
    hydrateNodeMap: Record<string, HydrateNode>;
    errorMap: Record<string, Error>;
    renderMap: RenderMap | null;
    /** 各 surface 的数据模型真值；由 dataModelUpdate 与隐式 literal+path 写入 */
    dataModelBySurfaceId: Record<string, unknown>;
    resetStore: () => void;
    addSurface: (surface: Surface) => void;
    updateSurface: (surfaceId: string, updates: Partial<Surface>) => void;
    removeSurface: (surfaceId: string) => void;
    getSurface: (surfaceId: string) => Surface | undefined;
    addHydrateNode: (node: HydrateNode) => void;
    updateHydrateNode: (componentId: string, updates: Partial<HydrateNode>) => void;
    removeHydrateNode: (componentId: string) => void;
    getHydrateNode: (componentId: string) => HydrateNode | undefined;
    setHydrateNodeMounted: (componentId: string) => void;
    addError: (error: Error) => void;
    removeError: (errorId: string) => void;
    getErrors: () => Error[];
    setRenderMap: (renderMap: RenderMap) => void;
    getRenderMap: () => RenderMap | null;
    getDataModel: (surfaceId: string) => unknown;
    applyDataModelUpdate: (update: DataModelUpdatePayload) => void;
    /** 隐式绑定：在 path 处写入单值（会扩展嵌套对象） */
    setDataModelValueAtPath: (surfaceId: string, path: string, value: unknown) => void;
    clear: () => void;
}
export declare const createA2uiStore: () => import("zustand/vanilla").StoreApi<A2uiStoreState>;
export declare const a2uiStore: import("zustand/vanilla").StoreApi<A2uiStoreState>;
//# sourceMappingURL=index.d.ts.map