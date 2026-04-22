import * as AntdIcons from '@ant-design/icons';
import React, { type CSSProperties } from 'react';
import { mergeComponentStyles } from './mergeComponentStyles';
import { LEGACY_MATERIAL_ICON_TO_ANTD } from '../icon/legacyMaterialToAntd';

/** 与 docs/catalog_definition.json 中 Icon.name 一致（literalString / path）；parser 通常会解析为 string */
export type IconNameBound = { literalString?: string; path?: string };

export interface IconProps {
  id?: string;
  className?: string;
  name: string | IconNameBound;
  size?: number;
  color?: string;
  /** 协议可选：根 span 额外 inline 样式 */
  styles?: CSSProperties;
  hasMounted?: boolean;
  onMountComplete?: (componentId: string) => void;
}

function resolveIconName(name: IconProps['name']): string {
  if (typeof name === 'string') return name;
  if (name && typeof name === 'object') {
    return name.literalString ?? name.path ?? '';
  }
  return '';
}

const ANT_ICON_MAP = AntdIcons as unknown as Record<
  string,
  React.ComponentType<{ style?: React.CSSProperties; className?: string }>
>;

function resolveAntdExportName(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (ANT_ICON_MAP[t]) return t;
  const mapped = LEGACY_MATERIAL_ICON_TO_ANTD[t];
  if (mapped && ANT_ICON_MAP[mapped]) return mapped;
  return t;
}

export const Icon: React.FC<IconProps> = ({
  id,
  className,
  name,
  size = 24,
  color = '#000',
  styles
}) => {
  const displayName = resolveIconName(name);
  const exportName = resolveAntdExportName(displayName);
  const Cmp = exportName ? ANT_ICON_MAP[exportName] : undefined;

  if (Cmp) {
    return (
      <span
        id={id}
        className={className}
        style={mergeComponentStyles(
          {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 0
          },
          styles
        )}
      >
        <Cmp style={{ fontSize: size, color }} />
      </span>
    );
  }

  return (
    <span
      id={id}
      className={className}
      style={mergeComponentStyles(
        {
          fontSize: `${size}px`,
          color,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center'
        },
        styles
      )}
    >
      {displayName || '?'}
    </span>
  );
};
