export declare enum ErrorType {
    PARE_ERROR = "PARE_ERROR"
}
export interface Error {
    type: ErrorType;
    content: string;
}
export interface Surface {
    surfaceId: string;
    beginrender: boolean;
    rootNode: string;
}
export interface HydrateNode {
    componentId: string;
    _vnode: any;
    ownerSurfaceId: string;
    protocal: string;
}
export interface A2uiStoreState {
    surfaceMap: Record<string, Surface>;
    hydrateNodeMap: Record<string, HydrateNode>;
    errorMap: Record<string, Error>;
    resetStore: () => void;
    addSurface: (surface: Surface) => void;
    updateSurface: (surfaceId: string, updates: Partial<Surface>) => void;
    removeSurface: (surfaceId: string) => void;
    getSurface: (surfaceId: string) => Surface | undefined;
    addHydrateNode: (node: HydrateNode) => void;
    updateHydrateNode: (componentId: string, updates: Partial<HydrateNode>) => void;
    removeHydrateNode: (componentId: string) => void;
    getHydrateNode: (componentId: string) => HydrateNode | undefined;
    addError: (error: Error) => void;
    removeError: (errorId: string) => void;
    getErrors: () => Error[];
    clear: () => void;
}
export declare const createA2uiStore: () => import("zustand/vanilla").StoreApi<A2uiStoreState>;
export declare const a2uiStore: import("zustand/vanilla").StoreApi<A2uiStoreState>;
//# sourceMappingURL=index.d.ts.map