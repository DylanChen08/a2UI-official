import React from 'react';
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
    hasMounted?: boolean;
    onMountComplete?: (componentId: string) => void;
}
export declare const Card: React.FC<CardProps>;
//# sourceMappingURL=Card.d.ts.map