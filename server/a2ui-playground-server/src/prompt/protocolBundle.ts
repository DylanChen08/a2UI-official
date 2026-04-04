import fs from 'fs';
import path from 'path';

/**
 * 与 monorepo `docs/` 下 JSON 协议文件对应；运行时从磁盘读取并缓存。
 */
function resolveDocsDir(): string {
  return path.resolve(__dirname, '../../../../docs');
}

let cache: {
  serverToClientWithStandardCatalogJson: string;
  catalogDefinitionJson: string;
} | null = null;

export function getA2uiAgentProtocolBundle(): {
  /** A2UI 消息级协议（含 standard catalog 引用的 JSON Schema） */
  serverToClientWithStandardCatalogJson: string;
  /** 本仓库宿主实现的组件子集 catalog（与消息协议配合） */
  catalogDefinitionJson: string;
} {
  if (cache) return cache;
  const docs = resolveDocsDir();
  const serverToClientWithStandardCatalogJson = fs.readFileSync(
    path.join(docs, 'server_to_client_with_standard_catalog.json'),
    'utf8'
  );
  const catalogDefinitionJson = fs.readFileSync(path.join(docs, 'catalog_definition.json'), 'utf8');
  cache = {
    serverToClientWithStandardCatalogJson,
    catalogDefinitionJson
  };
  return cache;
}
