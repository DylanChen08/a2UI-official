import React, { ReactNode } from 'react';
export interface RowProps {
    id: string;
    className?: string;
    children?: ReactNode;
    distribution?: 'start' | 'center' | 'end' | 'spaceBetween' | 'spaceAround' | 'spaceEvenly';
    alignment?: 'center' | 'end' | 'start' | 'stretch';
    hasMounted?: boolean;
    onMountComplete?: (componentId: string) => void;
}
export declare const Row: React.FC<RowProps>;
//# sourceMappingURL=Row.d.ts.map