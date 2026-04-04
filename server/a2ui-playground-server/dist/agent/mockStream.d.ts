import type { z } from 'zod';
import { RunAgentInputSchema, type BaseEvent } from '@ag-ui/core';
type RunAgentInput = z.infer<typeof RunAgentInputSchema>;
/**
 * 从合并的 A2UI JSON 生成 AG-UI 事件序列（Mock Agent）。
 */
export declare function mockAgentEventStream(input: RunAgentInput, loadMock: (name: string) => Record<string, unknown>): AsyncGenerator<BaseEvent>;
export {};
//# sourceMappingURL=mockStream.d.ts.map