import React from 'react';

export interface TextProps {
  id?: string;
  className?: string;
  text: {
    literalString?: string;
    path?: string;
  };
  usageHint?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'caption' | 'body';
  hasMounted?: boolean;
  onMountComplete?: (componentId: string) => void;
}

export const Text: React.FC<TextProps> = ({ 
  id, 
  className,
  text, 
  usageHint = 'body'
}) => {

  const displayText = text.literalString || text.path || '';

  const styleMap: Record<string, React.CSSProperties> = {
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

  return (
    <div 
      id={id} 
      className={className}
      style={{
        ...styleMap[usageHint]
      }}
    >
      {displayText}
    </div>
  );
};
