import { jsx as _jsx } from "react/jsx-runtime";
export const Image = ({ id, className, source, alt = '', width, height }) => {
    return (_jsx("img", { id: id, className: className, src: source.uri, alt: alt, style: {
            width,
            height,
            objectFit: 'cover'
        } }));
};
//# sourceMappingURL=Image.js.map