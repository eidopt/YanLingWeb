import { compileLayoutStyle, toObjectLiteral } from './styleCompiler';
import type {
  ThemeLayoutNavigateAction,
  ThemeLayoutNode,
  ThemeLayoutTabInteraction,
} from 'ui/layout/types';

interface CompileNodeContext {
  depth: number;
  needsHtmlBlock: boolean;
  needsUnsupportedNode: boolean;
  needsWidgetPlaceholder: boolean;
}

interface CompiledNode {
  code: string;
  needsHtmlBlock: boolean;
  needsUnsupportedNode: boolean;
  needsWidgetPlaceholder: boolean;
}

function indent(depth: number): string {
  return '  '.repeat(depth);
}

function propString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function propNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function propStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function attrs(attributes: (string | null | undefined)[]): string {
  return attributes.filter(Boolean).join(' ');
}

function styleAttr(
  node: ThemeLayoutNode,
  extraStyle: Record<string, string | number | undefined> = {},
): string | null {
  const style = compileLayoutStyle(node.layout, node.frame);
  const inlineStyle = (
    node.props?.style &&
    typeof node.props.style === 'object' &&
    !Array.isArray(node.props.style)
  )
    ? node.props.style as Record<string, unknown>
    : {};
  Object.entries(inlineStyle).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number') {
      style[key] = value;
    }
  });
  Object.entries(extraStyle).forEach(([key, value]) => {
    if (value !== undefined) {
      style[key] = value;
    }
  });
  return Object.keys(style).length ? `style={${toObjectLiteral(style)}}` : null;
}

function navigateAttr(action: ThemeLayoutNavigateAction | undefined): string | null {
  return typeof action?.targetPageId === 'string'
    ? `onClick={() => onNavigate(${JSON.stringify(action.targetPageId)})}`
    : null;
}

function isNavigateAction(
  interaction: ThemeLayoutTabInteraction,
): interaction is ThemeLayoutNavigateAction {
  return 'type' in interaction && interaction.type === 'navigate';
}

function tabNavigateTarget(
  interaction: ThemeLayoutTabInteraction | undefined,
  tab: string,
): string | null {
  if (!interaction) {
    return null;
  }
  const action: ThemeLayoutNavigateAction | undefined = isNavigateAction(interaction)
    ? interaction
    : (interaction as Record<string, ThemeLayoutNavigateAction | undefined>)[tab];
  return typeof action?.targetPageId === 'string' ? action.targetPageId : null;
}

function clampPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (value / max) * 100));
}

function spacerHeight(value: unknown): string {
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

function wrap(
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
    navigateAttr(node.interactions?.onClick),
    ...extraAttrs,
  ]);
  if (!children.trim()) {
    return `${indent(context.depth)}<${tag} ${open} />`;
  }
  return [
    `${indent(context.depth)}<${tag} ${open}>`,
    children,
    `${indent(context.depth)}</${tag}>`,
  ].join('\n');
}

function mergeFlags(
  context: CompileNodeContext,
  child: CompiledNode,
): CompileNodeContext {
  return {
    ...context,
    needsHtmlBlock: context.needsHtmlBlock || child.needsHtmlBlock,
    needsUnsupportedNode:
      context.needsUnsupportedNode || child.needsUnsupportedNode,
    needsWidgetPlaceholder:
      context.needsWidgetPlaceholder || child.needsWidgetPlaceholder,
  };
}

function compileChildren(
  node: ThemeLayoutNode,
  context: CompileNodeContext,
): { code: string; context: CompileNodeContext } {
  let nextContext = context;
  const code = (node.children ?? [])
    .map((child) => {
      const compiled = compileNodeInternal(child, {
        ...context,
        depth: context.depth + 1,
      });
      nextContext = mergeFlags(nextContext, compiled);
      return compiled.code;
    })
    .join('\n');
  return { code, context: nextContext };
}

function compileNodeInternal(
  node: ThemeLayoutNode,
  context: CompileNodeContext,
): CompiledNode {
  const props = node.props ?? {};
  const compiledChildren = compileChildren(node, context);
  const children = compiledChildren.code;
  const nextContext = compiledChildren.context;
  const className = node.alias.replace('.', '-');

  switch (node.alias) {
    case 'core.screen':
      {
        let screenContext = context;
        const surface = propString(props.surface);
        const chrome = propString(
          props.chrome,
          surface === 'web' ? 'none' : surface === 'mini-program' ? 'wechat' : 'app',
        );
        const isWebSurface = surface === 'web' || chrome === 'none';
        const bodyChildren: string[] = [];
        const footerChildren: string[] = [];
        for (const child of node.children ?? []) {
          const compiled = compileNodeInternal(child, {
            ...context,
            depth: context.depth + 2,
          });
          screenContext = mergeFlags(screenContext, compiled);
          if (child.slot === 'footer') {
            footerChildren.push(compiled.code);
          } else {
            bodyChildren.push(compiled.code);
          }
        }
        const open = attrs([
          `className=${JSON.stringify(isWebSurface ? 'screen screen-web' : 'screen')}`,
          navigateAttr(node.interactions?.onClick),
        ]);
        const statusAndHeader = isWebSurface
          ? []
          : [
              `${indent(context.depth + 1)}<div className="statusBar">`,
              [
                `${indent(context.depth + 2)}<span className="statusTime">`,
                `{${JSON.stringify(propString(props.statusTime, '9:41'))}}`,
                '</span>',
              ].join(''),
              `${indent(context.depth + 1)}</div>`,
              `${indent(context.depth + 1)}<header className="screenHeader">`,
              `${indent(context.depth + 2)}<span className="headerSpacer" aria-hidden="true" />`,
              [
                `${indent(context.depth + 2)}<h1>`,
                `{${JSON.stringify(propString(props.title, 'Untitled'))}}`,
                '</h1>',
              ].join(''),
              props.headerActionLabel
                ? [
                    `${indent(context.depth + 2)}<span className="headerAction">`,
                    `{${JSON.stringify(propString(props.headerActionLabel))}}`,
                    '</span>',
                  ].join('')
                : `${indent(context.depth + 2)}<span className="headerSpacer" aria-hidden="true" />`,
              `${indent(context.depth + 1)}</header>`,
            ];
      return {
        ...screenContext,
        code: [
          `${indent(context.depth)}<section ${open}>`,
          ...statusAndHeader,
          `${indent(context.depth + 1)}<div className="screenBody">`,
          bodyChildren.join('\n'),
          `${indent(context.depth + 1)}</div>`,
          footerChildren.length
            ? [
                `${indent(context.depth + 1)}<div className="screenFooter">`,
                footerChildren.join('\n'),
                `${indent(context.depth + 1)}</div>`,
              ].join('\n')
            : '',
          `${indent(context.depth)}</section>`,
        ].filter(Boolean).join('\n'),
      };
      }
    case 'core.panel':
      return {
        ...nextContext,
        code: wrap('div', className, node, children, context, [
          `data-tone=${JSON.stringify(propString(props.tone, 'default'))}`,
        ], {
          gap: `${propNumber(props.gap, 12)}px`,
        }),
      };
    case 'core.stack':
      return {
        ...nextContext,
        code: wrap('div', className, node, children, context, [], {
          gap: `${propNumber(props.gap, 12)}px`,
          alignItems: propString(props.alignItems) || undefined,
        }),
      };
    case 'core.row':
      return {
        ...nextContext,
        code: wrap('div', className, node, children, context, [
          `data-tone=${JSON.stringify(propString(props.tone, 'default'))}`,
        ], {
          gap: `${propNumber(props.gap, 12)}px`,
          flexWrap: props.wrap ? 'wrap' : 'nowrap',
          justifyContent: propString(props.justify) || undefined,
          alignItems: propString(props.align) || undefined,
        }),
      };
    case 'core.grid':
      return {
        ...nextContext,
        code: wrap('div', className, node, children, context, [], {
          gap: `${propNumber(props.gap, 12)}px`,
          gridTemplateColumns: `repeat(${propNumber(props.columns, 2)}, minmax(0, 1fr))`,
        }),
      };
    case 'core.text': {
      const variant = propString(props.variant, 'body');
      const tag = variant === 'display' || variant === 'heading' ? 'h2' : 'p';
      const style = styleAttr(node);
      return {
        ...nextContext,
        code: [
          `${indent(context.depth)}<${tag} className="core-text ${variant}"`,
          style ? ` ${style}` : '',
          `>{${JSON.stringify(propString(props.text))}}</${tag}>`,
        ].join(''),
      };
    }
    case 'core.button': {
      const label = propString(props.label) || propString(props.text, 'Button');
      const icon = propString(props.icon);
      const buttonAttrs = attrs([
        styleAttr(node),
        navigateAttr(node.interactions?.onClick),
        `data-variant=${JSON.stringify(propString(props.variant, 'primary'))}`,
        `data-active={${JSON.stringify(Boolean(props.active))}}`,
        props.disabled ? 'disabled' : null,
      ]);
      return {
        ...nextContext,
        code: [
          `${indent(context.depth)}<button type="button" className="core-button"`,
          buttonAttrs ? ` ${buttonAttrs}` : '',
          '>',
          icon ? `<span aria-hidden="true">{${JSON.stringify(icon)}}</span>` : '',
          `{${JSON.stringify(label)}}</button>`,
        ].join(''),
      };
    }
    case 'core.image': {
      const style = styleAttr(node);
      const src = propString(props.src);
      if (src) {
        return {
          ...nextContext,
          code: [
            `${indent(context.depth)}<img className="core-image"`,
            ` src=${JSON.stringify(src)}`,
            ` alt=${JSON.stringify(propString(props.alt))}`,
            props.title ? ` title=${JSON.stringify(propString(props.title))}` : '',
            ` data-fit=${JSON.stringify(propString(props.objectFit, 'cover'))}`,
            style ? ` ${style}` : '',
            ' />',
          ].join(''),
        };
      }
      return {
        ...nextContext,
        code: [
          `${indent(context.depth)}<div className="core-image"`,
          style ? ` ${style}` : '',
          ` aria-label=${JSON.stringify(propString(props.alt, 'Generated image placeholder'))} />`,
        ].join(''),
      };
    }
    case 'core.tabs': {
      const tabs = propStringArray(props.tabs);
      const activeTab = propString(props.activeTab, tabs[0] ?? '');
      const tabButtons = tabs.map((tab) => {
        const target = tabNavigateTarget(node.interactions?.onTabClick, tab);
        return [
          `${indent(context.depth + 1)}<button type="button"`,
          ` className={Object.is(${JSON.stringify(tab)}, `,
          `${JSON.stringify(activeTab)}) ? 'active' : ''}`,
          target ? ` onClick={() => onNavigate(${JSON.stringify(target)})}` : '',
          `>{${JSON.stringify(tab)}}</button>`,
        ].join('');
      }).join('\n');
      return {
        ...nextContext,
        code: wrap('nav', 'core-tabs', node, tabButtons, context),
      };
    }
    case 'core.search': {
      const style = styleAttr(node);
      return {
        ...nextContext,
        code: [
          `${indent(context.depth)}<input className="${className}"`,
          style ? ` ${style}` : '',
          ' type="search"',
          ` placeholder=${JSON.stringify(propString(props.placeholder))}`,
          props.value ? ` defaultValue=${JSON.stringify(propString(props.value))}` : '',
          ` aria-label=${JSON.stringify(propString(props.placeholder, 'Search'))} />`,
        ].join(''),
      };
    }
    case 'core.input': {
      const label = propString(props.label);
      const style = styleAttr(node);
      const input = [
        `<input className="core-input"`,
        label ? '' : style ? ` ${style}` : '',
        ` type=${JSON.stringify(propString(props.type, 'text'))}`,
        ` placeholder=${JSON.stringify(propString(props.placeholder))}`,
        props.value ? ` defaultValue=${JSON.stringify(propString(props.value))}` : '',
        props.disabled ? ' disabled' : '',
        ` aria-label=${JSON.stringify(propString(props.label) || propString(props.placeholder, 'Input'))} />`,
      ].join('');
      if (!label) {
        return {
          ...nextContext,
          code: `${indent(context.depth)}${input}`,
        };
      }
      return {
        ...nextContext,
        code: [
          `${indent(context.depth)}<label className="core-field"${style ? ` ${style}` : ''}>`,
          `${indent(context.depth + 1)}<span className="core-input-label">{${JSON.stringify(label)}}</span>`,
          `${indent(context.depth + 1)}${input}`,
          `${indent(context.depth)}</label>`,
        ].join('\n'),
      };
    }
    case 'core.tag': {
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
    }
    case 'core.notice': {
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
    }
    case 'core.progress': {
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
    }
    case 'core.divider': {
      const style = styleAttr(node);
      return {
        ...nextContext,
        code: `${indent(context.depth)}<hr className="core-divider"${style ? ` ${style}` : ''} />`,
      };
    }
    case 'core.spacer': {
      const style = styleAttr(node, { minHeight: spacerHeight(props.size) });
      return {
        ...nextContext,
        code: [
          `${indent(context.depth)}<div className="core-spacer"`,
          style ? ` ${style}` : '',
          ' aria-hidden="true" />',
        ].join(''),
      };
    }
    case 'core.html': {
      const childContent = children ? `\n${children}\n${indent(context.depth)}` : '';
      return {
        ...nextContext,
        needsHtmlBlock: true,
        code: [
          `${indent(context.depth)}<HtmlBlock`,
          ` tag=${JSON.stringify(propString(props.tag, 'div'))}`,
          ` styleValue={${toObjectLiteral((props.style ?? {}) as Record<string, unknown>)}}`,
          `>${childContent}</HtmlBlock>`,
        ].join(''),
      };
    }
    case 'core.widget':
      return {
        ...nextContext,
        needsWidgetPlaceholder: true,
        code: `${indent(context.depth)}<WidgetPlaceholder id=${JSON.stringify(node.id)} />`,
      };
    // Navigation
    case 'core.navbar':
      return {
        ...nextContext,
        code: wrap('nav', className, node, children, context, [
          `data-fixed={${JSON.stringify(Boolean(props.fixed))}}`,
          `data-transparent={${JSON.stringify(Boolean(props.transparent))}}`,
        ]),
      };
    case 'core.tabbar': {
      const items = propStringArray(props.items);
      const active = propString(props.active, items[0] ?? '');
      const icons = propStringArray(props.icons);
      const tabItems = items.map((item, i) => {
        const target = tabNavigateTarget(node.interactions?.onTabClick, item);
        const icon = icons[i] ?? '';
        return [
          `${indent(context.depth + 1)}<button type="button"`,
          ` className={Object.is(${JSON.stringify(item)}, ${JSON.stringify(active)}) ? 'active' : ''}`,
          target ? ` onClick={() => onNavigate(${JSON.stringify(target)})}` : '',
          '>',
          icon ? `<span aria-hidden="true">{${JSON.stringify(icon)}}</span>` : '',
          `<span>{${JSON.stringify(item)}}</span>`,
          '</button>',
        ].join('');
      }).join('\n');
      return {
        ...nextContext,
        code: wrap('nav', className, node, tabItems, context),
      };
    }
    case 'core.breadcrumb': {
      const items = propStringArray(props.items);
      const sep = propString(props.separator, '/');
      const parts: string[] = [];
      items.forEach((item, i) => {
        parts.push(`${indent(context.depth + 1)}<span className="breadcrumb-item${i === items.length - 1 ? ' active' : ''}">{${JSON.stringify(item)}}</span>`);
        if (i < items.length - 1) {
          parts.push(`${indent(context.depth + 1)}<span className="breadcrumb-sep">{${JSON.stringify(sep)}}</span>`);
        }
      });
      return { ...nextContext, code: wrap('nav', className, node, parts.join('\n'), context) };
    }
    case 'core.pagination': {
      const current = propNumber(props.current, 1);
      const total = propNumber(props.total, 1);
      const pageSize = propNumber(props.pageSize, 10);
      const pages = Math.ceil(total / pageSize);
      const btns: string[] = [];
      btns.push(`${indent(context.depth + 1)}<button type="button" className="page-prev"${current <= 1 ? ' disabled' : ''}>‹</button>`);
      for (let i = 1; i <= Math.min(pages, 7); i++) {
        btns.push(`${indent(context.depth + 1)}<button type="button" className={${JSON.stringify(i)} === ${JSON.stringify(current)} ? 'active' : ''}>{${JSON.stringify(i)}}</button>`);
      }
      btns.push(`${indent(context.depth + 1)}<button type="button" className="page-next"${current >= pages ? ' disabled' : ''}>›</button>`);
      return { ...nextContext, code: wrap('nav', className, node, btns.join('\n'), context) };
    }
    // Data display
    case 'core.avatar': {
      const src = propString(props.src);
      const text = propString(props.text);
      const size = propString(props.size, 'medium');
      const shape = propString(props.shape, 'circle');
      const style = styleAttr(node);
      if (src) {
        return { ...nextContext, code: `${indent(context.depth)}<img className="${className}" data-size="${size}" data-shape="${shape}" src=${JSON.stringify(src)} alt=${JSON.stringify(text || 'avatar')}${style ? ` ${style}` : ''} />` };
      }
      return { ...nextContext, code: `${indent(context.depth)}<span className="${className}" data-size="${size}" data-shape="${shape}"${style ? ` ${style}` : ''}>{${JSON.stringify((text || '?').charAt(0))}}</span>` };
    }
    case 'core.badge': {
      const count = propNumber(props.count, 0);
      const max = propNumber(props.max, 99);
      const dot = Boolean(props.dot);
      const text = propString(props.text);
      const tone = propString(props.tone, 'error');
      const display = dot ? '' : text || (count > max ? `${max}+` : String(count));
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<span className="${className}" data-tone="${tone}" data-dot={${JSON.stringify(dot)}}${style ? ` ${style}` : ''}>${display ? `{${JSON.stringify(display)}}` : ''}</span>` };
    }
    case 'core.list':
      return { ...nextContext, code: wrap('div', className, node, children, context, [
        `data-bordered={${JSON.stringify(Boolean(props.bordered))}}`,
        `data-split={${JSON.stringify(Boolean(props.split))}}`,
      ]) };
    case 'core.list-item': {
      const title = propString(props.title);
      const desc = propString(props.description);
      const note = propString(props.note);
      const arrow = Boolean(props.arrow);
      const thumb = propString(props.thumb);
      const parts: string[] = [];
      if (thumb) {parts.push(`${indent(context.depth + 1)}<img className="list-item-thumb" src=${JSON.stringify(thumb)} alt="" />`);}
      parts.push(`${indent(context.depth + 1)}<div className="list-item-content">`);
      if (title) {parts.push(`${indent(context.depth + 2)}<span className="list-item-title">{${JSON.stringify(title)}}</span>`);}
      if (desc) {parts.push(`${indent(context.depth + 2)}<span className="list-item-desc">{${JSON.stringify(desc)}}</span>`);}
      parts.push(`${indent(context.depth + 1)}</div>`);
      if (note) {parts.push(`${indent(context.depth + 1)}<span className="list-item-note">{${JSON.stringify(note)}}</span>`);}
      if (arrow) {parts.push(`${indent(context.depth + 1)}<span className="list-item-arrow" aria-hidden="true">›</span>`);}
      if (children) {parts.push(children);}
      return { ...nextContext, code: wrap('div', className, node, parts.join('\n'), context) };
    }
    case 'core.statistic': {
      const title = propString(props.title);
      const value = propString(props.value);
      const prefix = propString(props.prefix);
      const suffix = propString(props.suffix);
      const trend = propString(props.trend, 'neutral');
      const tone = propString(props.tone, 'neutral');
      const style = styleAttr(node);
      const parts: string[] = [];
      if (title) {parts.push(`${indent(context.depth + 1)}<span className="stat-title">{${JSON.stringify(title)}}</span>`);}
      parts.push(`${indent(context.depth + 1)}<span className="stat-value" data-tone="${tone}" data-trend="${trend}">`);
      if (prefix) {parts.push(`${indent(context.depth + 2)}<span className="stat-prefix">{${JSON.stringify(prefix)}}</span>`);}
      parts.push(`${indent(context.depth + 2)}{${JSON.stringify(value)}}`);
      if (suffix) {parts.push(`${indent(context.depth + 2)}<span className="stat-suffix">{${JSON.stringify(suffix)}}</span>`);}
      parts.push(`${indent(context.depth + 1)}</span>`);
      return { ...nextContext, code: `${indent(context.depth)}<div className="${className}"${style ? ` ${style}` : ''}>\n${parts.join('\n')}\n${indent(context.depth)}</div>` };
    }
    case 'core.collapse':
      return { ...nextContext, code: [
        `${indent(context.depth)}<details className="${className}"${props.expanded ? ' open' : ''}>`,
        `${indent(context.depth + 1)}<summary>{${JSON.stringify(propString(props.title))}}</summary>`,
        children ? `${children}` : '',
        `${indent(context.depth)}</details>`,
      ].join('\n') };
    case 'core.carousel': {
      const images = propStringArray(props.images);
      const style = styleAttr(node);
      const imgTags = images.map((src, i) => {
        const altText = 'Slide ' + (i + 1);
        return `${indent(context.depth + 1)}<img className="carousel-item" src=${JSON.stringify(src)} alt=${JSON.stringify(altText)} />`;
      }).join('\n');
      return { ...nextContext, code: `${indent(context.depth)}<div className="${className}"${style ? ` ${style}` : ''}>\n${imgTags}\n${indent(context.depth)}</div>` };
    }
    case 'core.empty': {
      const text = propString(props.text, '暂无数据');
      const image = propString(props.image);
      const actionLabel = propString(props.actionLabel);
      const style = styleAttr(node);
      const parts: string[] = [];
      if (image) {parts.push(`${indent(context.depth + 1)}<img className="empty-image" src=${JSON.stringify(image)} alt="" />`);}
      parts.push(`${indent(context.depth + 1)}<p className="empty-text">{${JSON.stringify(text)}}</p>`);
      if (actionLabel) {parts.push(`${indent(context.depth + 1)}<button type="button" className="empty-action">{${JSON.stringify(actionLabel)}}</button>`);}
      return { ...nextContext, code: `${indent(context.depth)}<div className="${className}"${style ? ` ${style}` : ''}>\n${parts.join('\n')}\n${indent(context.depth)}</div>` };
    }
    case 'core.skeleton': {
      const rows = propNumber(props.rows, 3);
      const animated = props.animated !== false;
      const style = styleAttr(node);
      const bars: string[] = [];
      for (let i = 0; i < rows; i++) {
        bars.push(`${indent(context.depth + 1)}<div className="skeleton-line" style={{ width: '${60 + (i % 3) * 15}%' }} />`);
      }
      return { ...nextContext, code: `${indent(context.depth)}<div className="${className}" data-animated={${JSON.stringify(animated)}}${style ? ` ${style}` : ''}>\n${bars.join('\n')}\n${indent(context.depth)}</div>` };
    }
    // Data input
    case 'core.select': {
      const label = propString(props.label);
      const placeholder = propString(props.placeholder);
      const options = propStringArray(props.options);
      const value = propString(props.value);
      const style = styleAttr(node);
      const opts = options.map((o) => `${indent(context.depth + 2)}<option value=${JSON.stringify(o)}>{${JSON.stringify(o)}}</option>`).join('\n');
      const select = `<select className="core-select" defaultValue=${JSON.stringify(value)} aria-label=${JSON.stringify(label || placeholder || 'Select')}>\n${placeholder ? `${indent(context.depth + 1)}<option value="" disabled>{${JSON.stringify(placeholder)}}</option>\n` : ''}${opts}\n${indent(context.depth + 1)}</select>`;
      if (!label) {return { ...nextContext, code: `${indent(context.depth)}${select}` };}
      return { ...nextContext, code: `${indent(context.depth)}<label className="core-field"${style ? ` ${style}` : ''}>\n${indent(context.depth + 1)}<span className="core-field-label">{${JSON.stringify(label)}}</span>\n${indent(context.depth + 1)}${select}\n${indent(context.depth)}</label>` };
    }
    case 'core.checkbox': {
      const label = propString(props.label);
      const checked = Boolean(props.checked);
      const disabled = Boolean(props.disabled);
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<label className="${className}"${style ? ` ${style}` : ''}><input type="checkbox"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''} /><span className="checkbox-box" /><span>{${JSON.stringify(label)}}</span></label>` };
    }
    case 'core.radio': {
      const label = propString(props.label);
      const checked = Boolean(props.checked);
      const disabled = Boolean(props.disabled);
      const group = propString(props.group);
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<label className="${className}"${style ? ` ${style}` : ''}><input type="radio" name=${JSON.stringify(group)}${checked ? ' checked' : ''}${disabled ? ' disabled' : ''} /><span className="radio-dot" /><span>{${JSON.stringify(label)}}</span></label>` };
    }
    case 'core.switch': {
      const label = propString(props.label);
      const checked = Boolean(props.checked);
      const disabled = Boolean(props.disabled);
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<label className="${className}"${style ? ` ${style}` : ''}><span className="switch-track" data-checked={${JSON.stringify(checked)}} data-disabled={${JSON.stringify(disabled)}}><span className="switch-thumb" /></span>${label ? `<span>{${JSON.stringify(label)}}</span>` : ''}</label>` };
    }
    case 'core.rate': {
      const value = propNumber(props.value, 0);
      const count = propNumber(props.count, 5);
      const style = styleAttr(node);
      const stars: string[] = [];
      for (let i = 1; i <= count; i++) {
        stars.push(`${indent(context.depth + 1)}<span className="rate-star${i <= value ? ' filled' : ''}">{${i <= value ? '"★"' : '"☆"'}}</span>`);
      }
      return { ...nextContext, code: `${indent(context.depth)}<span className="${className}"${style ? ` ${style}` : ''}>\n${stars.join('\n')}\n${indent(context.depth)}</span>` };
    }
    case 'core.slider': {
      const min = propNumber(props.min, 0);
      const max = propNumber(props.max, 100);
      const step = propNumber(props.step, 1);
      const value = propNumber(props.value, min);
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<input className="${className}" type="range" min={${min}} max={${max}} step={${step}} defaultValue={${value}}${style ? ` ${style}` : ''} />` };
    }
    case 'core.datepicker': {
      const placeholder = propString(props.placeholder, '选择日期');
      const value = propString(props.value);
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<input className="${className}" type="date"${value ? ` defaultValue=${JSON.stringify(value)}` : ''} placeholder=${JSON.stringify(placeholder)}${style ? ` ${style}` : ''} />` };
    }
    case 'core.timepicker': {
      const placeholder = propString(props.placeholder, '选择时间');
      const value = propString(props.value);
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<input className="${className}" type="time"${value ? ` defaultValue=${JSON.stringify(value)}` : ''} placeholder=${JSON.stringify(placeholder)}${style ? ` ${style}` : ''} />` };
    }
    case 'core.form':
      return { ...nextContext, code: wrap('form', className, node, children, context, [
        `data-label-align=${JSON.stringify(propString(props.labelAlign, 'left'))}`,
      ], { '--label-width': propString(props.labelWidth, '80px') }) };
    case 'core.upload': {
      const accept = propString(props.accept);
      const multiple = Boolean(props.multiple);
      const actionLabel = propString(props.actionLabel, '点击上传');
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<div className="${className}"${style ? ` ${style}` : ''}><input type="file" className="upload-input"${accept ? ` accept=${JSON.stringify(accept)}` : ''}${multiple ? ' multiple' : ''} /><span className="upload-label">{${JSON.stringify(actionLabel)}}</span></div>` };
    }
    // Feedback
    case 'core.dialog': {
      const title = propString(props.title);
      const visible = Boolean(props.visible);
      const confirmText = propString(props.confirmText, '确定');
      const cancelText = propString(props.cancelText, '取消');
      if (!visible) {return { ...nextContext, code: '' };}
      return { ...nextContext, code: [
        `${indent(context.depth)}<div className="dialog-overlay">`,
        `${indent(context.depth + 1)}<div className="${className}">`,
        title ? `${indent(context.depth + 2)}<div className="dialog-title">{${JSON.stringify(title)}}</div>` : '',
        `${indent(context.depth + 2)}<div className="dialog-body">`,
        children || '',
        `${indent(context.depth + 2)}</div>`,
        `${indent(context.depth + 2)}<div className="dialog-footer">`,
        `${indent(context.depth + 3)}<button type="button" className="dialog-cancel">{${JSON.stringify(cancelText)}}</button>`,
        `${indent(context.depth + 3)}<button type="button" className="dialog-confirm">{${JSON.stringify(confirmText)}}</button>`,
        `${indent(context.depth + 2)}</div>`,
        `${indent(context.depth + 1)}</div>`,
        `${indent(context.depth)}</div>`,
      ].join('\n') };
    }
    case 'core.toast': {
      const message = propString(props.message);
      const type = propString(props.type, 'info');
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<div className="${className}" data-type="${type}" role="alert"${style ? ` ${style}` : ''}>{${JSON.stringify(message)}}</div>` };
    }
    case 'core.alert': {
      const text = propString(props.text);
      const type = propString(props.type, 'info');
      const closable = Boolean(props.closable);
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<div className="${className}" data-type="${type}" role="alert"${style ? ` ${style}` : ''}><span>{${JSON.stringify(text)}}</span>${closable ? '<button type="button" className="alert-close" aria-label="关闭">×</button>' : ''}</div>` };
    }
    case 'core.loading': {
      const text = propString(props.text);
      const type = propString(props.type, 'spinner');
      const size = propString(props.size, 'medium');
      const style = styleAttr(node);
      if (type === 'skeleton') {
        return { ...nextContext, code: `${indent(context.depth)}<div className="${className}" data-type="skeleton" data-size="${size}"${style ? ` ${style}` : ''}><div className="skeleton-line" /><div className="skeleton-line" /><div className="skeleton-line" /></div>` };
      }
      return { ...nextContext, code: `${indent(context.depth)}<div className="${className}" data-type="spinner" data-size="${size}"${style ? ` ${style}` : ''}><span className="spinner" />${text ? `<span>{${JSON.stringify(text)}}</span>` : ''}</div>` };
    }
    case 'core.drawer': {
      const title = propString(props.title);
      const visible = Boolean(props.visible);
      const placement = propString(props.placement, 'right');
      if (!visible) {return { ...nextContext, code: '' };}
      return { ...nextContext, code: [
        `${indent(context.depth)}<div className="drawer-overlay">`,
        `${indent(context.depth + 1)}<div className="${className}" data-placement="${placement}">`,
        title ? `${indent(context.depth + 2)}<div className="drawer-title">{${JSON.stringify(title)}}</div>` : '',
        `${indent(context.depth + 2)}<div className="drawer-body">`,
        children || '',
        `${indent(context.depth + 2)}</div>`,
        `${indent(context.depth + 1)}</div>`,
        `${indent(context.depth)}</div>`,
      ].join('\n') };
    }
    // Media
    case 'core.video': {
      const src = propString(props.src);
      const poster = propString(props.poster);
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<video className="${className}"${src ? ` src=${JSON.stringify(src)}` : ''}${poster ? ` poster=${JSON.stringify(poster)}` : ''}${props.autoplay ? ' autoPlay' : ''}${props.controls !== false ? ' controls' : ''}${style ? ` ${style}` : ''} />` };
    }
    case 'core.audio': {
      const src = propString(props.src);
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<audio className="${className}"${src ? ` src=${JSON.stringify(src)}` : ''}${props.autoplay ? ' autoPlay' : ''}${props.controls !== false ? ' controls' : ''}${style ? ` ${style}` : ''} />` };
    }
    // Layout
    case 'core.sidebar':
      return { ...nextContext, code: wrap('aside', className, node, children, context, [
        `data-collapsed={${JSON.stringify(Boolean(props.collapsed))}}`,
      ], { width: propString(props.width, '240') + 'px' }) };
    case 'core.toolbar': {
      const title = propString(props.title);
      const parts: string[] = [];
      if (title) {parts.push(`${indent(context.depth + 1)}<span className="toolbar-title">{${JSON.stringify(title)}}</span>`);}
      if (children) {parts.push(children);}
      return { ...nextContext, code: wrap('div', className, node, parts.join('\n'), context, [
        `data-fixed={${JSON.stringify(Boolean(props.fixed))}}`,
      ]) };
    }
    case 'core.splitter':
      return { ...nextContext, code: wrap('div', className, node, children, context, [
        `data-direction=${JSON.stringify(propString(props.direction, 'horizontal'))}`,
      ]) };
    // Professional
    case 'core.timeline':
      return { ...nextContext, code: wrap('div', className, node, children, context, [
        `data-direction=${JSON.stringify(propString(props.direction, 'vertical'))}`,
      ]) };
    case 'core.tooltip': {
      const text = propString(props.text);
      const placement = propString(props.placement, 'top');
      const style = styleAttr(node);
      return { ...nextContext, code: `${indent(context.depth)}<span className="${className}" data-tooltip=${JSON.stringify(text)} data-placement="${placement}"${style ? ` ${style}` : ''}>{${JSON.stringify(text)}}</span>` };
    }
    case 'core.tree':
      return { ...nextContext, code: wrap('ul', className, node, children, context, [
        `data-expand-all={${JSON.stringify(Boolean(props.expandAll))}}`,
      ]) };
    case 'core.table': {
      const columns = Array.isArray(props.columns) ? props.columns as Record<string, unknown>[] : [];
      const data = Array.isArray(props.data) ? props.data as Record<string, unknown>[] : [];
      const bordered = Boolean(props.bordered);
      const stripe = Boolean(props.stripe);
      const style = styleAttr(node);
      const ths = columns.map((col) => `${indent(context.depth + 2)}<th${col.width ? ` style={{ width: '${col.width}' }}` : ''}>{${JSON.stringify(propString(col.title))}}</th>`).join('\n');
      const rows = data.map((row, ri) => {
        const tds = columns.map((col) => `${indent(context.depth + 3)}<td>{${JSON.stringify(row[propString(col.key)] ?? '')}}</td>`).join('\n');
        return `${indent(context.depth + 2)}<tr>\n${tds}\n${indent(context.depth + 2)}</tr>`;
      }).join('\n');
      return { ...nextContext, code: `${indent(context.depth)}<table className="${className}" data-bordered={${JSON.stringify(bordered)}} data-stripe={${JSON.stringify(stripe)}}${style ? ` ${style}` : ''}>\n${indent(context.depth + 1)}<thead>\n${indent(context.depth + 2)}<tr>\n${ths}\n${indent(context.depth + 2)}</tr>\n${indent(context.depth + 1)}</thead>\n${indent(context.depth + 1)}<tbody>\n${rows}\n${indent(context.depth + 1)}</tbody>\n${indent(context.depth)}</table>` };
    }
    default:
      return {
        ...nextContext,
        needsUnsupportedNode: true,
        code: [
          `${indent(context.depth)}<UnsupportedNode`,
          ` alias=${JSON.stringify(node.alias)}`,
          ` id=${JSON.stringify(node.id)} />`,
        ].join(''),
      };
  }
}

export function compileNode(node: ThemeLayoutNode, depth = 2): CompiledNode {
  return compileNodeInternal(node, {
    depth,
    needsHtmlBlock: false,
    needsUnsupportedNode: false,
    needsWidgetPlaceholder: false,
  });
}
