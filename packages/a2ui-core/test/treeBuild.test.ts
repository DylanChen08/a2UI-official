import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { a2uiParser, RenderMap } from '../src/parser';
import { createA2uiStore } from '../src/store';

describe('treeBuild', () => {
  beforeEach(() => {
    a2uiParser.resetRuntimeState();
    const testStore = createA2uiStore();
    testStore.getState().setRenderMap({
      Column: (props: any) => React.createElement('div', { ...props, 'data-testid': 'column' }),
      Text: (props: any) => React.createElement('span', { ...props, 'data-testid': 'text' })
    });
    a2uiParser.setStore(testStore);
  });

  describe('component tree building', () => {
    it('should build component tree with parent-child relationships', () => {
      const mockData = JSON.parse(
        readFileSync(join(__dirname, '../mock/column-with-texts.json'), 'utf-8')
      );

      const beginRenderingResult = a2uiParser.parseMessage({
        beginRendering: mockData.beginRendering
      });

      const surfaceUpdateResult = a2uiParser.parseMessage({
        surfaceUpdate: mockData.surfaceUpdate
      });

      if (surfaceUpdateResult.hydrateNodes) {
        const tree = a2uiParser.treeBuild(
          surfaceUpdateResult.hydrateNodes,
          mockData.beginRendering.root
        );

        expect(tree).to.exist;
        expect(tree.root).to.exist;
        expect(tree.root.componentId).to.equal('column-container');
        expect(tree.nodes).to.exist;
        expect(Object.keys(tree.nodes)).to.have.lengthOf(4);

        const columnNode = tree.nodes['column-container'];
        expect(columnNode).to.exist;
        expect(columnNode.componentId).to.equal('column-container');
        expect(columnNode.children).to.exist;
        expect(columnNode.children).to.have.lengthOf(3);
        expect(columnNode.children).to.deep.equal(['text-1', 'text-2', 'text-3']);

        const text1Node = tree.nodes['text-1'];
        expect(text1Node).to.exist;
        expect(text1Node.componentId).to.equal('text-1');
        expect(text1Node.children).to.be.undefined;

        const text2Node = tree.nodes['text-2'];
        expect(text2Node).to.exist;
        expect(text2Node.componentId).to.equal('text-2');
        expect(text2Node.children).to.be.undefined;

        const text3Node = tree.nodes['text-3'];
        expect(text3Node).to.exist;
        expect(text3Node.componentId).to.equal('text-3');
        expect(text3Node.children).to.be.undefined;
      }
    });

    it('should correctly build vnode tree with children', () => {
      const testStore = createA2uiStore();
      const mockRenderMap: RenderMap = {
        Column: (props: any) => React.createElement('div', { ...props, 'data-testid': 'column' }),
        Text: (props: any) => React.createElement('span', { ...props, 'data-testid': 'text' })
      };

      testStore.getState().setRenderMap(mockRenderMap);
      a2uiParser.setStore(testStore);

      const mockData = JSON.parse(
        readFileSync(join(__dirname, '../mock/column-with-texts.json'), 'utf-8')
      );

      const surfaceUpdateResult = a2uiParser.parseMessage({
        surfaceUpdate: mockData.surfaceUpdate
      });

      if (surfaceUpdateResult.hydrateNodes) {
        const tree = a2uiParser.treeBuild(
          surfaceUpdateResult.hydrateNodes,
          mockData.beginRendering.root
        );

        const columnNode = tree.root;
        expect(columnNode._vnode).to.exist;
        expect(React.isValidElement(columnNode._vnode)).to.be.true;

        if (tree.rootVNode && tree.rootVNode.props && tree.rootVNode.props.children) {
          expect(tree.rootVNode.props.children).to.exist;
          expect(tree.rootVNode.props.children).to.have.lengthOf(3);
          
          tree.rootVNode.props.children.forEach((childVNode: any, index: number) => {
            expect(childVNode).to.exist;
            expect(React.isValidElement(childVNode)).to.be.true;
            expect(childVNode.props['data-testid']).to.equal('text');
          });
        }
      }
    });

    it('should handle empty hydrateNodes array', () => {
      expect(() => a2uiParser.treeBuild([])).to.throw('No hydrate nodes provided for tree building');
    });

    it('should use first node as root when rootComponentId is not provided', () => {
      const mockData = JSON.parse(
        readFileSync(join(__dirname, '../mock/simple-text.json'), 'utf-8')
      );

      const surfaceUpdateResult = a2uiParser.parseMessage({
        surfaceUpdate: mockData.surfaceUpdate
      });

      if (surfaceUpdateResult.hydrateNodes) {
        const tree = a2uiParser.treeBuild(surfaceUpdateResult.hydrateNodes);

        expect(tree.root.componentId).to.equal('text-component');
      }
    });

    it('should handle nested component structures', () => {
      const testStore = createA2uiStore();
      const mockRenderMap: RenderMap = {
        Column: (props: any) => React.createElement('div', { ...props, 'data-testid': 'column' }),
        Text: (props: any) => React.createElement('span', { ...props, 'data-testid': 'text' })
      };

      testStore.getState().setRenderMap(mockRenderMap);
      a2uiParser.setStore(testStore);

      const nestedMockData = {
        beginRendering: {
          surfaceId: 'surface-002',
          root: 'outer-column'
        },
        surfaceUpdate: {
          surfaceId: 'surface-002',
          components: [
            {
              id: 'outer-column',
              component: {
                Column: {
                  children: {
                    explicitList: ['inner-column']
                  },
                  distribution: 'start',
                  alignment: 'center'
                }
              }
            },
            {
              id: 'inner-column',
              component: {
                Column: {
                    children: {
                      explicitList: ['text-1', 'text-2']
                    },
                    distribution: 'spaceBetween'
                  }
              }
            },
            {
              id: 'text-1',
              component: {
                Text: {
                  text: { literalString: 'Nested Text 1' },
                  usageHint: 'h2'
                }
              }
            },
            {
              id: 'text-2',
              component: {
                Text: {
                  text: { literalString: 'Nested Text 2' },
                  usageHint: 'h3'
                }
              }
            }
          ]
        }
      };

      const surfaceUpdateResult = a2uiParser.parseMessage({
        surfaceUpdate: nestedMockData.surfaceUpdate
      });

      if (surfaceUpdateResult.hydrateNodes) {
        const tree = a2uiParser.treeBuild(
          surfaceUpdateResult.hydrateNodes,
          nestedMockData.beginRendering.root
        );

        expect(tree.root.componentId).to.equal('outer-column');
        expect(tree.nodes['outer-column'].children).to.deep.equal(['inner-column']);
        expect(tree.nodes['inner-column'].children).to.deep.equal(['text-1', 'text-2']);
      }
    });

    it('should preserve component properties during tree building', () => {
      const testStore = createA2uiStore();
      const mockRenderMap: RenderMap = {
        Column: (props: any) => React.createElement('div', { ...props, 'data-testid': 'column' }),
        Text: (props: any) => React.createElement('span', { ...props, 'data-testid': 'text' })
      };

      testStore.getState().setRenderMap(mockRenderMap);
      a2uiParser.setStore(testStore);

      const mockData = JSON.parse(
        readFileSync(join(__dirname, '../mock/column-with-texts.json'), 'utf-8')
      );

      const surfaceUpdateResult = a2uiParser.parseMessage({
        surfaceUpdate: mockData.surfaceUpdate
      });

      if (surfaceUpdateResult.hydrateNodes) {
        const tree = a2uiParser.treeBuild(
          surfaceUpdateResult.hydrateNodes,
          mockData.beginRendering.root
        );

        const columnNode = tree.nodes['column-container'];
        expect(columnNode._vnode.props).to.exist;
        expect(columnNode._vnode.props.distribution).to.equal('start');
        expect(columnNode._vnode.props.alignment).to.equal('center');
      }
    });

    it('should handle missing child components gracefully', () => {
      const testStore = createA2uiStore();
      const mockRenderMap: RenderMap = {
        Column: (props: any) => React.createElement('div', { ...props, 'data-testid': 'column' }),
        Text: (props: any) => React.createElement('span', { ...props, 'data-testid': 'text' })
      };

      testStore.getState().setRenderMap(mockRenderMap);
      a2uiParser.setStore(testStore);

      const mockData = {
        beginRendering: {
          surfaceId: 'surface-003',
          root: 'column-with-missing-children'
        },
        surfaceUpdate: {
          surfaceId: 'surface-003',
          components: [
            {
              id: 'column-with-missing-children',
              component: {
                Column: {
                    children: {
                      explicitList: ['non-existent-1', 'non-existent-2']
                    },
                    distribution: 'start'
                  }
              }
            }
          ]
        }
      };

      const surfaceUpdateResult = a2uiParser.parseMessage({
        surfaceUpdate: mockData.surfaceUpdate
      });

      if (surfaceUpdateResult.hydrateNodes) {
        const tree = a2uiParser.treeBuild(
          surfaceUpdateResult.hydrateNodes,
          mockData.beginRendering.root
        );

        const columnNode = tree.root;
        expect(columnNode.children).to.exist;
        expect(columnNode.children).to.have.lengthOf(2);
        
        // 当子组件不存在时，children 应该是 undefined
        const children = tree.rootVNode?.props.children;
        expect(children).to.be.undefined;
      }
    });
  });
});
