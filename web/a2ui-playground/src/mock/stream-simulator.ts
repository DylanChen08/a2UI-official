import { A2UIMessage } from 'a2ui-core';

export interface StreamSimulatorOptions {
  chunkSize: number;
  chunkDelay: number;
}

export class StreamSimulator {
  private messageQueue: A2UIMessage[] = [];
  private chunkSize: number;
  private chunkDelay: number;
  private onData: (data: string) => void;
  private onError: (error: Error) => void;

  constructor(
    messages: A2UIMessage[],
    options: Partial<StreamSimulatorOptions> = {},
    onData: (data: string) => void,
    onError: (error: Error) => void = (error) => console.error('Stream simulation error:', error)
  ) {
    this.messageQueue = messages;
    this.chunkSize = options.chunkSize || 50;
    this.chunkDelay = options.chunkDelay || 50;
    this.onData = onData;
    this.onError = onError;
  }

  // 将消息转换为 JSONL 格式
  private messagesToJSONL(messages: A2UIMessage[]): string {
    return messages.map(msg => JSON.stringify(msg)).join('\n') + '\n';
  }

  // 启动流模拟
  async start(): Promise<void> {
    // 将所有消息转换为 JSONL
    const jsonlContent = this.messagesToJSONL(this.messageQueue);

    // 模拟流式输出
    let position = 0;
    const totalLength = jsonlContent.length;

    while (position < totalLength) {
      // 计算当前块的结束位置
      const endPosition = Math.min(position + this.chunkSize, totalLength);

      // 获取当前块
      const chunk = jsonlContent.substring(position, endPosition);

      // 发送数据块
      this.onData(chunk);

      // 模拟延迟
      await new Promise(resolve => setTimeout(resolve, this.chunkDelay));

      // 更新位置
      position = endPosition;
    }
  }

  // 停止流模拟
  stop(): void {
    // 清理资源
  }
}
