import { jsx as _jsx } from "react/jsx-runtime";
export const Text = ({ id, className, text, usageHint = 'body' }) => {
    const displayText = text.literalString || text.path || '';
    const styleMap = {
        h1: {
            fontSize: '2rem',
            fontWeight: 'bold',
            margin: '0.5rem 0'
        },
        h2: {
            fontSize: '1.5rem',
            fontWeight: 'bold',
            margin: '0.5rem 0'
        },
        h3: {
            fontSize: '1.25rem',
            fontWeight: 'bold',
            margin: '0.5rem 0'
        },
        h4: {
            fontSize: '1rem',
            fontWeight: 'bold',
            margin: '0.5rem 0'
        },
        h5: {
            fontSize: '0.875rem',
            fontWeight: 'bold',
            margin: '0.5rem 0'
        },
        caption: {
            fontSize: '0.75rem',
            color: '#666',
            margin: '0.25rem 0'
        },
        body: {
            fontSize: '1rem',
            margin: '0.5rem 0'
        }
    };
    return (_jsx("div", { id: id, className: className, style: {
            ...styleMap[usageHint]
        }, children: displayText }));
};
//# sourceMappingURL=Text.js.map