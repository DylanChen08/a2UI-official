import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join } from 'path';
import React from 'react';
import { a2uiParser, A2UIMessage, RenderMap, RenderFunction } from '../src/parser';
import { createA2uiStore } from '../src/store';

describe('A2UIParser', () => {
  beforeEach(() => {
    a2uiParser.resetRuntimeState();
    a2uiParser.setStore(createA2uiStore());
  });

  describe('parseBeginRendering', () => {
    it('should parse beginRendering message and create Surface', () => {
      const mockData = JSON.parse(
        readFileSync(join(__dirname, '../mock/simple-text.json'), 'utf-8')
      ) as A2UIMessage;

      const result = a2uiParser.parseMessage(mockData);

      expect(result.surface).to.exist;
      expect(result.surface?.surfaceId).to.equal('surface-001');
      expect(result.surface?.beginrender).to.be.true;
      expect(result.surface?.rootNode).to.be.an('object');
      expect(result.surface?.rootNode.componentId).to.equal('text-component');
    });
  });

  describe('parseSurfaceUpdate', () => {
    it('should parse surfaceUpdate message and create Surface', () => {
      const mockData = JSON.parse(
        readFileSync(join(__dirname, '../mock/simple-text.json'), 'utf-8')
      ) as A2UIMessage;

      const result = a2uiParser.parseMessage({
        surfaceUpdate: mockData.surfaceUpdate
      });

      expect(result.surface).to.exist;
      expect(result.surface?.surfaceId).to.equal('surface-001');
      expect(result.surface?.beginrender).to.be.false;
      expect(result.surface?.rootNode).to.be.an('object');
      expect(result.surface?.rootNode.componentId).to.equal('text-component');
    });

    it('should parse component and create HydrateNode', () => {
      const mockData = JSON.parse(
        readFileSync(join(__dirname, '../mock/simple-text.json'), 'utf-8')
      ) as A2UIMessage;

      const result = a2uiParser.parseMessage({
        surfaceUpdate: mockData.surfaceUpdate
      });

      expect(result.hydrateNodes).to.exist;
      expect(result.hydrateNodes).to.have.lengthOf(1);
      
      const hydrateNode = result.hydrateNodes![0];
      expect(hydrateNode.componentId).to.equal('text-component');
      expect(hydrateNode._vnode).to.exist;
      expect(hydrateNode.ownerSurfaceId).to.equal('surface-001');
      expect(hydrateNode.protocal).to.be.a('string');
    });

    it('should parse multiple components', () => {
      const multiComponentData: A2UIMessage = {
        surfaceUpdate: {
          surfaceId: 'surface-002',
          components: [
            {
              id: 'text-1',
              component: {
                Text: {
                  text: { literalString: 'First text' },
                  usageHint: 'h1'
                }
              }
            },
            {
              id: 'text-2',
              component: {
                Text: {
                  text: { literalString: 'Second text' },
                  usageHint: 'h2'
                }
              }
            }
          ]
        }
      };

      const result = a2uiParser.parseMessage(multiComponentData);

      expect(result.hydrateNodes).to.have.lengthOf(2);
      expect(result.hydrateNodes![0].componentId).to.equal('text-1');
      expect(result.hydrateNodes![1].componentId).to.equal('text-2');
    });
  });

  describe('parseDataModelUpdate', () => {
    it('should parse dataModelUpdate message and merge into store data model', () => {
      const testStore = createA2uiStore();
      a2uiParser.setStore(testStore);

      const dataModelUpdateData: A2UIMessage = {
        dataModelUpdate: {
          surfaceId: 'surface-001',
          path: '/user',
          contents: [
            {
              key: 'name',
              valueString: 'John Doe'
            },
            {
              key: 'age',
              valueNumber: 30
            },
            {
              key: 'active',
              valueBoolean: true
            }
          ]
        }
      };

      const result = a2uiParser.parseMessage(dataModelUpdateData);

      expect(result.dataModelUpdate).to.exist;
      expect(result.dataModelUpdate?.surfaceId).to.equal('surface-001');
      expect(result.dataModelUpdate?.path).to.equal('/user');
      expect(result.dataModelUpdate?.contents).to.have.lengthOf(3);
      expect(result.dataModelUpdate?.contents[0].key).to.equal('name');
      expect(result.dataModelUpdate?.contents[0].valueString).to.equal('John Doe');

      const model = testStore.getState().getDataModel('surface-001') as Record<string, unknown>;
      expect(model).to.exist;
      expect(model.user).to.be.an('object');
      const user = model.user as Record<string, unknown>;
      expect(user.name).to.equal('John Doe');
      expect(user.age).to.equal(30);
      expect(user.active).to.equal(true);
    });
  });

  describe('parseDeleteSurface', () => {
    it('should parse deleteSurface message', () => {
      const deleteSurfaceData: A2UIMessage = {
        deleteSurface: {
          surfaceId: 'surface-001'
        }
      };

      const result = a2uiParser.parseMessage(deleteSurfaceData);

      expect(result.deleteSurface).to.exist;
      expect(result.deleteSurface?.surfaceId).to.equal('surface-001');
    });
  });

  describe('render functionality', () => {
    beforeEach(() => {
      const testStore = createA2uiStore();
      a2uiParser.setStore(testStore);
    });

    it('should set renderMap', () => {
      const testStore = createA2uiStore();
      const mockRenderMap: RenderMap = {
        Text: (props: any) => React.createElement('div', { 'data-testid': 'text', ...props })
      };

      testStore.getState().setRenderMap(mockRenderMap);
      a2uiParser.setStore(testStore);

      const result = a2uiParser.parseMessage({
        surfaceUpdate: {
          surfaceId: 'surface-001',
          components: [
            {
              id: 'text-component',
              component: {
                Text: {
                  text: { literalString: 'Hello, A2UI!' },
                  usageHint: 'h1'
                }
              }
            }
          ]
        }
      });

      expect(result.hydrateNodes).to.exist;
      expect(result.hydrateNodes![0]._vnode).to.have.property('type');
      expect(result.hydrateNodes![0]._vnode).to.have.property('props');
    });

    it('should render component using renderMap', () => {
      const testStore = createA2uiStore();
      const mockRenderFunction: RenderFunction = (props: any) => 
        React.createElement('div', { 'data-testid': 'text', ...props });

      const mockRenderMap: RenderMap = {
        Text: mockRenderFunction
      };

      testStore.getState().setRenderMap(mockRenderMap);
      a2uiParser.setStore(testStore);

      const result = a2uiParser.parseMessage({
        surfaceUpdate: {
          surfaceId: 'surface-001',
          components: [
            {
              id: 'text-component',
              component: {
                Text: {
                  text: { literalString: 'Test Text' }
                }
              }
            }
          ]
        }
      });
      expect(result.hydrateNodes![0]._vnode).to.have.property('type');
      expect(result.hydrateNodes![0]._vnode).to.have.property('props');
      expect(result.hydrateNodes![0]._vnode.props).to.have.property('data-testid', 'text');
    });

    it('should return original component data when renderMap is not set', () => {
      const result = a2uiParser.parseMessage({
        surfaceUpdate: {
          surfaceId: 'surface-001',
          components: [
            {
              id: 'text-component',
              component: {
                Text: {
                  text: { literalString: 'Original Text' }
                }
              }
            }
          ]
        }
      });

      expect(result.hydrateNodes![0]._vnode).to.deep.equal({
        Text: {
          text: { literalString: 'Original Text' }
        }
      });
    });

    it('should return original component data when component not in renderMap', () => {
      const testStore = createA2uiStore();
      const mockRenderMap: RenderMap = {
        Button: (props: any) => ({ type: 'Button', props })
      };

      testStore.getState().setRenderMap(mockRenderMap);
      a2uiParser.setStore(testStore);

      const result = a2uiParser.parseMessage({
        surfaceUpdate: {
          surfaceId: 'surface-001',
          components: [
            {
              id: 'text-component',
              component: {
                Text: {
                  text: { literalString: 'Unknown Component' }
                }
              }
            }
          ]
        }
      });

      expect(result.hydrateNodes![0]._vnode).to.deep.equal({
        Text: {
          text: { literalString: 'Unknown Component' }
        }
      });
    });

    it('should render multiple components with different types', () => {
      const testStore = createA2uiStore();
      const mockRenderMap: RenderMap = {
        Text: (props: any) => ({ type: 'Text', props }),
        Button: (props: any) => ({ type: 'Button', props })
      };

      testStore.getState().setRenderMap(mockRenderMap);
      a2uiParser.setStore(testStore);

      const result = a2uiParser.parseMessage({
        surfaceUpdate: {
          surfaceId: 'surface-001',
          components: [
            {
              id: 'text-1',
              component: {
                Text: {
                  text: { literalString: 'Text Component' }
                }
              }
            },
            {
              id: 'button-1',
              component: {
                Button: {
                  label: 'Click Me'
                }
              }
            }
          ]
        }
      });

      expect(result.hydrateNodes).to.have.lengthOf(2);
      expect(result.hydrateNodes![0]._vnode).to.deep.equal({
        type: 'Text',
        props: {
          text: { literalString: 'Text Component' },
          id: 'text-1'
        }
      });
      expect(result.hydrateNodes![1]._vnode).to.deep.equal({
        type: 'Button',
        props: {
          label: 'Click Me',
          id: 'button-1'
        }
      });
    });
  });

  describe('JSONL parsing', () => {
    it('should parse JSONL string to messages', () => {
      const jsonl = `{"beginRendering":{"surfaceId":"surface-001","root":"text-component"}}\n{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-component","component":{"Text":{"text":{"literalString":"Hello, A2UI!"}}}}]}}`;

      const messages = a2uiParser.parseJSONL(jsonl);

      expect(messages).to.have.lengthOf(2);
      expect(messages[0].beginRendering).to.exist;
      expect(messages[1].surfaceUpdate).to.exist;
    });

    it('should stringify messages to JSONL', () => {
      const messages: A2UIMessage[] = [
        {
          beginRendering: {
            surfaceId: 'surface-001',
            root: 'text-component'
          }
        },
        {
          surfaceUpdate: {
            surfaceId: 'surface-001',
            components: [
              {
                id: 'text-component',
                component: {
                  Text: {
                    text: {
                      literalString: 'Hello, A2UI!'
                    }
                  }
                }
              }
            ]
          }
        }
      ];

      const jsonl = a2uiParser.stringifyJSONL(messages);

      expect(jsonl).to.be.a('string');
      expect(jsonl).to.include('beginRendering');
      expect(jsonl).to.include('surfaceUpdate');
      expect(jsonl).to.include('Hello, A2UI!');
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid message', () => {
      const invalidMessage = {} as A2UIMessage;

      expect(() => a2uiParser.parseMessage(invalidMessage)).to.throw('Invalid A2UI message: no action specified');
    });
  });
});
