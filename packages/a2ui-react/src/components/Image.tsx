import React, { type CSSProperties } from 'react';
import { mergeComponentStyles } from './mergeComponentStyles';

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
  /** 协议可选：根节点（img 或占位 div）额外 inline 样式 */
  styles?: CSSProperties;
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
      return { width: 24, height: 24, flexShrink: 0 };
    case 'avatar':
      // 必须给固定尺寸：加载失败时的灰底 div 仅有 borderRadius 会塌成 0×0；flex 行内也需 flexShrink:0
      return {
        width: 48,
        height: 48,
        borderRadius: '50%',
        overflow: 'hidden',
        flexShrink: 0
      };
    case 'smallFeature':
      return { maxWidth: 120, maxHeight: 120, flexShrink: 0 };
    case 'mediumFeature':
      return { maxWidth: 240, maxHeight: 240, flexShrink: 0 };
    case 'largeFeature':
      return { maxWidth: 480, maxHeight: 480, flexShrink: 0 };
    case 'header':
      return { width: '100%', maxHeight: 200, flexShrink: 0 };
    default:
      return {};
  }
}

const PLACEHOLDER_BG = '#e5e7eb';

export const Image: React.FC<ImageProps> = ({
  id,
  className,
  url,
  source,
  fit = 'cover',
  usageHint,
  alt = '',
  width,
  height,
  styles
}) => {
  const src = resolveImgSrc(url, source);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    setLoadError(false);
  }, [src]);

  const dimensionStyle: React.CSSProperties = mergeComponentStyles(
    {
      ...usageHintStyle(usageHint),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {})
    },
    styles
  );

  const showPlaceholder = !src || loadError;

  if (showPlaceholder) {
    return (
      <div
        id={id}
        className={className}
        role="img"
        aria-label={alt || undefined}
        style={{
          ...dimensionStyle,
          backgroundColor: PLACEHOLDER_BG,
          boxSizing: 'border-box'
        }}
      />
    );
  }

  return (
    <img
      id={id}
      className={className}
      src={src}
      alt={alt}
      onError={() => setLoadError(true)}
      style={{
        objectFit: fit,
        ...dimensionStyle
      }}
    />
  );
};
