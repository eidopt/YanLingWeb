/* eslint-disable max-len */
import {
  type CaseHandler,
  clampPercent,
  compileBoundList,
  compileTable,
  indent,
  interactionActionAttr,
  propNumber,
  propString,
  readDataBinding,
  spacerHeight,
  styleAttr,
  withUnsupportedDataBindingComment,
  wrap,
  wrapAsyncDataBoundary,
} from './compileNode.shared';
import { toObjectLiteral } from './styleCompiler';

const compileText: CaseHandler = ({ node, props, nextContext, context }) => {
  const variant = propString(props.variant, 'body');
  const tag = variant === 'display' || variant === 'heading' ? 'h2' : 'p';
  const style = styleAttr(node);
  return {
    ...nextContext,
    code: withUnsupportedDataBindingComment(
      node,
      context,
      [
        `${indent(context.depth)}<${tag} className="core-text ${variant}"`,
        style ? ` ${style}` : '',
        `>{${JSON.stringify(propString(props.text))}}</${tag}>`,
      ].join(''),
    ),
  };
};

const compileTag: CaseHandler = ({ node, props, nextContext, context }) => {
  const style = styleAttr(node);
  return {
    ...nextContext,
    code: [
      `${indent(context.depth)}<span className="core-tag"`,
      ` data-tone=${JSON.stringify(propString(props.tone, 'neutral'))}`,
      style ? ` ${style}` : '',
      `>{${JSON.stringify(propString(props.label))}}</span>`,
    ].join(''),
  };
};

const compileNotice: CaseHandler = ({ node, props, nextContext, context }) => {
  const style = styleAttr(node);
  const tone = propString(props.tone) || propString(props.variant, 'info');
  return {
    ...nextContext,
    code: [
      `${indent(context.depth)}<aside className="core-notice"`,
      ` data-tone=${JSON.stringify(tone)}`,
      style ? ` ${style}` : '',
      `>{${JSON.stringify(propString(props.text))}}</aside>`,
    ].join(''),
  };
};

const compileProgress: CaseHandler = ({ node, props, nextContext, context }) => {
  const value = propNumber(props.value, 0);
  const max = propNumber(props.max, 100);
  const percent = clampPercent(value, max);
  const style = styleAttr(node);
  return {
    ...nextContext,
    code: [
      `${indent(context.depth)}<div className="core-progress"`,
      ` data-tone=${JSON.stringify(propString(props.tone, 'accent'))}`,
      ' role="progressbar"',
      ' aria-valuemin={0}',
      ` aria-valuemax={${JSON.stringify(max)}}`,
      ` aria-valuenow={${JSON.stringify(Math.min(max, Math.max(0, value)))}}`,
      style ? ` ${style}` : '',
      '>',
      `<span style={${toObjectLiteral({ width: `${percent}%` })}} />`,
      '</div>',
    ].join(''),
  };
};

const compileDivider: CaseHandler = ({ node, nextContext, context }) => {
  const style = styleAttr(node);
  return {
    ...nextContext,
    code: `${indent(context.depth)}<hr className="core-divider"${style ? ` ${style}` : ''} />`,
  };
};

const compileSpacer: CaseHandler = ({ node, props, nextContext, context }) => {
  const style = styleAttr(node, { minHeight: spacerHeight(props.size) });
  return {
    ...nextContext,
    code: [
      `${indent(context.depth)}<div className="core-spacer"`,
      style ? ` ${style}` : '',
      ' aria-hidden="true" />',
    ].join(''),
  };
};

const compileBadge: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const count = propNumber(props.count, 0);
  const max = propNumber(props.max, 99);
  const dot = Boolean(props.dot);
  const text = propString(props.text);
  const tone = propString(props.tone, 'error');
  const display = dot ? '' : text || (count > max ? `${max}+` : String(count));
  const style = styleAttr(node);
  return {
    ...nextContext,
    code: `${indent(context.depth)}<span className="${className}" data-tone="${tone}" data-dot={${JSON.stringify(dot)}}${style ? ` ${style}` : ''}>${display ? `{${JSON.stringify(display)}}` : ''}</span>`,
  };
};

const compileList: CaseHandler = ({ node, props, children, nextContext, context, className }) => {
  const binding = readDataBinding(node, context);
  if (binding) {
    return {
      ...nextContext,
      needsAsyncDataBoundary: true,
      needsAsyncDataHelpers: true,
      code: wrapAsyncDataBoundary(context, binding, compileBoundList(node, context, props)),
    };
  }
  return {
    ...nextContext,
    code: withUnsupportedDataBindingComment(
      node,
      context,
      wrap('div', className, node, children, context, [
        `data-bordered={${JSON.stringify(Boolean(props.bordered))}}`,
        `data-split={${JSON.stringify(Boolean(props.split))}}`,
      ]),
    ),
  };
};

const compileListItem: CaseHandler = ({ node, props, children, nextContext, context, className }) => {
  const title = propString(props.title);
  const desc = propString(props.description);
  const note = propString(props.note);
  const arrow = Boolean(props.arrow);
  const thumb = propString(props.thumb);
  const parts: string[] = [];
  if (thumb) {
    parts.push(`${indent(context.depth + 1)}<img className="list-item-thumb" src=${JSON.stringify(thumb)} alt="" />`);
  }
  parts.push(`${indent(context.depth + 1)}<div className="list-item-content">`);
  if (title) {
    parts.push(`${indent(context.depth + 2)}<span className="list-item-title">{${JSON.stringify(title)}}</span>`);
  }
  if (desc) {
    parts.push(`${indent(context.depth + 2)}<span className="list-item-desc">{${JSON.stringify(desc)}}</span>`);
  }
  parts.push(`${indent(context.depth + 1)}</div>`);
  if (note) {
    parts.push(`${indent(context.depth + 1)}<span className="list-item-note">{${JSON.stringify(note)}}</span>`);
  }
  if (arrow) {
    parts.push(`${indent(context.depth + 1)}<span className="list-item-arrow" aria-hidden="true">›</span>`);
  }
  if (children) {
    parts.push(children);
  }
  return { ...nextContext, code: wrap('div', className, node, parts.join('\n'), context) };
};

const compileStatistic: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const title = propString(props.title);
  const value = propString(props.value);
  const prefix = propString(props.prefix);
  const suffix = propString(props.suffix);
  const trend = propString(props.trend, 'neutral');
  const tone = propString(props.tone, 'neutral');
  const style = styleAttr(node);
  const parts: string[] = [];
  if (title) {
    parts.push(`${indent(context.depth + 1)}<span className="stat-title">{${JSON.stringify(title)}}</span>`);
  }
  parts.push(`${indent(context.depth + 1)}<span className="stat-value" data-tone="${tone}" data-trend="${trend}">`);
  if (prefix) {
    parts.push(`${indent(context.depth + 2)}<span className="stat-prefix">{${JSON.stringify(prefix)}}</span>`);
  }
  parts.push(`${indent(context.depth + 2)}{${JSON.stringify(value)}}`);
  if (suffix) {
    parts.push(`${indent(context.depth + 2)}<span className="stat-suffix">{${JSON.stringify(suffix)}}</span>`);
  }
  parts.push(`${indent(context.depth + 1)}</span>`);
  return {
    ...nextContext,
    code: `${indent(context.depth)}<div className="${className}"${style ? ` ${style}` : ''}>\n${parts.join('\n')}\n${indent(context.depth)}</div>`,
  };
};

const compileEmpty: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const text = propString(props.text, '暂无数据');
  const image = propString(props.image);
  const actionLabel = propString(props.actionLabel);
  const style = styleAttr(node);
  const parts: string[] = [];
  if (image) {
    parts.push(`${indent(context.depth + 1)}<img className="empty-image" src=${JSON.stringify(image)} alt="" />`);
  }
  parts.push(`${indent(context.depth + 1)}<p className="empty-text">{${JSON.stringify(text)}}</p>`);
  if (actionLabel) {
    const actionAttr = interactionActionAttr(node.interactions?.onActionClick);
    parts.push(
      `${indent(context.depth + 1)}<button type="button" className="empty-action"${
        actionAttr ? ` ${actionAttr}` : ''
      }>{${JSON.stringify(actionLabel)}}</button>`,
    );
  }
  return {
    ...nextContext,
    code: `${indent(context.depth)}<div className="${className}"${style ? ` ${style}` : ''}>\n${parts.join('\n')}\n${indent(context.depth)}</div>`,
  };
};

const compileSkeleton: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const rows = propNumber(props.rows, 3);
  const animated = props.animated !== false;
  const style = styleAttr(node);
  const bars: string[] = [];
  for (let i = 0; i < rows; i++) {
    bars.push(
      `${indent(context.depth + 1)}<div className="skeleton-line" style={{ width: '${60 + (i % 3) * 15}%' }} />`,
    );
  }
  return {
    ...nextContext,
    code: `${indent(context.depth)}<div className="${className}" data-animated={${JSON.stringify(animated)}}${style ? ` ${style}` : ''}>\n${bars.join('\n')}\n${indent(context.depth)}</div>`,
  };
};

const compileTooltip: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const text = propString(props.text);
  const placement = propString(props.placement, 'top');
  const style = styleAttr(node);
  return {
    ...nextContext,
    code: `${indent(context.depth)}<span className="${className}" data-tooltip=${JSON.stringify(text)} data-placement="${placement}"${style ? ` ${style}` : ''}>{${JSON.stringify(text)}}</span>`,
  };
};

const compileToast: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const message = propString(props.message);
  const type = propString(props.type, 'info');
  const style = styleAttr(node);
  return {
    ...nextContext,
    code: `${indent(context.depth)}<div className="${className}" data-type="${type}" role="alert"${style ? ` ${style}` : ''}>{${JSON.stringify(message)}}</div>`,
  };
};

const compileAlert: CaseHandler = ({ node, props, nextContext, context }) => {
  const text = propString(props.text);
  const type = propString(props.type, 'info');
  const closable = Boolean(props.closable);
  const style = styleAttr(node);
  return {
    ...nextContext,
    needsInteractiveAlert: true,
    code: [
      `${indent(context.depth)}<InteractiveAlert`,
      ` text=${JSON.stringify(text)}`,
      ` type=${JSON.stringify(type)}`,
      ` closable={${JSON.stringify(closable)}}`,
      style ? ` ${style}` : '',
      ' />',
    ].join(''),
  };
};

const compileLoading: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const text = propString(props.text);
  const type = propString(props.type, 'spinner');
  const size = propString(props.size, 'medium');
  const style = styleAttr(node);
  if (type === 'skeleton') {
    return {
      ...nextContext,
      code: `${indent(context.depth)}<div className="${className}" data-type="skeleton" data-size="${size}"${style ? ` ${style}` : ''}><div className="skeleton-line" /><div className="skeleton-line" /><div className="skeleton-line" /></div>`,
    };
  }
  return {
    ...nextContext,
    code: `${indent(context.depth)}<div className="${className}" data-type="spinner" data-size="${size}"${style ? ` ${style}` : ''}><span className="spinner" />${text ? `<span>{${JSON.stringify(text)}}</span>` : ''}</div>`,
  };
};

const compileTableNode: CaseHandler = ({ node, props, nextContext, context }) => {
  const binding = readDataBinding(node, context);
  if (binding) {
    return {
      ...nextContext,
      needsAsyncDataBoundary: true,
      needsAsyncDataHelpers: true,
      code: wrapAsyncDataBoundary(
        context,
        binding,
        compileTable(node, { ...context, depth: context.depth + 2 }, props, 'data'),
      ),
    };
  }
  return {
    ...nextContext,
    code: withUnsupportedDataBindingComment(node, context, compileTable(node, context, props)),
  };
};

export const dataHandlers: Record<string, CaseHandler> = {
  'core.text': compileText,
  'core.tag': compileTag,
  'core.notice': compileNotice,
  'core.progress': compileProgress,
  'core.divider': compileDivider,
  'core.spacer': compileSpacer,
  'core.badge': compileBadge,
  'core.list': compileList,
  'core.list-item': compileListItem,
  'core.statistic': compileStatistic,
  'core.empty': compileEmpty,
  'core.skeleton': compileSkeleton,
  'core.tooltip': compileTooltip,
  'core.toast': compileToast,
  'core.alert': compileAlert,
  'core.loading': compileLoading,
  'core.table': compileTableNode,
};
