"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.a2uiStore = exports.createA2uiStore = exports.ErrorType = void 0;
const vanilla_1 = require("zustand/vanilla");
// 类型定义
var ErrorType;
(function (ErrorType) {
    ErrorType["PARE_ERROR"] = "PARE_ERROR";
})(ErrorType || (exports.ErrorType = ErrorType = {}));
// 创建store
const createA2uiStore = () => (0, vanilla_1.createStore)((set, get) => ({
    // 初始状态（创建时自动初始化）
    surfaceMap: {},
    hydrateNodeMap: {},
    errorMap: {},
    // 重置方法
    resetStore: () => set({
        surfaceMap: {},
        hydrateNodeMap: {},
        errorMap: {}
    }),
    // Surface操作
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
        const newSurfaceMap = { ...state.surfaceMap };
        delete newSurfaceMap[surfaceId];
        return { surfaceMap: newSurfaceMap };
    }),
    getSurface: (surfaceId) => get().surfaceMap[surfaceId],
    // HydrateNode操作
    addHydrateNode: (node) => set((state) => ({
        hydrateNodeMap: {
            ...state.hydrateNodeMap,
            [node.componentId]: node
        }
    })),
    updateHydrateNode: (componentId, updates) => set((state) => ({
        hydrateNodeMap: {
            ...state.hydrateNodeMap,
            [componentId]: {
                ...state.hydrateNodeMap[componentId],
                ...updates
            }
        }
    })),
    removeHydrateNode: (componentId) => set((state) => {
        const newHydrateNodeMap = { ...state.hydrateNodeMap };
        delete newHydrateNodeMap[componentId];
        return { hydrateNodeMap: newHydrateNodeMap };
    }),
    getHydrateNode: (componentId) => get().hydrateNodeMap[componentId],
    // Error操作
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
    // 清空所有数据
    clear: () => set({
        surfaceMap: {},
        hydrateNodeMap: {},
        errorMap: {}
    })
}));
exports.createA2uiStore = createA2uiStore;
// 导出默认store实例
exports.a2uiStore = (0, exports.createA2uiStore)();
//# sourceMappingURL=index.js.map