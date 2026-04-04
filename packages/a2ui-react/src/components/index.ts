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

// 创建带有动画支持的 renderMap
export const createRenderMap = (
  getHasMounted: (componentId: string) => boolean,
  onMountComplete: (componentId: string) => void,
  localOptions?: CreateRenderMapLocalOptions
): RenderMap => ({
  Text: (props: any) => {
    const hasMounted = getHasMounted(props.id);
    if (!hasMounted) {
      setTimeout(() => {
        onMountComplete(props.id);
      }, 300);
    }
    const className = `animated-wrapper ${!hasMounted ? 'animating' : ''}`;
    return React.createElement(Text, {
      ...props,
      className: `${className} ${props.className || ''}`
    });
  },
  Column: (props: any) => {
    const hasMounted = getHasMounted(props.id);
    console.log('####hasMounted', hasMounted);
    if (!hasMounted) {
      setTimeout(() => {
        onMountComplete(props.id);
      }, 300);
    }
    const className = `animated-wrapper ${!hasMounted ? 'animating' : ''}`;
    return React.createElement(Column, {
      ...props,
      className: `${className} ${props.className || ''}`
    });
  },
  Row: (props: any) => {
    const hasMounted = getHasMounted(props.id);
    if (!hasMounted) {
      setTimeout(() => {
        onMountComplete(props.id);
      }, 300);
    }
    const className = `animated-wrapper ${!hasMounted ? 'animating' : ''}`;
    return React.createElement(Row, {
      ...props,
      className: `${className} ${props.className || ''}`
    });
  },
  List: (props: any) => {
    const hasMounted = getHasMounted(props.id);
    if (!hasMounted) {
      setTimeout(() => {
        onMountComplete(props.id);
      }, 300);
    }
    const className = `animated-wrapper ${!hasMounted ? 'animating' : ''}`;
    return React.createElement(List, {
      ...props,
      className: `${className} ${props.className || ''}`
    });
  },
  Button: (props: any) => {
    const hasMounted = getHasMounted(props.id);
    if (!hasMounted) {
      setTimeout(() => {
        onMountComplete(props.id);
      }, 300);
    }
    const className = `animated-wrapper ${!hasMounted ? 'animating' : ''}`;
    const apply = localOptions?.applyLocalDataModelUpdate;
    const refresh = localOptions?.requestTreeRefresh;
    const onLocalDataModelUpdate =
      apply && refresh
        ? (payload: DataModelUpdatePayload) => {
            apply(payload);
            refresh();
          }
        : undefined;
    const onOpenLink = localOptions?.openExternalLink;
    return React.createElement(Button, {
      ...props,
      className: `${className} ${props.className || ''}`,
      onLocalDataModelUpdate,
      onOpenLink
    });
  },
  Image: (props: any) => {
    const hasMounted = getHasMounted(props.id);
    if (!hasMounted) {
      setTimeout(() => {
        onMountComplete(props.id);
      }, 300);
    }
    const className = `animated-wrapper ${!hasMounted ? 'animating' : ''}`;
    return React.createElement(Image, {
      ...props,
      className: `${className} ${props.className || ''}`
    });
  },
  Icon: (props: any) => {
    const hasMounted = getHasMounted(props.id);
    if (!hasMounted) {
      setTimeout(() => {
        onMountComplete(props.id);
      }, 300);
    }
    const className = `animated-wrapper ${!hasMounted ? 'animating' : ''}`;
    return React.createElement(Icon, {
      ...props,
      className: `${className} ${props.className || ''}`
    });
  },
  Card: (props: any) => {
    const hasMounted = getHasMounted(props.id);
    if (!hasMounted) {
      setTimeout(() => {
        onMountComplete(props.id);
      }, 300);
    }
    const className = `animated-wrapper ${!hasMounted ? 'animating' : ''}`;
    return React.createElement(Card, {
      ...props,
      className: `${className} ${props.className || ''}`
    });
  },
});

// 默认的 renderMap（不带动画）
export const renderMap: RenderMap = {
  Text: (props: any) => React.createElement(Text, props),
  Column: (props: any) => React.createElement(Column, props),
  Row: (props: any) => React.createElement(Row, props),
  List: (props: any) => React.createElement(List, props),
  Button: (props: any) => React.createElement(Button, props),
  Image: (props: any) => React.createElement(Image, props),
  Icon: (props: any) => React.createElement(Icon, props),
  Card: (props: any) => React.createElement(Card, props)
};

export { Text, Column, Row, List, Button, Image, Icon, Card };
export type { OpenLinkSpec };
