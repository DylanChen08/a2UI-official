import { jsx as _jsx } from "react/jsx-runtime";
export const Column = ({ id, className, children, distribution = 'start', alignment = 'start' }) => {
    const justifyContent = {
        start: 'flex-start',
        center: 'center',
        end: 'flex-end',
        spaceBetween: 'space-between',
        spaceAround: 'space-around',
        spaceEvenly: 'space-evenly'
    };
    const alignItems = {
        start: 'flex-start',
        center: 'center',
        end: 'flex-end',
        stretch: 'stretch'
    };
    // 渲染子元素
    const renderChildren = () => {
        // 如果 children 是数组，直接渲染（这是 treeBuild 后的情况）
        if (Array.isArray(children)) {
            return children;
        }
        // 其他情况，直接渲染 children
        return children;
    };
    return (_jsx("div", { id: id, className: className, style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: justifyContent[distribution],
            alignItems: alignItems[alignment],
            width: '100%',
            height: '100%'
        }, children: renderChildren() }));
};
//# sourceMappingURL=Column.js.map