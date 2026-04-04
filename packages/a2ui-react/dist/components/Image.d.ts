import React from 'react';
export interface ImageProps {
    id?: string;
    className?: string;
    source: {
        uri: string;
    };
    alt?: string;
    width?: number | string;
    height?: number | string;
    hasMounted?: boolean;
    onMountComplete?: (componentId: string) => void;
}
export declare const Image: React.FC<ImageProps>;
//# sourceMappingURL=Image.d.ts.map