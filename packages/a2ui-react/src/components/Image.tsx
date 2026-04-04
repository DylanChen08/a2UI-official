import React from 'react';

/** 与 docs/catalog_definition.json 中 Image.url 一致：literalString 或 path（path 由 parser 解析为 string 后传入） */
export type ImageUrlBound = {
  literalString?: string;
  path?: string;
};

export interface ImageProps {
  id?: string;
  className?: string;
  /** 协议：url 为 literalString/path；经 a2ui-core parser 解析后多为已解析的 string */
  url?: string | ImageUrlBound;
  /** @deprecated 兼容旧 mock（source.uri），优先使用 url */
  source?: { uri: string };
  fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  usageHint?: 'icon' | 'avatar' | 'smallFeature' | 'mediumFeature' | 'largeFeature' | 'header';
  alt?: string;
  width?: number | string;
  height?: number | string;
  hasMounted?: boolean;
  onMountComplete?: (componentId: string) => void;
}

function resolveImgSrc(url: ImageProps['url'], source: ImageProps['source']): string {
  if (typeof url === 'string') return url;
  if (url && typeof url === 'object' && !Array.isArray(url)) {
    if (url.literalString !== undefined) return url.literalString;
    return '';
  }
  if (source?.uri) return source.uri;
  return '';
}

/** 仅补充与协议 usageHint 相关的展示，不替代显式 width/height/fit */
function usageHintStyle(hint: ImageProps['usageHint']): React.CSSProperties {
  switch (hint) {
    case 'icon':
      return { width: 24, height: 24 };
    case 'avatar':
      return { borderRadius: '50%' };
    case 'smallFeature':
      return { maxWidth: 120, maxHeight: 120 };
    case 'mediumFeature':
      return { maxWidth: 240, maxHeight: 240 };
    case 'largeFeature':
      return { maxWidth: 480, maxHeight: 480 };
    case 'header':
      return { width: '100%', maxHeight: 200 };
    default:
      return {};
  }
}

export const Image: React.FC<ImageProps> = ({
  id,
  className,
  url,
  source,
  fit = 'cover',
  usageHint,
  alt = '',
  width,
  height
}) => {
  const src = resolveImgSrc(url, source);

  return (
    <img
      id={id}
      className={className}
      src={src || undefined}
      alt={alt}
      style={{
        objectFit: fit,
        ...usageHintStyle(usageHint),
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {})
      }}
    />
  );
};
