export function generateHtmlBlockComponent(): string {
  return `import type { CSSProperties, ReactNode } from 'react';

const ALLOWED_TAGS = new Set([
  'div', 'span', 'section', 'article', 'aside', 'header', 'footer', 'main',
  'nav', 'ul', 'ol', 'li', 'figure', 'figcaption', 'p', 'h1', 'h2', 'h3',
  'h4', 'strong', 'em', 'label',
]);

interface HtmlBlockProps {
  tag: string;
  styleValue?: CSSProperties;
  children?: ReactNode;
}

export function HtmlBlock({ tag, styleValue, children }: HtmlBlockProps) {
  const TagName = (ALLOWED_TAGS.has(tag) ? tag : 'div') as keyof JSX.IntrinsicElements;
  return <TagName style={styleValue}>{children}</TagName>;
}
`;
}

export function generateUnsupportedNodeComponent(): string {
  return `interface UnsupportedNodeProps {
  alias: string;
  id: string;
}

export function UnsupportedNode({ alias, id }: UnsupportedNodeProps) {
  return (
    <div className="unsupportedNode" data-node-id={id}>
      Unsupported component: {alias}
    </div>
  );
}
`;
}

export function generateWidgetPlaceholderComponent(): string {
  return `interface WidgetPlaceholderProps {
  id: string;
}

export function WidgetPlaceholder({ id }: WidgetPlaceholderProps) {
  return (
    <div className="widgetPlaceholder" data-node-id={id}>
      {/* TODO: Replace this placeholder with a reviewed, sandboxed widget implementation. */}
      Widget placeholder
    </div>
  );
}
`;
}
