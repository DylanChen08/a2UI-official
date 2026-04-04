import React from 'react';
import type { StoreApi as VanillaStoreApi } from 'zustand/vanilla';
import { Surface, HydrateNode, type A2uiStoreState } from '../store';
/** List `children.template` 每项运行时 id */
export declare function makeTemplateInstanceId(parentComponentId: string, templateComponentId: string, index: number): string;
export interface A2UIMessage {
    beginRendering?: BeginRendering;
    surfaceUpdate?: SurfaceUpdate;
    dataModelUpdate?: DataModelUpdate;
    deleteSurface?: DeleteSurface;
}
export interface BeginRendering {
    surfaceId: string;
    catalogId?: string;
    root: string;
    styles?: Record<string, any>;
}
export interface SurfaceUpdate {
    surfaceId: string;
    components: Component[];
}
export interface Component {
    id: string;
    weight?: number;
    component: Record<string, any>;
}
export interface DataModelUpdate {
    surfaceId: string;
    path?: string;
    contents: DataEntry[];
}
export interface DataEntry {
    key: string;
    valueString?: string;
    valueNumber?: number;
    valueBoolean?: boolean;
    valueMap?: MapEntry[];
}
export interface MapEntry {
    key: string;
    valueString?: string;
    valueNumber?: number;
    valueBoolean?: boolean;
    valueMap?: MapEntry[];
}
export interface DeleteSurface {
    surfaceId: string;
}
/** Parser 持有的 store，与 `createA2uiStore()` 返回值一致 */
export type A2uiParserStore = VanillaStoreApi<A2uiStoreState>;
export interface ComponentTree {
    root: HydrateNode;
    nodes: Record<string, HydrateNode>;
    rootVNode?: React.ReactElement;
}
export declare class JSONLBuffer {
    private buffer;
    private messageCallback;
    private errorCallback;
    constructor(messageCallback: (message: A2UIMessage) => void, errorCallback?: (error: Error) => void);
    write(data: string | Uint8Array): void;
    end(): void;
    private processBuffer;
    private extractAndProcessCompleteMessage;
    private extractSurfaceIdAndComponents;
    private isCompleteJSON;
    private processLine;
    private splitSurfaceUpdate;
}
export declare class JSONLStreamParser {
    private parser;
    private buffer;
    private hydrateNodes;
    private rootComponentId;
    private surfaceId;
    constructor(parser: A2UIParser);
    write(data: string | Uint8Array): void;
    end(): {
        rootVNode?: React.ReactElement;
        hydrateNodes: HydrateNode[];
    };
    private handleMessage;
}
export declare class A2UIParser {
    private static instance;
    private store;
    private renderCallback;
    private hydrateNodes;
    private rootComponentId;
    private jsonlBuffer;
    private lastRenderTime;
    private renderTimer;
    private pendingRender;
    /** 两次触发渲染之间的最小间隔（毫秒）。0 表示不节流。 */
    private renderThrottleMs;
    static getInstance(): A2UIParser;
    setStore(store: A2uiParserStore): void;
    setRenderCallback(callback: (rootVNode: React.ReactElement) => void): void;
    /**
     * 设置渲染节流间隔（毫秒）。应在 init 时通过 InitOptions.renderThrottleMs 传入；
     * 直接操作 parser 时也可调用。0 表示每次触发都立即渲染。
     */
    setRenderThrottleMs(ms: number): void;
    /**
     * 取消节流定时器并立即执行一次渲染。用于流式传输结束等场景，避免在待处理的 400ms 延迟后再显示最终树。
     */
    flushPendingRender(): void;
    /**
     * 清空 hydrate 缓冲、根组件 id、节流定时器与流式 buffer（单测或重新跑流前调用，避免单例状态串味）。
     */
    resetRuntimeState(): void;
    private triggerRender;
    private doRender;
    private renderComponent;
    /**
     * 解析单个 A2UI 消息
     */
    parseMessage(message: A2UIMessage): {
        surface?: Surface;
        hydrateNodes?: HydrateNode[];
        dataModelUpdate?: DataModelUpdate;
        deleteSurface?: DeleteSurface;
    };
    /**
     * 初始化流式解析模式
     * 在流式模式下，parseMessage 会自动处理缓冲区
     */
    initStreamMode(): void;
    /**
     * 向流式解析器写入数据
     * 需要先调用 initStreamMode() 初始化
     */
    write(data: string | Uint8Array): void;
    /**
     * 结束流式解析，处理剩余数据
     */
    endStream(): void;
    parseBeginRendering(beginRendering: BeginRendering): {
        surface: Surface;
    };
    parseSurfaceUpdate(surfaceUpdate: SurfaceUpdate): {
        surface: Surface;
        hydrateNodes: HydrateNode[];
    };
    private extractChildren;
    private extractChildrenTemplate;
    parseDataModelUpdate(dataModelUpdate: DataModelUpdate): {
        dataModelUpdate: DataModelUpdate;
    };
    parseDeleteSurface(deleteSurface: DeleteSurface): {
        deleteSurface: DeleteSurface;
    };
    parseJSONL(jsonl: string): A2UIMessage[];
    stringifyJSONL(messages: A2UIMessage[]): string;
    createStreamParser(): JSONLStreamParser;
    treeBuild(hydrateNodes: HydrateNode[], rootComponentId?: string): ComponentTree;
}
export declare const a2uiParser: A2UIParser;
//# sourceMappingURL=index.d.ts.map