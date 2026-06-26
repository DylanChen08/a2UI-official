import fs from 'fs';
import path from 'path';

const MOCK_RELATIVE_DIR = path.join('packages', 'a2ui-core', 'mock');

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function getMockDirCandidates(): string[] {
  return unique([
    path.resolve(__dirname, '../../../', MOCK_RELATIVE_DIR),
    path.resolve(__dirname, '../../', MOCK_RELATIVE_DIR),
    path.resolve(process.cwd(), MOCK_RELATIVE_DIR),
    path.resolve(process.cwd(), '..', MOCK_RELATIVE_DIR),
    path.resolve(process.cwd(), '../..', MOCK_RELATIVE_DIR)
  ]);
}

/**
 * 从 monorepo `packages/a2ui-core/mock/<name>.json` 读取合并 A2UI 消息。
 * 线上可能只把 server 目录放在仓库根下一级，故同时兼容多种部署目录。
 */
export function loadA2uiMockJson(mockBaseName: string): Record<string, unknown> {
  const filename = `${path.basename(mockBaseName)}.json`;
  const candidates = getMockDirCandidates().map((dir) => path.join(dir, filename));
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) {
    throw new Error(`mock file not found: ${filename}; tried ${candidates.join(', ')}`);
  }
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}
