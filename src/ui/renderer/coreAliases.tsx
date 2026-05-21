'use client';

import type { LayoutNodeFrame, LayoutNodeLayout } from '../layout/types';
import {
  ButtonNode,
  DividerNode,
  GridNode,
  HtmlNode,
  ImageNode,
  InputNode,
  NoticeNode,
  PanelNode,
  RowNode,
  ScreenNode,
  SearchNode,
  SpacerNode,
  StackNode,
  TabsNode,
  TagNode,
  TextNode,
  WidgetNode,
} from './components';
import { resolveFrameStyle, resolveLayoutStyle } from './styleResolvers';
import type { ThemeRuntime } from './types';
import type { CSSProperties, ReactNode } from 'react';

export function renderCoreAlias(
  runtime: ThemeRuntime,
  alias: string,
  props: Record<string, unknown>,
  children: ReactNode[],
) {
  const applyNodeLayoutStyle = props.__applyNodeLayoutStyle !== false;
  const nodeLayoutStyle: CSSProperties = applyNodeLayoutStyle
    ? {
        ...resolveLayoutStyle(
          props.__layout as LayoutNodeLayout,
          typeof props.__parentAlias === 'string' ? props.__parentAlias : undefined,
        ),
        ...(props.__layoutMode === 'absolute'
          ? resolveFrameStyle(props.__frame as LayoutNodeFrame | undefined)
          : {}),
      }
    : ((props.__templateStyle as CSSProperties | undefined) ?? {});

  const nodeProps = { props, children, nodeLayoutStyle };

  switch (alias) {
    case 'core.screen':
      return <ScreenNode runtime={runtime} {...nodeProps} />;
    case 'core.search':
      return <SearchNode {...nodeProps} />;
    case 'core.notice':
      return <NoticeNode {...nodeProps} />;
    case 'core.stack':
      return <StackNode {...nodeProps} />;
    case 'core.row':
      return <RowNode {...nodeProps} />;
    case 'core.grid':
      return <GridNode {...nodeProps} />;
    case 'core.panel':
      return <PanelNode {...nodeProps} />;
    case 'core.text':
      return <TextNode {...nodeProps} />;
    case 'core.button':
      return <ButtonNode {...nodeProps} />;
    case 'core.tag':
      return <TagNode {...nodeProps} />;
    case 'core.image':
      return <ImageNode {...nodeProps} />;
    case 'core.divider':
      return <DividerNode {...nodeProps} />;
    case 'core.spacer':
      return <SpacerNode {...nodeProps} />;
    case 'core.input':
      return <InputNode {...nodeProps} />;
    case 'core.tabs':
      return <TabsNode {...nodeProps} />;
    case 'core.html':
      return <HtmlNode {...nodeProps} />;
    case 'core.widget':
      return <WidgetNode {...nodeProps} />;
    default:
      return null;
  }
}
