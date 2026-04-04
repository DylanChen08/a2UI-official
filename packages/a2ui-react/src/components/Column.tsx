import React, { ReactNode } from 'react';

export interface ColumnProps {
  id: string;
  className?: string;
  children?: ReactNode;
  distribution?: 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround' | 'spaceEvenly';
  alignment?: 'center' | 'end' | 'start' | 'stretch';
  hasMounted?: boolean;
  onMountComplete?: (componentId: string) => void;
}

export const Column: React.FC<ColumnProps> = ({ 
  id, 
  className,
  children, 
  distribution = 'start', 
  alignment = 'start'
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justifyContent[distribution],
        alignItems: alignItems[alignment],
        width: '100%',
        height: '100%'
      }}
    >
      {renderChildren()}
    </div>
  );
};
