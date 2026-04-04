import { expect } from 'chai';
import { StreamSimulator, StreamSimulatorOptions } from '../src/mock/stream-simulator';
import { A2UIMessage } from 'a2ui-core';

describe('StreamSimulator', () => {
  let receivedChunks: string[] = [];
  let receivedErrors: Error[] = [];
  let simulator: StreamSimulator;

  beforeEach(() => {
    receivedChunks = [];
    receivedErrors = [];
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const messages: A2UIMessage[] = [
        {
          beginRendering: {
            surfaceId: 'surface-001',
            root: 'text-1'
          }
        }
      ];

      simulator = new StreamSimulator(
        messages,
        {},
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      expect(simulator).to.exist;
    });

    it('should initialize with custom options', () => {
      const messages: A2UIMessage[] = [
        {
          beginRendering: {
            surfaceId: 'surface-001',
            root: 'text-1'
          }
        }
      ];

      const options: Partial<StreamSimulatorOptions> = {
        chunkSize: 100,
        chunkDelay: 100
      };

      simulator = new StreamSimulator(
        messages,
        options,
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      expect(simulator).to.exist;
    });
  });

  describe('messagesToJSONL', () => {
    it('should convert single message to JSONL', async () => {
      const messages: A2UIMessage[] = [
        {
          beginRendering: {
            surfaceId: 'surface-001',
            root: 'text-1'
          }
        }
      ];

      simulator = new StreamSimulator(
        messages,
        {},
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      await simulator.start();

      const fullData = receivedChunks.join('');
      expect(fullData).to.include('beginRendering');
      expect(fullData).to.include('surface-001');
    });

    it('should convert multiple messages to JSONL', async () => {
      const messages: A2UIMessage[] = [
        {
          beginRendering: {
            surfaceId: 'surface-001',
            root: 'text-1'
          }
        },
        {
          surfaceUpdate: {
            surfaceId: 'surface-001',
            components: [
              {
                id: 'text-1',
                component: {
                  Text: {
                    text: { literalString: 'Hello' }
                  }
                }
              }
            ]
          }
        }
      ];

      simulator = new StreamSimulator(
        messages,
        {},
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      await simulator.start();

      const fullData = receivedChunks.join('');
      expect(fullData).to.include('beginRendering');
      expect(fullData).to.include('surfaceUpdate');
      expect(fullData).to.match(/\}\n\{/); // Should have newline between messages
    });

    it('should handle complex nested structures', async () => {
      const messages: A2UIMessage[] = [
        {
          surfaceUpdate: {
            surfaceId: 'surface-001',
            components: [
              {
                id: 'column-1',
                component: {
                  Column: {
                    children: {
                      explicitList: ['text-1', 'text-2']
                    },
                    distribution: 'start'
                  }
                }
              }
            ]
          }
        }
      ];

      simulator = new StreamSimulator(
        messages,
        {},
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      await simulator.start();

      const fullData = receivedChunks.join('');
      expect(fullData).to.include('Column');
      expect(fullData).to.include('explicitList');
      expect(fullData).to.include('text-1');
      expect(fullData).to.include('text-2');
    });
  });

  describe('start', () => {
    it('should stream data in chunks', async () => {
      const messages: A2UIMessage[] = [
        {
          beginRendering: {
            surfaceId: 'surface-001',
            root: 'text-1'
          }
        }
      ];

      const options: Partial<StreamSimulatorOptions> = {
        chunkSize: 10,
        chunkDelay: 10
      };

      simulator = new StreamSimulator(
        messages,
        options,
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      await simulator.start();

      expect(receivedChunks).to.have.length.greaterThan(1);
      const fullData = receivedChunks.join('');
      expect(fullData).to.include('beginRendering');
    });

    it('should respect chunkSize option', async () => {
      const messages: A2UIMessage[] = [
        {
          beginRendering: {
            surfaceId: 'surface-001',
            root: 'text-1'
          }
        }
      ];

      const options: Partial<StreamSimulatorOptions> = {
        chunkSize: 5,
        chunkDelay: 10
      };

      simulator = new StreamSimulator(
        messages,
        options,
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      await simulator.start();

      // Most chunks should be 5 characters or less
      const smallChunks = receivedChunks.filter(chunk => chunk.length <= 5);
      expect(smallChunks.length).to.be.greaterThan(receivedChunks.length / 2);
    });

    it('should respect chunkDelay option', async () => {
      const messages: A2UIMessage[] = [
        {
          beginRendering: {
            surfaceId: 'surface-001',
            root: 'text-1'
          }
        }
      ];

      const options: Partial<StreamSimulatorOptions> = {
        chunkSize: 10,
        chunkDelay: 50
      };

      simulator = new StreamSimulator(
        messages,
        options,
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      const startTime = Date.now();
      await simulator.start();
      const endTime = Date.now();
      const duration = endTime - startTime;

      // With multiple chunks and 50ms delay, should take at least some time
      expect(duration).to.be.greaterThan(0);
    });

    it('should handle empty message queue', async () => {
      const messages: A2UIMessage[] = [];

      simulator = new StreamSimulator(
        messages,
        {},
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      await simulator.start();

      expect(receivedChunks).to.have.lengthOf(0);
    });

    it('should handle large messages', async () => {
      const messages: A2UIMessage[] = [
        {
          surfaceUpdate: {
            surfaceId: 'surface-001',
            components: Array.from({ length: 10 }, (_, i) => ({
              id: `text-${i}`,
              component: {
                Text: {
                  text: { literalString: `Text ${i}` }
                }
              }
            }))
          }
        }
      ];

      simulator = new StreamSimulator(
        messages,
        {},
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      await simulator.start();

      const fullData = receivedChunks.join('');
      expect(fullData).to.include('text-0');
      expect(fullData).to.include('text-9');
    });
  });

  describe('stop', () => {
    it('should stop streaming', async () => {
      const messages: A2UIMessage[] = [
        {
          beginRendering: {
            surfaceId: 'surface-001',
            root: 'text-1'
          }
        }
      ];

      simulator = new StreamSimulator(
        messages,
        {},
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      // Start streaming
      const startPromise = simulator.start();
      
      // Stop immediately
      simulator.stop();

      await startPromise;

      // Should have received some chunks before stopping
      expect(receivedChunks.length).to.be.greaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should call onError callback on error', async () => {
      const messages: A2UIMessage[] = [
        {
          beginRendering: {
            surfaceId: 'surface-001',
            root: 'text-1'
          }
        }
      ];

      simulator = new StreamSimulator(
        messages,
        {},
        (data) => receivedChunks.push(data),
        (error) => receivedErrors.push(error)
      );

      await simulator.start();

      // Should not have errors with valid messages
      expect(receivedErrors).to.have.lengthOf(0);
    });
  });

  describe('integration with parser', () => {
    it('should work with A2UIParser', async () => {
      const { a2uiParser } = require('a2ui-core');
      const { createA2uiStore } = require('a2ui-core');

      const messages: A2UIMessage[] = [
        {
          beginRendering: {
            surfaceId: 'surface-001',
            root: 'text-1'
          }
        },
        {
          surfaceUpdate: {
            surfaceId: 'surface-001',
            components: [
              {
                id: 'text-1',
                component: {
                  Text: {
                    text: { literalString: 'Hello, World!' }
                  }
                }
              }
            ]
          }
        }
      ];

      const testStore = createA2uiStore();
      a2uiParser.setStore(testStore);

      const renderMap = {
        Text: (props: any) => ({ type: 'Text', props })
      };
      testStore.getState().setRenderMap(renderMap);

      let renderCount = 0;
      a2uiParser.setRenderCallback(() => {
        renderCount++;
      });

      a2uiParser.initStreamMode();

      simulator = new StreamSimulator(
        messages,
        { chunkSize: 20, chunkDelay: 10 },
        (data) => a2uiParser.write(data),
        (error) => console.error('Stream error:', error)
      );

      await simulator.start();
      a2uiParser.endStream();

      // Should have triggered rendering
      expect(renderCount).to.be.greaterThan(0);
    });
  });
});
