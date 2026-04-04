import { jsx as _jsx } from "react/jsx-runtime";
export const Button = ({ id, className, text, variant = 'primary', size = 'medium', disabled = false, action, onLocalDataModelUpdate, onOpenLink }) => {
    const displayText = text?.literalString || text?.path || '';
    const variantStyles = {
        primary: {
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none'
        },
        secondary: {
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none'
        },
        outline: {
            backgroundColor: 'transparent',
            color: '#007bff',
            border: '1px solid #007bff'
        },
        text: {
            backgroundColor: 'transparent',
            color: '#007bff',
            border: 'none'
        }
    };
    const sizeStyles = {
        small: {
            padding: '4px 8px',
            fontSize: '0.875rem'
        },
        medium: {
            padding: '8px 16px',
            fontSize: '1rem'
        },
        large: {
            padding: '12px 24px',
            fontSize: '1.125rem'
        }
    };
    const handleClick = () => {
        if (disabled)
            return;
        if (action?.openLink?.url && onOpenLink) {
            onOpenLink({
                url: action.openLink.url,
                target: action.openLink.target
            });
        }
        if (action?.localDataModelUpdate && onLocalDataModelUpdate) {
            onLocalDataModelUpdate(action.localDataModelUpdate);
        }
    };
    return (_jsx("button", { id: id, className: className, type: "button", disabled: disabled, onClick: handleClick, style: {
            ...variantStyles[variant],
            ...sizeStyles[size],
            borderRadius: '4px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1
        }, children: displayText }));
};
//# sourceMappingURL=Button.js.map