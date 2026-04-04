import React from 'react';
export interface TextProps {
    id?: string;
    className?: string;
    text: {
        literalString?: string;
        path?: string;
    };
    usageHint?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'caption' | 'body';
    hasMounted?: boolean;
    onMountComplete?: (componentId: string) => void;
}
export declare const Text: React.FC<TextProps>;
//# sourceMappingURL=Text.d.ts.map