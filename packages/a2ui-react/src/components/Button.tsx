import React, { type CSSProperties } from 'react';
import { mergeComponentStyles } from './mergeComponentStyles';
import type { DataModelUpdatePayload } from 'a2ui-core';

/** Client-side open URL; mirrors optional userAction.openLink for transport. */
export interface OpenLinkSpec {
  url: string;
  target?: '_blank' | '_self' | '_parent' | '_top';
}

export interface ButtonAction {
  name: string;
  context?: Record<string, unknown>;
  localDataModelUpdate?: DataModelUpdatePayload;
  /** Open in the browser (new tab by default). Host injects handler via createRenderMap. */
  openLink?: OpenLinkSpec;
}

export interface ButtonProps {
  id?: string;
  className?: string;
  /** 协议可内联文案；若用 child 引用子 Text，由 treeBuild 注入 children */
  text?: {
    literalString?: string;
    path?: string;
  };
  /** 协议字段，仅声明用；树组装前由 parser 去掉，勿依赖 */
  child?: string;
  /** 协议常用 primary；与 variant 二选一时可由 primary 推导 */
  primary?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  hasMounted?: boolean;
  onMountComplete?: (componentId: string) => void;
  action?: ButtonAction;
  children?: React.ReactNode;
  /** Injected by createRenderMap when local action options are provided. */
  onLocalDataModelUpdate?: (payload: DataModelUpdatePayload) => void;
  /** Injected when createRenderMap provides openExternalLink. */
  onOpenLink?: (spec: OpenLinkSpec) => void;
  /** 协议可选：button 根节点额外 inline 样式 */
  styles?: CSSProperties;
}

export const Button: React.FC<ButtonProps> = ({
  id,
  className,
  text,
  primary,
  variant: variantProp,
  size = 'medium',
  disabled = false,
  action,
  onLocalDataModelUpdate,
  onOpenLink,
  children,
  styles
}) => {
  const variant =
    variantProp ??
    (primary === true ? 'primary' : primary === false ? 'secondary' : 'outline');
  const displayText = text?.literalString || text?.path || '';

  debugger;
  const variantStyles: Record<string, React.CSSProperties> = {
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

  const sizeStyles: Record<string, React.CSSProperties> = {
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
    if (disabled) return;
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

  return (
    <button
      id={id}
      className={className}
      type="button"
      disabled={disabled}
      onClick={handleClick}
      style={mergeComponentStyles(
        {
          ...variantStyles[variant],
          ...sizeStyles[size],
          borderRadius: '4px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1
        },
        styles
      )}
    >
      {children != null && children !== false ? children : displayText}
    </button>
  );
};
