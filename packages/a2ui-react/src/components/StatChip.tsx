import React, { type CSSProperties } from 'react';
import { mergeComponentStyles } from './mergeComponentStyles';

/** 与 Text / Card 一致的绑定形状；解析器会把 path 解析为 literalString */
export interface BoundText {
  literalString?: string;
  path?: string;
}

export interface StatChipProps {
  id: string;
  className?: string;
  /** 指标名 / 标签 */
  label: BoundText;
  /** 主数值或文案 */
  value: BoundText;
  /** 左侧强调色 */
  accent?: 'default' | 'success' | 'warning' | 'danger';
  styles?: CSSProperties;
  hasMounted?: boolean;
  onMountComplete?: (componentId: string) => void;
}

const accentBorder: Record<NonNullable<StatChipProps['accent']>, string> = {
  default: '#d9d9d9',
  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f'
};

export const StatChip: React.FC<StatChipProps> = ({
  id,
  className,
  label,
  value,
  accent = 'default',
  styles
}) => {
  const labelText = label.literalString ?? label.path ?? '';
  const valueText = value.literalString ?? value.path ?? '';

  return (
    <div
      id={id}
      className={className}
      style={mergeComponentStyles(
        {
          boxSizing: 'border-box',
          minWidth: 0,
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid #f0f0f0',
          borderLeftWidth: 4,
          borderLeftColor: accentBorder[accent],
          background: '#fafafa'
        },
        styles
      )}
    >
      <div
        style={{
          fontSize: '0.75rem',
          color: '#666',
          marginBottom: 4,
          lineHeight: 1.3
        }}
      >
        {labelText}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 600, lineHeight: 1.3 }}>{valueText}</div>
    </div>
  );
};
