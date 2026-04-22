import React, { ReactNode, type CSSProperties } from 'react';
import { mergeComponentStyles } from './mergeComponentStyles';

export interface ColumnProps {
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

export const Column: React.FC<ColumnProps> = ({ 
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

  const distributesMainSpace =
    distribution === 'spaceBetween' ||
    distribution === 'spaceAround' ||
    distribution === 'spaceEvenly';

  return (
    <div 
      id={id}
      className={className}
      style={mergeComponentStyles(
        {
          display: 'flex',
          flexDirection: 'column',
          flexWrap: 'nowrap',
          gap: 12,
          justifyContent: justifyContent[distribution],
          alignItems: alignItems[alignment],
          boxSizing: 'border-box',
          /** 不设死 100%：作为 Row 子项时需随内容/弹性并排，否则每项都会占满一行导致「竖排」错觉 */
          minWidth: 0,
          minHeight: 0,
          ...(distributesMainSpace
            ? { height: 'fit-content', maxHeight: '100%' }
            : { height: '100%' })
        },
        styles
      )}
    >
      {renderChildren()}
    </div>
  );
};
