import { expect } from 'chai';
import { JSONLBuffer, A2UIParser, A2UIMessage } from '../src/parser';

describe('JSONLBuffer', () => {
  let receivedMessages: A2UIMessage[] = [];
  let buffer: JSONLBuffer;

  beforeEach(() => {
    receivedMessages = [];
    buffer = new JSONLBuffer(
      (message) => {
        receivedMessages.push(message);
      },
      (error) => {
        console.error('Buffer error:', error);
      }
    );
  });

  describe('basic message parsing', () => {
    it('should parse a complete single-line JSON message', () => {
      const message = '{"beginRendering":{"surfaceId":"surface-001","root":"text-component"}}';
      buffer.write(message);

      expect(receivedMessages).to.have.lengthOf(1);
      expect(receivedMessages[0].beginRendering).to.exist;
      expect(receivedMessages[0].beginRendering?.surfaceId).to.equal('surface-001');
    });

    it('should parse multiple complete JSONL messages', () => {
      const jsonl = '{"beginRendering":{"surfaceId":"surface-001","root":"text-component"}}\n{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-component","component":{"Text":{"text":{"literalString":"Hello"}}}}]}}';
      buffer.write(jsonl);

      expect(receivedMessages).to.have.lengthOf(2);
      expect(receivedMessages[0].beginRendering).to.exist;
      expect(receivedMessages[1].surfaceUpdate).to.exist;
    });

    it('should buffer incomplete JSON and wait for more data', () => {
      buffer.write('{"beginRendering":{"surfaceId":"');
      expect(receivedMessages).to.have.lengthOf(0);

      buffer.write('surface-001","root":"text-component"}}');
      expect(receivedMessages).to.have.lengthOf(1);
      expect(receivedMessages[0].beginRendering).to.exist;
    });
  });

  describe('surfaceUpdate component extraction', () => {
    it('should extract single component from surfaceUpdate', () => {
      const message = '{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-1","component":{"Text":{"text":{"literalString":"Hello"}}}}]}}';
      buffer.write(message);

      expect(receivedMessages).to.have.lengthOf(1);
      expect(receivedMessages[0].surfaceUpdate).to.exist;
      expect(receivedMessages[0].surfaceUpdate?.components).to.have.lengthOf(1);
      expect(receivedMessages[0].surfaceUpdate?.components[0].id).to.equal('text-1');
    });

    it('should extract multiple components from surfaceUpdate', () => {
      const message = '{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-1","component":{"Text":{"text":{"literalString":"First"}}}},{"id":"text-2","component":{"Text":{"text":{"literalString":"Second"}}}}]}}';
      buffer.write(message);

      expect(receivedMessages).to.have.lengthOf(2);
      expect(receivedMessages[0].surfaceUpdate?.components[0].id).to.equal('text-1');
      expect(receivedMessages[1].surfaceUpdate?.components[0].id).to.equal('text-2');
    });

    it('should extract components in real-time as they become complete', () => {
      const partial1 = '{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-1","component":{"Text":{"text":{"literalString":"First"}}}}';
      const partial2 = '},{"id":"text-2","component":{"Text":{"text":{"literalString":"Second"}}}}]}}';

      buffer.write(partial1);
      // 在流式模式下，即使整个 JSON 对象不完整，也可以提取完整的组件
      // partial1 包含一个完整的组件，应该立即被处理
      expect(receivedMessages).to.have.lengthOf(1);
      expect(receivedMessages[0].surfaceUpdate?.components[0].id).to.equal('text-1');

      buffer.write(partial2);
      // 第二个组件也应该被处理
      expect(receivedMessages).to.have.lengthOf(2);
      expect(receivedMessages[1].surfaceUpdate?.components[0].id).to.equal('text-2');
    });

    it('should handle complex nested components', () => {
      const message = '{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"column-1","component":{"Column":{"children":{"explicitList":["text-1","text-2"]},"distribution":"start"}}}]}}';
      buffer.write(message);

      expect(receivedMessages).to.have.lengthOf(1);
      expect(receivedMessages[0].surfaceUpdate?.components[0].id).to.equal('column-1');
      expect(receivedMessages[0].surfaceUpdate?.components[0].component.Column).to.exist;
    });

    it('should handle components with arrays in properties', () => {
      const message = '{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-1","component":{"Text":{"text":{"literalString":"Hello"},"tags":["tag1","tag2"]}}}}]}';
      buffer.write(message);

      expect(receivedMessages).to.have.lengthOf(1);
      expect(receivedMessages[0].surfaceUpdate?.components[0].component.Text?.tags).to.deep.equal(['tag1', 'tag2']);
    });
  });

  describe('stream processing', () => {
    it('should handle chunked data', () => {
      const message = '{"beginRendering":{"surfaceId":"surface-001","root":"text-component"}}';
      const chunkSize = 10;

      for (let i = 0; i < message.length; i += chunkSize) {
        const chunk = message.substring(i, Math.min(i + chunkSize, message.length));
        buffer.write(chunk);
      }

      expect(receivedMessages).to.have.lengthOf(1);
      expect(receivedMessages[0].beginRendering).to.exist;
    });

    it('should handle multiple messages in chunks', () => {
      const jsonl = '{"beginRendering":{"surfaceId":"surface-001","root":"text-component"}}\n{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-1","component":{"Text":{"text":{"literalString":"Hello"}}}}]}}';
      const chunkSize = 20;

      for (let i = 0; i < jsonl.length; i += chunkSize) {
        const chunk = jsonl.substring(i, Math.min(i + chunkSize, jsonl.length));
        buffer.write(chunk);
      }

      expect(receivedMessages).to.have.lengthOf(2);
    });

    it('should handle very small chunks', () => {
      const message = '{"beginRendering":{"surfaceId":"surface-001","root":"text-component"}}';
      
      for (let i = 0; i < message.length; i++) {
        buffer.write(message[i]);
      }

      expect(receivedMessages).to.have.lengthOf(1);
      expect(receivedMessages[0].beginRendering).to.exist;
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      buffer.write('');
      expect(receivedMessages).to.have.lengthOf(0);
    });

    it('should handle whitespace', () => {
      buffer.write('   \n   ');
      expect(receivedMessages).to.have.lengthOf(0);
    });

    it('should handle JSON with escaped characters', () => {
      const message = '{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-1","component":{"Text":{"text":{"literalString":"Hello \\"World\\""}}}}]}}';
      buffer.write(message);

      expect(receivedMessages).to.have.lengthOf(1);
      expect(receivedMessages[0].surfaceUpdate?.components[0].component.Text?.text?.literalString).to.equal('Hello "World"');
    });

    it('should handle JSON with newlines in strings', () => {
      const message = '{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-1","component":{"Text":{"text":{"literalString":"Line 1\\nLine 2"}}}}]}}';
      buffer.write(message);

      expect(receivedMessages).to.have.lengthOf(1);
      expect(receivedMessages[0].surfaceUpdate?.components[0].component.Text?.text?.literalString).to.equal('Line 1\nLine 2');
    });

    it('should handle multiple consecutive complete messages', () => {
      const messages = [
        '{"beginRendering":{"surfaceId":"surface-001","root":"text-1"}}',
        '{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-1","component":{"Text":{"text":{"literalString":"First"}}}}]}}',
        '{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-2","component":{"Text":{"text":{"literalString":"Second"}}}}]}}'
      ].join('\n');

      buffer.write(messages);

      expect(receivedMessages).to.have.lengthOf(3);
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON gracefully', () => {
      const invalidMessage = '{"invalid": json}';
      buffer.write(invalidMessage);

      // Should not crash, but also should not produce messages
      expect(receivedMessages).to.have.lengthOf(0);
    });

    it('should handle incomplete JSON at end of stream', () => {
      buffer.write('{"beginRendering":{"surfaceId":"');
      
      expect(receivedMessages).to.have.lengthOf(0);
      
      buffer.end();
      
      // Should still not produce messages for incomplete JSON
      expect(receivedMessages).to.have.lengthOf(0);
    });
  });
});

describe('A2UIParser stream mode', () => {
  let parser: A2UIParser;
  let receivedRootVNodes: any[] = [];
  let testStore: any;

  beforeEach(() => {
    parser = A2UIParser.getInstance();
    parser.resetRuntimeState();
    receivedRootVNodes = [];
    
    // Create a mock store with React elements
    const React = require('react');
    testStore = {
      getState: () => ({
        renderMap: {
          Text: (props: any) => React.createElement('div', { ...props, 'data-testid': 'text' }),
          Column: (props: any) => React.createElement('div', { ...props, 'data-testid': 'column' })
        },
        addError: (error: any) => {},
        addHydrateNode: (node: any) => {},
        addSurface: (surface: any) => {},
        setHydrateNodeMounted: (componentId: string) => {}
      })
    };

    parser.setStore(testStore);
    parser.setRenderThrottleMs(0);
    parser.setRenderCallback((rootVNode) => {
      receivedRootVNodes.push(rootVNode);
    });
  });

  describe('initStreamMode and write', () => {
    it('should initialize stream mode', () => {
      expect(() => parser.initStreamMode()).to.not.throw();
    });

    it('should process data in stream mode', () => {
      parser.initStreamMode();
      
      const data = '{"beginRendering":{"surfaceId":"surface-001","root":"text-1"}}\n{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-1","component":{"Text":{"text":{"literalString":"Hello"}}}}]}}';
      parser.write(data);
      parser.endStream();

      expect(receivedRootVNodes).to.have.length.greaterThan(0);
    });

    it('should process chunked data in stream mode', () => {
      parser.initStreamMode();
      
      const message = '{"beginRendering":{"surfaceId":"surface-001","root":"text-1"}}\n{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-1","component":{"Text":{"text":{"literalString":"Hello"}}}}]}}';
      const chunkSize = 20;

      for (let i = 0; i < message.length; i += chunkSize) {
        const chunk = message.substring(i, Math.min(i + chunkSize, message.length));
        parser.write(chunk);
      }
      
      parser.endStream();

      expect(receivedRootVNodes).to.have.length.greaterThan(0);
    });

    it('should throw error when writing without initializing stream mode', () => {
      expect(() => parser.write('{"test":"data"}')).to.throw('Stream mode not initialized');
    });
  });

  describe('real-time component rendering', () => {
    it('should render components as they become complete', () => {
      parser.initStreamMode();
      
      const partial1 = '{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"text-1","component":{"Text":{"text":{"literalString":"First"}}}}';
      const partial2 = '},{"id":"text-2","component":{"Text":{"text":{"literalString":"Second"}}}}]}}';

      parser.write(partial1);
      const countAfterFirst = receivedRootVNodes.length;
      
      parser.write(partial2);
      const countAfterSecond = receivedRootVNodes.length;

      expect(countAfterSecond).to.be.greaterThan(countAfterFirst);
      
      parser.endStream();
    });

    it('should handle complex nested structure in stream mode', () => {
      parser.initStreamMode();
      
      const data = '{"beginRendering":{"surfaceId":"surface-001","root":"column-1"}}\n{"surfaceUpdate":{"surfaceId":"surface-001","components":[{"id":"column-1","component":{"Column":{"children":{"explicitList":["text-1","text-2"]},"distribution":"start"}}},{"id":"text-1","component":{"Text":{"text":{"literalString":"First"}}}},{"id":"text-2","component":{"Text":{"text":{"literalString":"Second"}}}}]}}';
      parser.write(data);
      parser.endStream();

      expect(receivedRootVNodes).to.have.length.greaterThan(0);
    });
  });
});
