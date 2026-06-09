'use client';

import type {
  ThemeLayoutNavigateAction,
  ThemeLayoutNode,
  ThemeLayoutNodeAction,
  ThemeLayoutTabInteraction,
} from '../layout/types';
import { renderCoreAlias } from './coreAliases';
import { resolveNodeStyle } from './styleResolvers';
import { renderComponentTemplate } from './templateInterpreter';
import type { DynamicThemeNodeShellContext, DynamicThemeRendererState, ThemeRuntime } from './types';
import { Fragment, memo, type ReactNode } from 'react';

interface ThemeNodeViewProps {
  runtime: ThemeRuntime;
  state: DynamicThemeRendererState;
  node: ThemeLayoutNode;
  renderNodeShell?: (context: DynamicThemeNodeShellContext) => ReactNode;
  parent: ThemeLayoutNode | null;
  index: number;
}

function resolveNavigateHandler(interaction: ThemeLayoutNodeAction | undefined, state: DynamicThemeRendererState) {
  if (interaction?.type !== 'navigate') {
    return undefined;
  }

  return () => {
    state.navigateToPage(interaction.targetPageId);
  };
}

function isNavigateAction(interaction: ThemeLayoutTabInteraction): interaction is ThemeLayoutNavigateAction {
  return 'type' in interaction && interaction.type === 'navigate';
}

function resolveTabClickHandler(interaction: ThemeLayoutTabInteraction | undefined, state: DynamicThemeRendererState) {
  if (!interaction) {
    return undefined;
  }

  return (tab: string) => {
    if (!isNavigateAction(interaction) && !Object.hasOwn(interaction, tab)) {
      return;
    }
    const targetInteraction = isNavigateAction(interaction) ? interaction : interaction[tab];

    state.navigateToPage(targetInteraction.targetPageId);
  };
}

function ThemeNodeView({ runtime, state, node, renderNodeShell, parent, index }: ThemeNodeViewProps): ReactNode {
  const isRoot = parent === null;
  const childNodes =
    node.children?.map((child, childIndex) => (
      <MemoizedThemeNodeView
        key={child.id}
        runtime={runtime}
        state={state}
        node={child}
        renderNodeShell={renderNodeShell}
        parent={node}
        index={childIndex}
      />
    )) ?? [];
  const nodeStyle = resolveNodeStyle(node, parent?.alias);
  const props = {
    ...(node.props ?? {}),
    onClick: resolveNavigateHandler(node.interactions?.onClick, state),
    onActionClick: resolveNavigateHandler(node.interactions?.onActionClick, state),
    onStatusClick: resolveNavigateHandler(node.interactions?.onStatusClick, state),
    onTabClick: resolveTabClickHandler(node.interactions?.onTabClick, state),
    __layout: node.layout,
    __frame: node.frame,
    __layoutMode: node.layout.mode,
    __parentAlias: parent?.alias,
    __slot: node.slot,
    // 底栏导航 core.tabbar 兜底归入 footer 槽（固定屏幕底部、不随内容滚动），
    // 即使 SchemaGen 没显式标 slot:"footer" 也能正确固定 —— 否则 tabbar 混进可滚动
    // body 区、看起来"没有底栏"。存量与未来模板通治。
    __slots: node.children?.map((child) => child.slot ?? (child.alias === 'core.tabbar' ? 'footer' : 'body')) ?? [],
    __childFlowRows: node.children?.map((child, childIndex) => child.layout.flowRow ?? childIndex + 1) ?? [],
    __hasAbsoluteChildren: node.children?.some((child) => child.layout.mode === 'absolute') ?? false,
    __applyNodeLayoutStyle: !(renderNodeShell && !isRoot),
  };
  const resolved = node.alias.startsWith('core.')
    ? renderCoreAlias(runtime, node.alias, props, childNodes)
    : renderComponentTemplate(node.alias, props, runtime.componentTemplates, runtime);

  if (renderNodeShell && !isRoot) {
    return renderNodeShell({
      node,
      parent,
      index,
      isRoot,
      nodeStyle,
      rendered: resolved,
    });
  }

  if (!node.alias.startsWith('core.')) {
    return (
      <div key={node.id} style={nodeStyle} data-parent-alias={parent?.alias ?? ''}>
        {resolved}
      </div>
    );
  }

  return <Fragment key={node.id}>{resolved}</Fragment>;
}

const MemoizedThemeNodeView = memo(ThemeNodeView);
MemoizedThemeNodeView.displayName = 'MemoizedThemeNodeView';

export function renderThemeNodeTree(
  runtime: ThemeRuntime,
  state: DynamicThemeRendererState,
  renderNodeShell?: (context: DynamicThemeNodeShellContext) => ReactNode,
) {
  return (
    <MemoizedThemeNodeView
      runtime={runtime}
      state={state}
      node={state.rootNode}
      renderNodeShell={renderNodeShell}
      parent={null}
      index={0}
    />
  );
}
