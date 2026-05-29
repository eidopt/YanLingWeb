/* eslint-disable max-len */
import { compileLayoutStyle, toObjectLiteral } from './styleCompiler';
import { sanitizeInlineStyle } from '@shared/theme-layout/htmlSafety';
import type {
  ThemeLayoutNavigateAction,
  ThemeLayoutNode,
  ThemeLayoutNodeAction,
  ThemeLayoutTabInteraction,
} from 'ui/layout/types';

export interface CompileNodeContext {
  depth: number;
  controlledVisibilityNodeIds: ReadonlySet<string>;
  dataSourceIds: ReadonlySet<string>;
  needsAsyncDataBoundary: boolean;
  needsAsyncDataHelpers: boolean;
  needsHtmlBlock: boolean;
  needsInteractiveAlert: boolean;
  needsInteractiveCarousel: boolean;
  needsInteractiveDialog: boolean;
  needsInteractiveDrawer: boolean;
  needsInteractiveForm: boolean;
  needsInteractivePagination: boolean;
  needsInteractiveRate: boolean;
  needsInteractiveSwitch: boolean;
  needsInteractiveTabs: boolean;
  needsUnsupportedNode: boolean;
  needsStaticWidget: boolean;
}

export interface CompileNodeOptions {
  controlledVisibilityNodeIds?: ReadonlySet<string>;
  dataSourceIds?: ReadonlySet<string>;
}

export interface CompiledNode {
  code: string;
  needsAsyncDataBoundary: boolean;
  needsAsyncDataHelpers: boolean;
  needsHtmlBlock: boolean;
  needsInteractiveAlert: boolean;
  needsInteractiveCarousel: boolean;
  needsInteractiveDialog: boolean;
  needsInteractiveDrawer: boolean;
  needsInteractiveForm: boolean;
  needsInteractivePagination: boolean;
  needsInteractiveRate: boolean;
  needsInteractiveSwitch: boolean;
  needsInteractiveTabs: boolean;
  needsUnsupportedNode: boolean;
  needsStaticWidget: boolean;
}

export interface DataBinding {
  sourceId: string;
  select?: string;
  loadingText?: string;
  errorText?: string;
  emptyText?: string;
}

/**
 * Arguments passed to every per-alias case handler. `nextContext` carries the
 * merged flags from compiled children; `children` is the rendered child code.
 * `compileNodeInternal` is provided for the few handlers that recurse manually
 * (e.g. core.screen, which splits footer vs body children).
 */
export interface CaseArgs {
  node: ThemeLayoutNode;
  props: Record<string, unknown>;
  children: string;
  nextContext: CompileNodeContext;
  context: CompileNodeContext;
  className: string;
  compileNodeInternal: (node: ThemeLayoutNode, context: CompileNodeContext) => CompiledNode;
}

export type CaseHandler = (args: CaseArgs) => CompiledNode;

export const DATA_BINDING_ALIASES = new Set(['core.list', 'core.table', 'core.widget']);

export function indent(depth: number): string {
  return '  '.repeat(depth);
}

export function propString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function propNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function propStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function safeJsonExpression(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return 'null';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function attrs(attributes: (string | null | undefined)[]): string {
  return attributes.filter(Boolean).join(' ');
}

export function styleAttr(
  node: ThemeLayoutNode,
  extraStyle: Record<string, string | number | undefined> = {},
): string | null {
  const style = compileLayoutStyle(node.layout, node.frame);
  const inlineStyle = sanitizeInlineStyle(node.props?.style);
  Object.entries(inlineStyle).forEach(([key, value]) => {
    style[key] = value;
  });
  Object.entries(extraStyle).forEach(([key, value]) => {
    if (value !== undefined) {
      style[key] = value;
    }
  });
  return Object.keys(style).length ? `style={${toObjectLiteral(style)}}` : null;
}

export function interactionActionAttr(action: ThemeLayoutNodeAction | undefined, attribute = 'onClick'): string | null {
  if (!action) {
    return null;
  }
  if (action.type === 'navigate' && typeof action.targetPageId === 'string') {
    return `${attribute}={() => onNavigate(${JSON.stringify(action.targetPageId)})}`;
  }
  if (action.type === 'setVisibility' && typeof action.targetNodeId === 'string') {
    return `${attribute}={() => setNodeVisibility(${JSON.stringify(action.targetNodeId)}, ${JSON.stringify(
      Boolean(action.visible),
    )})}`;
  }
  if (action.type === 'toggleVisibility' && typeof action.targetNodeId === 'string') {
    return `${attribute}={() => toggleNodeVisibility(${JSON.stringify(action.targetNodeId)})}`;
  }
  return null;
}

export function visibilityControlAttrs(
  context: CompileNodeContext,
  node: ThemeLayoutNode,
  initialVisible: boolean,
): string[] {
  if (!context.controlledVisibilityNodeIds.has(node.id)) {
    return [` initialVisible={${JSON.stringify(initialVisible)}}`];
  }
  return [
    ` visible={visibleNodes[${JSON.stringify(node.id)}] ?? ${JSON.stringify(initialVisible)}}`,
    ` onVisibleChange={(nextVisible) => setNodeVisibility(${JSON.stringify(node.id)}, nextVisible)}`,
  ];
}

export function readDataBinding(node: ThemeLayoutNode, context: CompileNodeContext): DataBinding | null {
  if (!DATA_BINDING_ALIASES.has(node.alias) || !isRecord(node.props?.dataBinding)) {
    return null;
  }
  const binding = node.props.dataBinding;
  if (typeof binding.sourceId !== 'string' || !context.dataSourceIds.has(binding.sourceId)) {
    return null;
  }
  return {
    sourceId: binding.sourceId,
    select: typeof binding.select === 'string' ? binding.select : undefined,
    loadingText: typeof binding.loadingText === 'string' ? binding.loadingText : undefined,
    errorText: typeof binding.errorText === 'string' ? binding.errorText : undefined,
    emptyText: typeof binding.emptyText === 'string' ? binding.emptyText : undefined,
  };
}

export function hasUnsupportedDataBinding(node: ThemeLayoutNode, context: CompileNodeContext): boolean {
  if (!isRecord(node.props?.dataBinding) || DATA_BINDING_ALIASES.has(node.alias)) {
    return false;
  }
  const sourceId = node.props.dataBinding.sourceId;
  return typeof sourceId === 'string' && context.dataSourceIds.has(sourceId);
}

export function withUnsupportedDataBindingComment(
  node: ThemeLayoutNode,
  context: CompileNodeContext,
  code: string,
): string {
  if (!hasUnsupportedDataBinding(node, context)) {
    return code;
  }
  return [
    `${indent(context.depth)}{/* dataBinding ignored: ${node.alias} does not support async source export binding yet. */}`,
    code,
  ].join('\n');
}

export function wrapAsyncDataBoundary(context: CompileNodeContext, binding: DataBinding, content: string): string {
  const boundaryAttrs = [
    `sourceId=${JSON.stringify(binding.sourceId)}`,
    binding.select ? `selector=${JSON.stringify(binding.select)}` : '',
    binding.loadingText ? `loadingText=${JSON.stringify(binding.loadingText)}` : '',
    binding.errorText ? `errorText=${JSON.stringify(binding.errorText)}` : '',
    binding.emptyText ? `emptyText=${JSON.stringify(binding.emptyText)}` : '',
  ].filter(Boolean);
  return [
    `${indent(context.depth)}<AsyncDataBoundary ${boundaryAttrs.join(' ')}>`,
    `${indent(context.depth + 1)}{(data) => (`,
    content,
    `${indent(context.depth + 1)})}`,
    `${indent(context.depth)}</AsyncDataBoundary>`,
  ].join('\n');
}

function isNavigateAction(interaction: ThemeLayoutTabInteraction): interaction is ThemeLayoutNavigateAction {
  return 'type' in interaction && interaction.type === 'navigate';
}

export function tabNavigateTarget(interaction: ThemeLayoutTabInteraction | undefined, tab: string): string | null {
  if (!interaction) {
    return null;
  }
  const action: ThemeLayoutNavigateAction | undefined = isNavigateAction(interaction)
    ? interaction
    : (interaction as Record<string, ThemeLayoutNavigateAction | undefined>)[tab];
  return typeof action?.targetPageId === 'string' ? action.targetPageId : null;
}

export function clampPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export function spacerHeight(value: unknown): string {
  const size = propString(value, 'md');
  const sizeMap: Record<string, string> = {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  };
  return sizeMap[size] ?? size;
}

export function wrap(
  tag: string,
  className: string,
  node: ThemeLayoutNode,
  children: string,
  context: CompileNodeContext,
  extraAttrs: (string | null)[] = [],
  extraStyle: Record<string, string | number | undefined> = {},
): string {
  const open = attrs([
    `className="${className}"`,
    styleAttr(node, extraStyle),
    interactionActionAttr(node.interactions?.onClick),
    ...extraAttrs,
  ]);
  if (!children.trim()) {
    return `${indent(context.depth)}<${tag} ${open} />`;
  }
  return [`${indent(context.depth)}<${tag} ${open}>`, children, `${indent(context.depth)}</${tag}>`].join('\n');
}

export function mergeFlags(context: CompileNodeContext, child: CompiledNode): CompileNodeContext {
  return {
    ...context,
    needsAsyncDataBoundary: context.needsAsyncDataBoundary || child.needsAsyncDataBoundary,
    needsAsyncDataHelpers: context.needsAsyncDataHelpers || child.needsAsyncDataHelpers,
    needsHtmlBlock: context.needsHtmlBlock || child.needsHtmlBlock,
    needsInteractiveAlert: context.needsInteractiveAlert || child.needsInteractiveAlert,
    needsInteractiveCarousel: context.needsInteractiveCarousel || child.needsInteractiveCarousel,
    needsInteractiveDialog: context.needsInteractiveDialog || child.needsInteractiveDialog,
    needsInteractiveDrawer: context.needsInteractiveDrawer || child.needsInteractiveDrawer,
    needsInteractiveForm: context.needsInteractiveForm || child.needsInteractiveForm,
    needsInteractivePagination: context.needsInteractivePagination || child.needsInteractivePagination,
    needsInteractiveRate: context.needsInteractiveRate || child.needsInteractiveRate,
    needsInteractiveSwitch: context.needsInteractiveSwitch || child.needsInteractiveSwitch,
    needsInteractiveTabs: context.needsInteractiveTabs || child.needsInteractiveTabs,
    needsUnsupportedNode: context.needsUnsupportedNode || child.needsUnsupportedNode,
    needsStaticWidget: context.needsStaticWidget || child.needsStaticWidget,
  };
}

export function compileBoundList(
  node: ThemeLayoutNode,
  context: CompileNodeContext,
  props: Record<string, unknown>,
): string {
  const className = node.alias.replace('.', '-');
  const open = attrs([
    `className="${className}"`,
    styleAttr(node),
    `data-bordered={${JSON.stringify(Boolean(props.bordered))}}`,
    `data-split={${JSON.stringify(Boolean(props.split))}}`,
  ]);
  return [
    `${indent(context.depth + 2)}<div ${open}>`,
    `${indent(context.depth + 3)}{asRecordArray(data).map((item, itemIndex) => (`,
    `${indent(context.depth + 4)}<div className="core-list-item" key={itemIndex}>`,
    `${indent(context.depth + 5)}<div className="list-item-content">`,
    `${indent(context.depth + 6)}<span className="list-item-title">{readDisplayValue(item, 'title') || readDisplayValue(item, 'name') || \`Item \${itemIndex + 1}\`}</span>`,
    `${indent(context.depth + 6)}{readDisplayValue(item, 'description') && <span className="list-item-desc">{readDisplayValue(item, 'description')}</span>}`,
    `${indent(context.depth + 5)}</div>`,
    `${indent(context.depth + 5)}{readDisplayValue(item, 'note') && <span className="list-item-note">{readDisplayValue(item, 'note')}</span>}`,
    `${indent(context.depth + 4)}</div>`,
    `${indent(context.depth + 3)}))}`,
    `${indent(context.depth + 2)}</div>`,
  ].join('\n');
}

export function compileTable(
  node: ThemeLayoutNode,
  context: CompileNodeContext,
  props: Record<string, unknown>,
  dataExpression?: string,
): string {
  const className = node.alias.replace('.', '-');
  const columns = Array.isArray(props.columns) ? (props.columns as Record<string, unknown>[]) : [];
  const data = Array.isArray(props.data) ? (props.data as Record<string, unknown>[]) : [];
  const bordered = Boolean(props.bordered);
  const stripe = Boolean(props.stripe);
  const style = styleAttr(node);
  const ths = columns
    .map((col) => {
      const width = propString(col.width);
      return `${indent(context.depth + 2)}<th${width ? ` style={{ width: '${width}' }}` : ''}>{${JSON.stringify(propString(col.title))}}</th>`;
    })
    .join('\n');
  const body = dataExpression
    ? [
        `${indent(context.depth + 2)}{asRecordArray(${dataExpression}).map((row, rowIndex) => (`,
        `${indent(context.depth + 3)}<tr key={rowIndex}>`,
        columns
          .map(
            (col) =>
              `${indent(context.depth + 4)}<td>{readDisplayValue(row, ${JSON.stringify(propString(col.key))})}</td>`,
          )
          .join('\n'),
        `${indent(context.depth + 3)}</tr>`,
        `${indent(context.depth + 2)}))}`,
      ].join('\n')
    : data
        .map((row) => {
          const tds = columns
            .map((col) => `${indent(context.depth + 3)}<td>{${JSON.stringify(row[propString(col.key)] ?? '')}}</td>`)
            .join('\n');
          return `${indent(context.depth + 2)}<tr>\n${tds}\n${indent(context.depth + 2)}</tr>`;
        })
        .join('\n');
  return `${indent(context.depth)}<table className="${className}" data-bordered={${JSON.stringify(bordered)}} data-stripe={${JSON.stringify(stripe)}}${style ? ` ${style}` : ''}>\n${indent(context.depth + 1)}<thead>\n${indent(context.depth + 2)}<tr>\n${ths}\n${indent(context.depth + 2)}</tr>\n${indent(context.depth + 1)}</thead>\n${indent(context.depth + 1)}<tbody>\n${body}\n${indent(context.depth + 1)}</tbody>\n${indent(context.depth)}</table>`;
}
