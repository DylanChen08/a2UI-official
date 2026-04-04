import { expect } from 'chai';
import { createA2uiStore, a2uiStore, HydrateNode } from '../src/store';

describe('A2uiStore', () => {
  describe('createA2uiStore', () => {
    it('should create store with initialized state', () => {
      const store = createA2uiStore();
      
      // 创建后，所有map应该为空对象（已自动初始化）
      expect(store.getState().surfaceMap).to.deep.equal({});
      expect(store.getState().hydrateNodeMap).to.deep.equal({});
      expect(store.getState().errorMap).to.deep.equal({});
      expect(store.getState().dataModelBySurfaceId).to.deep.equal({});
    });

    it('should reset store when calling resetStore', () => {
      const store = createA2uiStore();
      
      // 创建一个hydrateNode
      const hydrateNode: HydrateNode = {
        componentId: 'test-root',
        _vnode: {},
        ownerSurfaceId: 'test-surface',
        protocal: '{"id":"test-root","component":{}}'
      };
      
      // 添加一些数据
      store.getState().addHydrateNode(hydrateNode);
      store.getState().addSurface({
        surfaceId: 'test-surface',
        beginrender: false,
        rootNode: hydrateNode
      });
      
      // 重置store
      store.getState().resetStore();
      
      // 数据应该被重置
      expect(store.getState().surfaceMap).to.deep.equal({});
      expect(store.getState().hydrateNodeMap).to.deep.equal({});
      expect(store.getState().errorMap).to.deep.equal({});
      expect(store.getState().dataModelBySurfaceId).to.deep.equal({});
    });
  });

  describe('a2uiStore default instance', () => {
    it('should create default store instance', () => {
      expect(a2uiStore).to.exist;
      expect(typeof a2uiStore.getState).to.equal('function');
    });

    it('should have initialized state', () => {
      // 默认store应该已初始化
      expect(a2uiStore.getState().surfaceMap).to.deep.equal({});
      expect(a2uiStore.getState().hydrateNodeMap).to.deep.equal({});
      expect(a2uiStore.getState().errorMap).to.deep.equal({});
      expect(a2uiStore.getState().dataModelBySurfaceId).to.deep.equal({});
    });
  });

  describe('removeSurface', () => {
    it('should remove surface and related hydrateNodes', () => {
      const store = createA2uiStore();
      
      // 创建hydrateNodes
      const hydrateNode1: HydrateNode = {
        componentId: 'text-1',
        _vnode: { Text: { text: { literalString: 'Hello' } } },
        ownerSurfaceId: 'test-surface',
        protocal: '{"id":"text-1","component":{"Text":{"text":{"literalString":"Hello"}}}}'
      };
      
      const hydrateNode2: HydrateNode = {
        componentId: 'text-2',
        _vnode: { Text: { text: { literalString: 'World' } } },
        ownerSurfaceId: 'test-surface',
        protocal: '{"id":"text-2","component":{"Text":{"text":{"literalString":"World"}}}}'
      };
      
      const hydrateNode3: HydrateNode = {
        componentId: 'text-3',
        _vnode: { Text: { text: { literalString: 'Other' } } },
        ownerSurfaceId: 'other-surface',
        protocal: '{"id":"text-3","component":{"Text":{"text":{"literalString":"Other"}}}}'
      };
      
      // 添加hydrateNodes
      store.getState().addHydrateNode(hydrateNode1);
      store.getState().addHydrateNode(hydrateNode2);
      store.getState().addHydrateNode(hydrateNode3);
      
      // 添加一个surface
      store.getState().addSurface({
        surfaceId: 'test-surface',
        beginrender: false,
        rootNode: hydrateNode1
      });
      
      // 验证添加成功
      expect(store.getState().surfaceMap['test-surface']).to.exist;
      expect(store.getState().hydrateNodeMap['text-1']).to.exist;
      expect(store.getState().hydrateNodeMap['text-2']).to.exist;
      expect(store.getState().hydrateNodeMap['text-3']).to.exist;
      
      // 删除surface
      store.getState().removeSurface('test-surface');
      
      // 验证surface被删除
      expect(store.getState().surfaceMap['test-surface']).to.be.undefined;
      
      // 验证相关的hydrateNode被删除
      expect(store.getState().hydrateNodeMap['text-1']).to.be.undefined;
      expect(store.getState().hydrateNodeMap['text-2']).to.be.undefined;
      
      // 验证其他surface的hydrateNode还在
      expect(store.getState().hydrateNodeMap['text-3']).to.exist;
    });

    it('should remove data model for surface when removeSurface is called', () => {
      const store = createA2uiStore();
      store.getState().applyDataModelUpdate({
        surfaceId: 's1',
        path: '/a',
        contents: [{ key: 'b', valueString: 'x' }]
      });
      expect((store.getState().getDataModel('s1') as Record<string, unknown>).a).to.exist;
      store.getState().removeSurface('s1');
      expect(store.getState().getDataModel('s1')).to.be.undefined;
    });
  });
});
