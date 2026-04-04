"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.a2uiStore = exports.createA2uiStore = exports.ErrorType = void 0;
const vanilla_1 = require("zustand/vanilla");
const dataModel_1 = require("../dataModel");
// 类型定义
var ErrorType;
(function (ErrorType) {
    ErrorType["PARE_ERROR"] = "PARE_ERROR";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
const createA2uiStore = () => (0, vanilla_1.createStore)((set, get) => ({
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
    applyDataModelUpdate: (update) => set((state) => {
        const prev = state.dataModelBySurfaceId[update.surfaceId];
        const next = (0, dataModel_1.mergeDataModelUpdate)(prev, update.path, update.contents);
        return {
            dataModelBySurfaceId: {
                ...state.dataModelBySurfaceId,
                [update.surfaceId]: next
            }
        };
    }),
    setDataModelValueAtPath: (surfaceId, path, value) => set((state) => {
        const prev = state.dataModelBySurfaceId[surfaceId];
        const base = prev !== null && typeof prev === 'object' && !Array.isArray(prev)
            ? JSON.parse(JSON.stringify(prev))
            : {};
        (0, dataModel_1.setValueAtPath)(base, path, value);
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
exports.createA2uiStore = createA2uiStore;
exports.a2uiStore = (0, exports.createA2uiStore)();
//# sourceMappingURL=index.js.map