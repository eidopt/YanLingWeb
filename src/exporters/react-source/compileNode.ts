import { controlsHandlers } from './compileNode.controls';
import { dataHandlers } from './compileNode.data';
import { layoutHandlers } from './compileNode.layout';
import { mediaHandlers } from './compileNode.media';
import {
  type CaseArgs,
  type CaseHandler,
  type CompiledNode,
  type CompileNodeContext,
  type CompileNodeOptions,
  indent,
  mergeFlags,
  withUnsupportedDataBindingComment,
} from './compileNode.shared';
import type { ThemeLayoutNode } from 'ui/layout/types';

export type { CompileNodeOptions };

const aliasHandlers: Record<string, CaseHandler> = {
  ...layoutHandlers,
  ...controlsHandlers,
  ...mediaHandlers,
  ...dataHandlers,
};

function compileDefault(args: CaseArgs): CompiledNode {
  const { node, context, nextContext } = args;
  return {
    ...nextContext,
    needsUnsupportedNode: true,
    code: withUnsupportedDataBindingComment(
      node,
      context,
      [
        `${indent(context.depth)}<UnsupportedNode`,
        ` alias=${JSON.stringify(node.alias)}`,
        ` id=${JSON.stringify(node.id)} />`,
      ].join(''),
    ),
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

function compileNodeInternal(node: ThemeLayoutNode, context: CompileNodeContext): CompiledNode {
  const props = node.props ?? {};
  const compiledChildren = compileChildren(node, context);
  const children = compiledChildren.code;
  const nextContext = compiledChildren.context;
  const className = node.alias.replace('.', '-');

  const handler = aliasHandlers[node.alias] ?? compileDefault;
  return handler({ node, props, children, nextContext, context, className, compileNodeInternal });
}

export function compileNode(node: ThemeLayoutNode, depth = 2, options: CompileNodeOptions = {}): CompiledNode {
  return compileNodeInternal(node, {
    depth,
    controlledVisibilityNodeIds: options.controlledVisibilityNodeIds ?? new Set<string>(),
    dataSourceIds: options.dataSourceIds ?? new Set<string>(),
    needsAsyncDataBoundary: false,
    needsAsyncDataHelpers: false,
    needsHtmlBlock: false,
    needsInteractiveAlert: false,
    needsInteractiveCarousel: false,
    needsInteractiveDialog: false,
    needsInteractiveDrawer: false,
    needsInteractiveForm: false,
    needsInteractivePagination: false,
    needsInteractiveRate: false,
    needsInteractiveSwitch: false,
    needsInteractiveTabs: false,
    needsUnsupportedNode: false,
    needsStaticWidget: false,
  });
}
