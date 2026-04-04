"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.A2UIParser = exports.a2uiParser = exports.a2uiStore = exports.walkImplicitBoundInits = exports.resolveBoundText = exports.normalizePathSegments = exports.mergeDataModelUpdate = exports.getByPath = exports.contentsToObject = void 0;
exports.init = init;
const store_1 = require("./store");
Object.defineProperty(exports, "a2uiStore", { enumerable: true, get: function () { return store_1.a2uiStore; } });
const parser_1 = require("./parser");
Object.defineProperty(exports, "A2UIParser", { enumerable: true, get: function () { return parser_1.A2UIParser; } });
Object.defineProperty(exports, "a2uiParser", { enumerable: true, get: function () { return parser_1.a2uiParser; } });
__exportStar(require("./store"), exports);
__exportStar(require("./parser"), exports);
var dataModel_1 = require("./dataModel");
Object.defineProperty(exports, "contentsToObject", { enumerable: true, get: function () { return dataModel_1.contentsToObject; } });
Object.defineProperty(exports, "getByPath", { enumerable: true, get: function () { return dataModel_1.getByPath; } });
Object.defineProperty(exports, "mergeDataModelUpdate", { enumerable: true, get: function () { return dataModel_1.mergeDataModelUpdate; } });
Object.defineProperty(exports, "normalizePathSegments", { enumerable: true, get: function () { return dataModel_1.normalizePathSegments; } });
Object.defineProperty(exports, "resolveBoundText", { enumerable: true, get: function () { return dataModel_1.resolveBoundText; } });
Object.defineProperty(exports, "walkImplicitBoundInits", { enumerable: true, get: function () { return dataModel_1.walkImplicitBoundInits; } });
function init(options) {
    const store = (0, store_1.createA2uiStore)();
    if (options?.renderMap) {
        store.getState().setRenderMap(options.renderMap);
    }
    parser_1.a2uiParser.setStore(store);
    parser_1.a2uiParser.setRenderThrottleMs(options?.renderThrottleMs ?? 400);
    if (options?.onRender) {
        parser_1.a2uiParser.setRenderCallback(options.onRender);
    }
    return store;
}
//# sourceMappingURL=index.js.map