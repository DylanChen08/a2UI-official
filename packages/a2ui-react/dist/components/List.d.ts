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
export declare const List: React.FC<ListProps>;
//# sourceMappingURL=List.d.ts.map