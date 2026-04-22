import React, { ReactNode, type CSSProperties } from 'react';
import { mergeComponentStyles } from './mergeComponentStyles';

export interface ListProps {
  id: string;
  className?: string;
  children?: ReactNode;
  direction?: 'vertical' | 'horizontal';
  alignment?: 'center' | 'end' | 'start' | 'stretch';
  /** 协议可选：根节点额外 inline 样式 */
  styles?: CSSProperties;
  hasMounted?: boolean;
  onMountComplete?: (componentId: string) => void;
}

export const List: React.FC<ListProps> = ({
  id,
  className,
  children,
  direction = 'vertical',
  alignment = 'start',
  styles
}) => {
  const flexDirection = direction === 'horizontal' ? 'row' : 'column';

  const alignItems = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch'
  };

  const renderChildren = () => {
    if (Array.isArray(children)) {
      return children;
    }
    return children;
  };

  return (
    <div
      id={id}
      className={className}
      style={mergeComponentStyles(
        {
          display: 'flex',
          flexDirection,
          alignItems: alignItems[alignment],
          width: '100%',
          height: '100%'
        },
        styles
      )}
    >
      {renderChildren()}
    </div>
  );
};
