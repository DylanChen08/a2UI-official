import React from 'react';
import { Text } from './Text';
import { Column } from './Column';
import { Row } from './Row';
import { List } from './List';
import { Button } from './Button';
import { Image } from './Image';
import { Icon } from './Icon';
import { Card } from './Card';
import './AnimatedWrapper.css';
// 创建带有动画支持的 renderMap
export const createRenderMap = (getHasMounted, onMountComplete, localOptions) => ({
    Text: (props) => {
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
    Column: (props) => {
        const hasMounted = getHasMounted(props.id);
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
    Row: (props) => {
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
    List: (props) => {
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
    Button: (props) => {
        const hasMounted = getHasMounted(props.id);
        if (!hasMounted) {
            setTimeout(() => {
                onMountComplete(props.id);
            }, 300);
        }
        const className = `animated-wrapper ${!hasMounted ? 'animating' : ''}`;
        const apply = localOptions?.applyLocalDataModelUpdate;
        const refresh = localOptions?.requestTreeRefresh;
        const onLocalDataModelUpdate = apply && refresh
            ? (payload) => {
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
    Image: (props) => {
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
    Icon: (props) => {
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
    Card: (props) => {
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
export const renderMap = {
    Text: (props) => React.createElement(Text, props),
    Column: (props) => React.createElement(Column, props),
    Row: (props) => React.createElement(Row, props),
    List: (props) => React.createElement(List, props),
    Button: (props) => React.createElement(Button, props),
    Image: (props) => React.createElement(Image, props),
    Icon: (props) => React.createElement(Icon, props),
    Card: (props) => React.createElement(Card, props)
};
export { Text, Column, Row, List, Button, Image, Icon, Card };
//# sourceMappingURL=index.js.map