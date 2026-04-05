/**
 * Playground Agent 默认注入的 AG-UI tools（可被 RunAgentInput.tools 同名覆盖）。
 */

export interface A2uiAgentToolDef {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export const DEFAULT_A2UI_SERVER_TOOLS: A2uiAgentToolDef[] = [
  {
    name: 'get_antd_icons',
    description:
      '查询当前宿主可用的 @ant-design/icons 图标组件名。生成 A2UI 时 Icon.name.literalString 必须使用此处返回的 PascalCase 名称（例如 HomeOutlined、SearchOutlined）。可按子串过滤以缩小列表。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '可选，按名称子串过滤（不区分大小写），例如 "Home" 或 "Outlined"'
        },
        limit: {
          type: 'number',
          description: '可选，返回条数上限，默认 80，最大 200'
        }
      }
    }
  }
];
