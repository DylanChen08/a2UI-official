import fs from 'fs';
import path from 'path';

/**
 * 从 monorepo `packages/a2ui-core/mock/<name>.json` 读取合并 A2UI 消息。
 * 运行时 cwd 可为任意目录，故以本文件位置解析路径。
 */
export function loadA2uiMockJson(mockBaseName: string): Record<string, unknown> {
  const mockDir = path.resolve(__dirname, '../../../packages/a2ui-core/mock');
  const file = path.join(mockDir, `${mockBaseName}.json`);
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}
