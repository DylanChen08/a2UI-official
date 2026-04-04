import React from 'react';
export interface IconProps {
    id?: string;
    className?: string;
    name: string;
    size?: number;
    color?: string;
    hasMounted?: boolean;
    onMountComplete?: (componentId: string) => void;
}
export declare const Icon: React.FC<IconProps>;
//# sourceMappingURL=Icon.d.ts.map