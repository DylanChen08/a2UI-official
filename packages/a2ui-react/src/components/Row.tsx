import React, { ReactNode, type CSSProperties } from 'react';
import { mergeComponentStyles } from './mergeComponentStyles';

export interface RowProps {
  id: string;
  className?: string;
  children?: ReactNode;
  distribution?: 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround' | 'spaceEvenly';
  alignment?: 'center' | 'end' | 'start' | 'stretch';
  /** 协议可选：根节点额外 inline 样式 */
  styles?: CSSProperties;
  hasMounted?: boolean;
  onMountComplete?: (componentId: string) => void;
}

export const Row: React.FC<RowProps> = ({
  id,
  className,
  children,
  distribution = 'start',
  alignment = 'start',
  styles
}) => {

  const justifyContent = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    spaceBetween: 'space-between',
    spaceAround: 'space-around',
    spaceEvenly: 'space-evenly'
  };

  const alignItems = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch'
  };

  // 渲染子元素
  const renderChildren = () => {
    // 如果 children 是数组，直接渲染（这是 treeBuild 后的情况）
    if (Array.isArray(children)) {
      return children;
    }

    // 其他情况，直接渲染 children
    return children;
  };

  return (
    <div
      id={id}
      className={className}
      style={mergeComponentStyles(
        {
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: justifyContent[distribution],
          alignItems: alignItems[alignment],
          width: '100%',
          minHeight: 0,
          height: 'auto'
        },
        styles
      )}
    >
      {renderChildren()}
    </div>
  );
};
