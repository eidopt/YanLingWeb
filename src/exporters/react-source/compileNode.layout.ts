/* eslint-disable max-len */
import {
  attrs,
  type CaseArgs,
  type CaseHandler,
  type CompileNodeContext,
  indent,
  interactionActionAttr,
  mergeFlags,
  propNumber,
  propString,
  propStringArray,
  tabNavigateTarget,
  wrap,
} from './compileNode.shared';

const compileScreen: CaseHandler = ({ node, props, context, compileNodeInternal }: CaseArgs) => {
  let screenContext: CompileNodeContext = context;
  const surface = propString(props.surface);
  const chrome = propString(props.chrome, surface === 'web' ? 'none' : surface === 'mini-program' ? 'wechat' : 'app');
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
    interactionActionAttr(node.interactions?.onClick),
  ]);
  const statusAndHeader = isWebSurface
    ? []
    : [
        `${indent(context.depth + 1)}<${node.interactions?.onStatusClick ? 'button' : 'div'} ${attrs([
          'className="statusBar"',
          node.interactions?.onStatusClick ? 'type="button"' : null,
          interactionActionAttr(node.interactions?.onStatusClick),
        ])}>`,
        [
          `${indent(context.depth + 2)}<span className="statusTime">`,
          `{${JSON.stringify(propString(props.statusTime, '9:41'))}}`,
          '</span>',
        ].join(''),
        `${indent(context.depth + 1)}</${node.interactions?.onStatusClick ? 'button' : 'div'}>`,
        `${indent(context.depth + 1)}<header className="screenHeader">`,
        `${indent(context.depth + 2)}<span className="headerSpacer" aria-hidden="true" />`,
        [`${indent(context.depth + 2)}<h1>`, `{${JSON.stringify(propString(props.title, 'Untitled'))}}`, '</h1>'].join(
          '',
        ),
        props.headerActionLabel
          ? [
              `${indent(context.depth + 2)}<${node.interactions?.onActionClick ? 'button' : 'span'} ${attrs([
                'className="headerAction"',
                node.interactions?.onActionClick ? 'type="button"' : null,
                interactionActionAttr(node.interactions?.onActionClick),
              ])}>`,
              `{${JSON.stringify(propString(props.headerActionLabel))}}`,
              `</${node.interactions?.onActionClick ? 'button' : 'span'}>`,
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
    ]
      .filter(Boolean)
      .join('\n'),
  };
};

const compilePanel: CaseHandler = ({ node, props, children, nextContext, context, className }) => ({
  ...nextContext,
  code: wrap(
    'div',
    className,
    node,
    children,
    context,
    [`data-tone=${JSON.stringify(propString(props.tone, 'default'))}`],
    {
      gap: `${propNumber(props.gap, 12)}px`,
    },
  ),
});

const compileStack: CaseHandler = ({ node, props, children, nextContext, context, className }) => ({
  ...nextContext,
  code: wrap('div', className, node, children, context, [], {
    gap: `${propNumber(props.gap, 12)}px`,
    alignItems: propString(props.alignItems) || undefined,
  }),
});

const compileRow: CaseHandler = ({ node, props, children, nextContext, context, className }) => ({
  ...nextContext,
  code: wrap(
    'div',
    className,
    node,
    children,
    context,
    [`data-tone=${JSON.stringify(propString(props.tone, 'default'))}`],
    {
      gap: `${propNumber(props.gap, 12)}px`,
      flexWrap: props.wrap ? 'wrap' : 'nowrap',
      justifyContent: propString(props.justify) || undefined,
      alignItems: propString(props.align) || undefined,
    },
  ),
});

const compileGrid: CaseHandler = ({ node, props, children, nextContext, context, className }) => ({
  ...nextContext,
  code: wrap('div', className, node, children, context, [], {
    gap: `${propNumber(props.gap, 12)}px`,
    gridTemplateColumns: `repeat(${propNumber(props.columns, 2)}, minmax(0, 1fr))`,
  }),
});

const compileNavbar: CaseHandler = ({ node, props, children, nextContext, context, className }) => ({
  ...nextContext,
  code: wrap('nav', className, node, children, context, [
    `data-fixed={${JSON.stringify(Boolean(props.fixed))}}`,
    `data-transparent={${JSON.stringify(Boolean(props.transparent))}}`,
  ]),
});

const compileTabbar: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const items = propStringArray(props.items);
  const active = propString(props.active, items[0] ?? '');
  const icons = propStringArray(props.icons);
  const tabItems = items
    .map((item, i) => {
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
    })
    .join('\n');
  return {
    ...nextContext,
    code: wrap('nav', className, node, tabItems, context),
  };
};

const compileBreadcrumb: CaseHandler = ({ node, props, nextContext, context, className }) => {
  const items = propStringArray(props.items);
  const sep = propString(props.separator, '/');
  const parts: string[] = [];
  items.forEach((item, i) => {
    parts.push(
      `${indent(context.depth + 1)}<span className="breadcrumb-item${i === items.length - 1 ? ' active' : ''}">{${JSON.stringify(item)}}</span>`,
    );
    if (i < items.length - 1) {
      parts.push(`${indent(context.depth + 1)}<span className="breadcrumb-sep">{${JSON.stringify(sep)}}</span>`);
    }
  });
  return { ...nextContext, code: wrap('nav', className, node, parts.join('\n'), context) };
};

const compileSidebar: CaseHandler = ({ node, props, children, nextContext, context, className }) => ({
  ...nextContext,
  code: wrap(
    'aside',
    className,
    node,
    children,
    context,
    [`data-collapsed={${JSON.stringify(Boolean(props.collapsed))}}`],
    { width: propString(props.width, '240') + 'px' },
  ),
});

const compileToolbar: CaseHandler = ({ node, props, children, nextContext, context, className }) => {
  const title = propString(props.title);
  const parts: string[] = [];
  if (title) {
    parts.push(`${indent(context.depth + 1)}<span className="toolbar-title">{${JSON.stringify(title)}}</span>`);
  }
  if (children) {
    parts.push(children);
  }
  return {
    ...nextContext,
    code: wrap('div', className, node, parts.join('\n'), context, [
      `data-fixed={${JSON.stringify(Boolean(props.fixed))}}`,
    ]),
  };
};

const compileSplitter: CaseHandler = ({ node, props, children, nextContext, context, className }) => ({
  ...nextContext,
  code: wrap('div', className, node, children, context, [
    `data-direction=${JSON.stringify(propString(props.direction, 'horizontal'))}`,
  ]),
});

const compileTimeline: CaseHandler = ({ node, props, children, nextContext, context, className }) => ({
  ...nextContext,
  code: wrap('div', className, node, children, context, [
    `data-direction=${JSON.stringify(propString(props.direction, 'vertical'))}`,
  ]),
});

const compileTree: CaseHandler = ({ node, props, children, nextContext, context, className }) => ({
  ...nextContext,
  code: wrap('ul', className, node, children, context, [
    `data-expand-all={${JSON.stringify(Boolean(props.expandAll))}}`,
  ]),
});

const compileCollapse: CaseHandler = ({ props, children, nextContext, context, className }) => ({
  ...nextContext,
  code: [
    `${indent(context.depth)}<details className="${className}"${props.expanded ? ' open' : ''}>`,
    `${indent(context.depth + 1)}<summary>{${JSON.stringify(propString(props.title))}}</summary>`,
    children ? `${children}` : '',
    `${indent(context.depth)}</details>`,
  ].join('\n'),
});

export const layoutHandlers: Record<string, CaseHandler> = {
  'core.screen': compileScreen,
  'core.panel': compilePanel,
  'core.stack': compileStack,
  'core.row': compileRow,
  'core.grid': compileGrid,
  'core.navbar': compileNavbar,
  'core.tabbar': compileTabbar,
  'core.breadcrumb': compileBreadcrumb,
  'core.sidebar': compileSidebar,
  'core.toolbar': compileToolbar,
  'core.splitter': compileSplitter,
  'core.timeline': compileTimeline,
  'core.tree': compileTree,
  'core.collapse': compileCollapse,
};
