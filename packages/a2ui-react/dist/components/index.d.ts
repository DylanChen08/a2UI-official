import React from 'react';
import type { DataModelUpdatePayload } from 'a2ui-core';
import { Text } from './Text';
import { Column } from './Column';
import { Row } from './Row';
import { List } from './List';
import { Button, type OpenLinkSpec } from './Button';
import { Image } from './Image';
import { Icon } from './Icon';
import { Card } from './Card';
import './AnimatedWrapper.css';
export interface RenderFunction {
    (props: any): React.ReactElement;
}
export interface RenderMap {
    [componentName: string]: RenderFunction;
}
/** Optional hooks for `Button.action.localDataModelUpdate` (client-only data model writes). */
export interface CreateRenderMapLocalOptions {
    applyLocalDataModelUpdate?: (payload: DataModelUpdatePayload) => void;
    requestTreeRefresh?: () => void;
    /** Navigate / open tab for `Button.action.openLink`. */
    openExternalLink?: (spec: OpenLinkSpec) => void;
}
export declare const createRenderMap: (getHasMounted: (componentId: string) => boolean, onMountComplete: (componentId: string) => void, localOptions?: CreateRenderMapLocalOptions) => RenderMap;
export declare const renderMap: RenderMap;
export { Text, Column, Row, List, Button, Image, Icon, Card };
export type { OpenLinkSpec };
//# sourceMappingURL=index.d.ts.map