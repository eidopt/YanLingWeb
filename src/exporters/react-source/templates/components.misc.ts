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

export function generateStaticWidgetComponent(): string {
  return `interface StaticWidgetProps {
  id: string;
  library?: string;
  renderer?: string;
  data?: unknown;
}

interface WidgetBar {
  label: string;
  value: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  const child = value[key];
  return isRecord(child) ? child : null;
}

function readArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }
  const child = value[key];
  return Array.isArray(child) ? child : [];
}

function readString(value: unknown, key: string): string {
  return isRecord(value) && typeof value[key] === 'string' ? value[key] : '';
}

function normalizeChartData(data: unknown): WidgetBar[] {
  const root = readRecord(data, 'option') ?? readRecord(data, 'config') ?? (isRecord(data) ? data : null);
  if (!root) {
    return [];
  }

  const chartData = readRecord(root, 'data');
  const labels = chartData ? readArray(chartData, 'labels') : readArray(readRecord(root, 'xAxis'), 'data');
  const datasets = chartData ? readArray(chartData, 'datasets') : readArray(root, 'series');
  const firstDataset = datasets.find(isRecord);
  const values = firstDataset ? readArray(firstDataset, 'data') : [];

  return values
    .map((item, index): WidgetBar | null => {
      const value = typeof item === 'number'
        ? item
        : isRecord(item) && typeof item.value === 'number'
          ? item.value
          : null;
      if (value === null || !Number.isFinite(value)) {
        return null;
      }
      const labelValue = labels[index];
      const objectName = isRecord(item) && typeof item.name === 'string' ? item.name : '';
      const label = typeof labelValue === 'string' ? labelValue : objectName || \`Item \${index + 1}\`;
      return { label, value };
    })
    .filter((item): item is WidgetBar => item !== null)
    .slice(0, 8);
}

function renderChartPreview(bars: WidgetBar[]) {
  const max = Math.max(...bars.map((bar) => Math.abs(bar.value)), 1);
  return (
    <div className="staticWidgetBars">
      {bars.map((bar) => (
        <div className="staticWidgetBar" key={bar.label}>
          <span>{bar.label}</span>
          <div>
            <i style={{ width: \`\${Math.max(4, Math.round((Math.abs(bar.value) / max) * 100))}%\` }} />
          </div>
          <strong>{bar.value}</strong>
        </div>
      ))}
    </div>
  );
}

function renderTextPreview(renderer: string, data: unknown) {
  const definition = readString(data, 'definition') || readString(data, 'diagram');
  if (definition) {
    return <pre>{definition}</pre>;
  }
  if (renderer === 'lottie') {
    return <p>Lottie animation data exported as a static preview.</p>;
  }
  return <pre>{JSON.stringify(data ?? {}, null, 2).slice(0, 1200)}</pre>;
}

export function StaticWidget({ id, library = '', renderer = '', data }: StaticWidgetProps) {
  const bars = normalizeChartData(data);
  return (
    <div
      className="staticWidget"
      data-node-id={id}
      data-widget-library={library || undefined}
      data-widget-renderer={renderer || undefined}
    >
      <div className="staticWidgetHeader">
        <span>{renderer || library || 'widget'}</span>
        <small>Static export</small>
      </div>
      {bars.length > 0 ? renderChartPreview(bars) : renderTextPreview(renderer, data)}
    </div>
  );
}
`;
}

export function generateAsyncDataBoundaryComponent(): string {
  return `import type { ReactNode } from 'react';

import { useExportedData } from '../data/useExportedData';

interface AsyncDataBoundaryProps {
  children: (data: unknown) => ReactNode;
  emptyText?: string;
  errorText?: string;
  loadingText?: string;
  selector?: string;
  sourceId: string;
}

function isEmptyData(value: unknown): boolean {
  return value == null || (Array.isArray(value) && value.length === 0);
}

export function AsyncDataBoundary({
  children,
  emptyText = 'No data available.',
  errorText = 'Unable to load data.',
  loadingText = 'Loading data...',
  selector,
  sourceId,
}: AsyncDataBoundaryProps) {
  const result = useExportedData(sourceId, selector);

  if (result.loading) {
    return <p className="async-data-status" role="status">{loadingText}</p>;
  }
  if (result.error && isEmptyData(result.data)) {
    return <p className="async-data-error" role="alert">{errorText}</p>;
  }
  if (isEmptyData(result.data)) {
    return <p className="async-data-empty">{emptyText}</p>;
  }
  return <>{children(result.data)}</>;
}
`;
}
