import React, { ReactNode } from 'react';

export interface ListProps {
  id: string;
  className?: string;
  children?: ReactNode;
  direction?: 'vertical' | 'horizontal';
  alignment?: 'center' | 'end' | 'start' | 'stretch';
  hasMounted?: boolean;
  onMountComplete?: (componentId: string) => void;
}

export const List: React.FC<ListProps> = ({
  id,
  className,
  children,
  direction = 'vertical',
  alignment = 'start'
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
      style={{
        display: 'flex',
        flexDirection,
        alignItems: alignItems[alignment],
        width: '100%',
        height: '100%'
      }}
    >
      {renderChildren()}
    </div>
  );
};
