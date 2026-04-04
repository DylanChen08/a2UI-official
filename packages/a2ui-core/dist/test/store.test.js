"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const store_1 = require("../src/store");
describe('A2uiStore', () => {
    describe('createA2uiStore', () => {
        it('should create store with initialized state', () => {
            const store = (0, store_1.createA2uiStore)();
            // 创建后，所有map应该为空对象（已自动初始化）
            (0, chai_1.expect)(store.getState().surfaceMap).to.deep.equal({});
            (0, chai_1.expect)(store.getState().hydrateNodeMap).to.deep.equal({});
            (0, chai_1.expect)(store.getState().errorMap).to.deep.equal({});
        });
        it('should reset store when calling resetStore', () => {
            const store = (0, store_1.createA2uiStore)();
            // 添加一些数据
            store.getState().addSurface({
                surfaceId: 'test-surface',
                beginrender: false,
                rootNode: 'test-root'
            });
            // 重置store
            store.getState().resetStore();
            // 数据应该被重置
            (0, chai_1.expect)(store.getState().surfaceMap).to.deep.equal({});
            (0, chai_1.expect)(store.getState().hydrateNodeMap).to.deep.equal({});
            (0, chai_1.expect)(store.getState().errorMap).to.deep.equal({});
        });
    });
    describe('a2uiStore default instance', () => {
        it('should create default store instance', () => {
            (0, chai_1.expect)(store_1.a2uiStore).to.exist;
            (0, chai_1.expect)(typeof store_1.a2uiStore.getState).to.equal('function');
        });
        it('should have initialized state', () => {
            // 默认store应该已初始化
            (0, chai_1.expect)(store_1.a2uiStore.getState().surfaceMap).to.deep.equal({});
            (0, chai_1.expect)(store_1.a2uiStore.getState().hydrateNodeMap).to.deep.equal({});
            (0, chai_1.expect)(store_1.a2uiStore.getState().errorMap).to.deep.equal({});
        });
    });
});
//# sourceMappingURL=store.test.js.map