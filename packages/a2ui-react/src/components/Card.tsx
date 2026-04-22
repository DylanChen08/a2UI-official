import React, { type CSSProperties } from 'react';
import { mergeComponentStyles } from './mergeComponentStyles';

export interface CardProps {
  id?: string;
  className?: string;
  children?: React.ReactNode;
  title?: {
    literalString?: string;
    path?: string;
  };
  subtitle?: {
    literalString?: string;
    path?: string;
  };
  elevation?: number;
  /** 协议可选：卡片根容器额外 inline 样式 */
  styles?: CSSProperties;
  hasMounted?: boolean;
  onMountComplete?: (componentId: string) => void;
}

export const Card: React.FC<CardProps> = ({
  id,
  className,
  children,
  title,
  subtitle,
  elevation = 2,
  styles
}) => {
  const displayTitle = title?.literalString || title?.path || '';
  const displaySubtitle = subtitle?.literalString || subtitle?.path || '';

  return (
    <div
      id={id}
      className={className}
      style={mergeComponentStyles(
        {
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: `0 ${elevation}px ${2 * elevation}px rgba(0, 0, 0, 0.1)`,
          padding: '16px',
          margin: '8px'
        },
        styles
      )}
    >
      {(displayTitle || displaySubtitle) && (
        <div style={{ marginBottom: '12px' }}>
          {displayTitle && (
            <h3 style={{ margin: '0 0 4px 0' }}>{displayTitle}</h3>
          )}
          {displaySubtitle && (
            <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '0.875rem' }}>
              {displaySubtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
};
