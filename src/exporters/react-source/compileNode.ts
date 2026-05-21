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
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function propStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function attrs(attributes: (string | null | undefined)[]): string {
  return attributes.filter(Boolean).join(' ');
}

function styleAttr(node: ThemeLayoutNode): string | null {
  const style = compileLayoutStyle(node.layout, node.frame);
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

function wrap(
  tag: string,
  className: string,
  node: ThemeLayoutNode,
  children: string,
  context: CompileNodeContext,
  extraAttrs: (string | null)[] = [],
): string {
  const open = attrs([
    `className="${className}"`,
    styleAttr(node),
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
          'className="screen"',
          navigateAttr(node.interactions?.onClick),
        ]);
      return {
        ...screenContext,
        code: [
          `${indent(context.depth)}<section ${open}>`,
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
    case 'core.stack':
    case 'core.row':
      return {
        ...nextContext,
        code: wrap('div', className, node, children, context, [
          `data-tone=${JSON.stringify(propString(props.tone, 'default'))}`,
          `data-gap={${JSON.stringify(propNumber(props.gap, 12))}}`,
        ]),
      };
    case 'core.grid':
      return {
        ...nextContext,
        code: wrap('div', className, node, children, context, [
          `data-columns={${JSON.stringify(propNumber(props.columns, 2))}}`,
          `data-gap={${JSON.stringify(propNumber(props.gap, 12))}}`,
        ]),
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
          `>{${JSON.stringify(propString(props.label, 'Button'))}}</button>`,
        ].join(''),
      };
    }
    case 'core.image': {
      const style = styleAttr(node);
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
    case 'core.search':
    case 'core.input': {
      const style = styleAttr(node);
      return {
        ...nextContext,
        code: [
          `${indent(context.depth)}<input className="${className}"`,
          style ? ` ${style}` : '',
          ` placeholder=${JSON.stringify(propString(props.placeholder))}`,
          ` aria-label=${JSON.stringify(propString(props.placeholder, 'Input'))} />`,
        ].join(''),
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
      return {
        ...nextContext,
        code: [
          `${indent(context.depth)}<aside className="core-notice"`,
          style ? ` ${style}` : '',
          `>{${JSON.stringify(propString(props.text))}}</aside>`,
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
      const style = styleAttr(node);
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
