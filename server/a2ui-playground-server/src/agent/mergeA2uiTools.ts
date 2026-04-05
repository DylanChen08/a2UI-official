import type { A2uiAgentToolDef } from './defaultA2uiTools';
import { DEFAULT_A2UI_SERVER_TOOLS } from './defaultA2uiTools';

/** 合并默认工具与客户端传入工具；同名以客户端为准。 */
export function mergeA2uiAgentTools(clientTools: A2uiAgentToolDef[]): A2uiAgentToolDef[] {
  const byName = new Map<string, A2uiAgentToolDef>();
  for (const t of DEFAULT_A2UI_SERVER_TOOLS) {
    byName.set(t.name, t);
  }
  for (const t of clientTools) {
    byName.set(t.name, t);
  }
  return Array.from(byName.values());
}
