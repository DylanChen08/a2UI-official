import React from 'react';

export function normalizeReactChildren(children: React.ReactNode): React.ReactNode {
  if (children == null || typeof children === 'boolean') return undefined;
  if (Array.isArray(children)) {
    return children.map(normalizeReactChildren).filter((child) => child != null && child !== false);
  }
  if (
    typeof children === 'string' ||
    typeof children === 'number' ||
    React.isValidElement(children)
  ) {
    return children;
  }
  return undefined;
}
