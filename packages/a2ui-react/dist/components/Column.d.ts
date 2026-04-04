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
export declare const Column: React.FC<ColumnProps>;
//# sourceMappingURL=Column.d.ts.map