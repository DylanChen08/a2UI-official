import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const Card = ({ id, className, children, title, subtitle, elevation = 2 }) => {
    const displayTitle = title?.literalString || title?.path || '';
    const displaySubtitle = subtitle?.literalString || subtitle?.path || '';
    return (_jsxs("div", { id: id, className: className, style: {
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: `0 ${elevation}px ${2 * elevation}px rgba(0, 0, 0, 0.1)`,
            padding: '16px',
            margin: '8px'
        }, children: [(displayTitle || displaySubtitle) && (_jsxs("div", { style: { marginBottom: '12px' }, children: [displayTitle && (_jsx("h3", { style: { margin: '0 0 4px 0' }, children: displayTitle })), displaySubtitle && (_jsx("p", { style: { margin: '4px 0 0 0', color: '#666', fontSize: '0.875rem' }, children: displaySubtitle }))] })), children] }));
};
//# sourceMappingURL=Card.js.map