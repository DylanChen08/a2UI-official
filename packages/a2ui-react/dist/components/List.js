import { jsx as _jsx } from "react/jsx-runtime";
export const List = ({ id, className, children, direction = 'vertical', alignment = 'start' }) => {
    const flexDirection = direction === 'horizontal' ? 'row' : 'column';
    const alignItems = {
        start: 'flex-start',
        center: 'center',
        end: 'flex-end',
        stretch: 'stretch'
    };
    const renderChildren = () => {
        if (Array.isArray(children)) {
            return children;
        }
        return children;
    };
    return (_jsx("div", { id: id, className: className, style: {
            display: 'flex',
            flexDirection,
            alignItems: alignItems[alignment],
            width: '100%',
            height: '100%'
        }, children: renderChildren() }));
};
//# sourceMappingURL=List.js.map