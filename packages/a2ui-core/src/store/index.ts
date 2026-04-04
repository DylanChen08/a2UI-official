import { createStore } from 'zustand/vanilla';
import {
  mergeDataModelUpdate,
  setValueAtPath,
  type DataModelUpdatePayload
} from '../dataModel';

// 类型定义
export enum ErrorType {
  PARE_ERROR = 'PARE_ERROR',
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

export const createA2uiStore = () => createStore<A2uiStoreState>((set, get) => ({
  surfaceMap: {},
  hydrateNodeMap: {},
  errorMap: {},
  renderMap: null,
  dataModelBySurfaceId: {},
  
  resetStore: () => set({
    surfaceMap: {},
    hydrateNodeMap: {},
    errorMap: {},
    renderMap: null,
    dataModelBySurfaceId: {}
  }),
  
  addSurface: (surface) => set((state) => ({
    surfaceMap: {
      ...state.surfaceMap,
      [surface.surfaceId]: surface
    }
  })),
  
  updateSurface: (surfaceId, updates) => set((state) => ({
    surfaceMap: {
      ...state.surfaceMap,
      [surfaceId]: {
        ...state.surfaceMap[surfaceId],
        ...updates
      }
    }
  })),
  
  removeSurface: (surfaceId) => set((state) => {
    const newHydrateNodeMap = { ...state.hydrateNodeMap };
    Object.entries(newHydrateNodeMap).forEach(([componentId, node]) => {
      if (node.ownerSurfaceId === surfaceId) {
        delete newHydrateNodeMap[componentId];
      }
    });
    
    const newSurfaceMap = { ...state.surfaceMap };
    delete newSurfaceMap[surfaceId];

    const newDataModel = { ...state.dataModelBySurfaceId };
    delete newDataModel[surfaceId];
    
    return {
      surfaceMap: newSurfaceMap,
      hydrateNodeMap: newHydrateNodeMap,
      dataModelBySurfaceId: newDataModel
    };
  }),
  
  getSurface: (surfaceId) => get().surfaceMap[surfaceId],
  
  addHydrateNode: (node) => set((state) => ({
    hydrateNodeMap: {
      ...state.hydrateNodeMap,
      [node.componentId]: {
        ...node,
        hasMounted: false
      }
    }
  })),
  
  updateHydrateNode: (componentId, updates) => set((state) => {
    const newHydrateNodeMap = {
      ...state.hydrateNodeMap,
      [componentId]: {
        ...state.hydrateNodeMap[componentId],
        ...updates
      }
    };
    
    const newSurfaceMap = { ...state.surfaceMap };
    Object.entries(newSurfaceMap).forEach(([surfaceId, surface]) => {
      if (surface.rootNode.componentId === componentId) {
        newSurfaceMap[surfaceId] = {
          ...surface,
          rootNode: newHydrateNodeMap[componentId]
        };
      }
    });
    
    return {
      hydrateNodeMap: newHydrateNodeMap,
      surfaceMap: newSurfaceMap
    };
  }),
  
  removeHydrateNode: (componentId) => set((state) => {
    const newHydrateNodeMap = { ...state.hydrateNodeMap };
    delete newHydrateNodeMap[componentId];
    return { hydrateNodeMap: newHydrateNodeMap };
  }),
  
  getHydrateNode: (componentId) => get().hydrateNodeMap[componentId],
  
  setHydrateNodeMounted: (componentId) => set((state) => {
    const newHydrateNodeMap = {
      ...state.hydrateNodeMap,
      [componentId]: {
        ...state.hydrateNodeMap[componentId],
        hasMounted: true
      }
    };
    
    const newSurfaceMap = { ...state.surfaceMap };
    Object.entries(newSurfaceMap).forEach(([surfaceId, surface]) => {
      if (surface.rootNode.componentId === componentId) {
        newSurfaceMap[surfaceId] = {
          ...surface,
          rootNode: newHydrateNodeMap[componentId]
        };
      }
    });
    
    return {
      hydrateNodeMap: newHydrateNodeMap,
      surfaceMap: newSurfaceMap
    };
  }),
  
  addError: (error) => set((state) => ({
    errorMap: {
      ...state.errorMap,
      [Date.now().toString()]: error
    }
  })),
  
  removeError: (errorId) => set((state) => {
    const newErrorMap = { ...state.errorMap };
    delete newErrorMap[errorId];
    return { errorMap: newErrorMap };
  }),
  
  getErrors: () => Object.values(get().errorMap),
  
  setRenderMap: (renderMap) => set({ renderMap }),
  
  getRenderMap: () => get().renderMap,

  getDataModel: (surfaceId) => get().dataModelBySurfaceId[surfaceId],

  applyDataModelUpdate: (update) =>
    set((state) => {
      const prev = state.dataModelBySurfaceId[update.surfaceId];
      const next = mergeDataModelUpdate(prev, update.path, update.contents);
      return {
        dataModelBySurfaceId: {
          ...state.dataModelBySurfaceId,
          [update.surfaceId]: next
        }
      };
    }),

  setDataModelValueAtPath: (surfaceId, path, value) =>
    set((state) => {
      const prev = state.dataModelBySurfaceId[surfaceId];
      const base: Record<string, unknown> =
        prev !== null && typeof prev === 'object' && !Array.isArray(prev)
          ? (JSON.parse(JSON.stringify(prev)) as Record<string, unknown>)
          : {};
      setValueAtPath(base, path, value);
      return {
        dataModelBySurfaceId: {
          ...state.dataModelBySurfaceId,
          [surfaceId]: base
        }
      };
    }),
  
  clear: () => set({
    surfaceMap: {},
    hydrateNodeMap: {},
    errorMap: {},
    renderMap: null,
    dataModelBySurfaceId: {}
  })
}));

export const a2uiStore = createA2uiStore();
