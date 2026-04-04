import React from 'react';

/** 与 docs/catalog_definition.json 中 Icon.name 一致（literalString / path）；parser 通常会解析为 string */
export type IconNameBound = { literalString?: string; path?: string };

export interface IconProps {
  id?: string;
  className?: string;
  name: string | IconNameBound;
  size?: number;
  color?: string;
  hasMounted?: boolean;
  onMountComplete?: (componentId: string) => void;
}

function resolveIconName(name: IconProps['name']): string {
  if (typeof name === 'string') return name;
  if (name && typeof name === 'object') {
    return name.literalString ?? name.path ?? '';
  }
  return '';
}

export const Icon: React.FC<IconProps> = ({
  id,
  className,
  name,
  size = 24,
  color = '#000'
}) => {
  const displayName = resolveIconName(name);
  return (
    <div
      id={id}
      className={className}
      style={{
        fontSize: `${size}px`,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {displayName}
    </div>
  );
};
