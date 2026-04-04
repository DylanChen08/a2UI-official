import React from 'react';
import type { DataModelUpdatePayload } from 'a2ui-core';
/** Client-side open URL; mirrors optional userAction.openLink for transport. */
export interface OpenLinkSpec {
    url: string;
    target?: '_blank' | '_self' | '_parent' | '_top';
}
export interface ButtonAction {
    name: string;
    context?: Record<string, unknown>;
    localDataModelUpdate?: DataModelUpdatePayload;
    /** Open in the browser (new tab by default). Host injects handler via createRenderMap. */
    openLink?: OpenLinkSpec;
}
export interface ButtonProps {
    id?: string;
    className?: string;
    text?: {
        literalString?: string;
        path?: string;
    };
    variant?: 'primary' | 'secondary' | 'outline' | 'text';
    size?: 'small' | 'medium' | 'large';
    disabled?: boolean;
    hasMounted?: boolean;
    onMountComplete?: (componentId: string) => void;
    action?: ButtonAction;
    /** Injected by createRenderMap when local action options are provided. */
    onLocalDataModelUpdate?: (payload: DataModelUpdatePayload) => void;
    /** Injected when createRenderMap provides openExternalLink. */
    onOpenLink?: (spec: OpenLinkSpec) => void;
}
export declare const Button: React.FC<ButtonProps>;
//# sourceMappingURL=Button.d.ts.map