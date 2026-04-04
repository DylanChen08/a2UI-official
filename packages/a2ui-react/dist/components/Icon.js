import { jsx as _jsx } from "react/jsx-runtime";
export const Icon = ({ id, className, name, size = 24, color = '#000' }) => {
    // 这里使用简单的文字作为图标，实际项目中可以使用图标库
    return (_jsx("div", { id: id, className: className, style: {
            fontSize: `${size}px`,
            color,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
        }, children: name }));
};
//# sourceMappingURL=Icon.js.map