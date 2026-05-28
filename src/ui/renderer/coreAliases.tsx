'use client';

import type { LayoutNodeFrame, LayoutNodeLayout } from '../layout/types';
import {
  AlertNode,
  AudioNode,
  AvatarNode,
  BadgeNode,
  BreadcrumbNode,
  ButtonNode,
  CarouselNode,
  CheckboxNode,
  CollapseNode,
  DatePickerNode,
  DialogNode,
  DividerNode,
  DrawerNode,
  EmptyNode,
  FormNode,
  GridNode,
  HtmlNode,
  ImageNode,
  InputNode,
  ListNode,
  ListItemNode,
  LoadingNode,
  NavBarNode,
  NoticeNode,
  PaginationNode,
  PanelNode,
  ProgressNode,
  RadioNode,
  RateNode,
  RowNode,
  ScreenNode,
  SearchNode,
  SelectNode,
  SidebarNode,
  SkeletonNode,
  SliderNode,
  SpacerNode,
  SplitterNode,
  StackNode,
  StatisticNode,
  SwitchNode,
  TabBarNode,
  TableNode,
  TabsNode,
  TagNode,
  TextNode,
  TimePickerNode,
  TimelineNode,
  ToastNode,
  ToolbarNode,
  TooltipNode,
  TreeNode,
  UploadNode,
  VideoNode,
  WidgetNode,
} from './components';
import { resolveFrameStyle, resolveLayoutStyle } from './styleResolvers';
import type { ThemeRuntime } from './types';
import type { CSSProperties, ReactNode } from 'react';

function resolveTemplateStyle(value: unknown): CSSProperties {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const style: CSSProperties = {};

  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === 'string'
      || typeof item === 'number'
      || item === null
      || item === undefined
    ) {
      style[key as keyof CSSProperties] = item as never;
    }
  }

  return style;
}

export function renderCoreAlias(
  runtime: ThemeRuntime,
  alias: string,
  props: Record<string, unknown>,
  children: ReactNode[],
) {
  const applyNodeLayoutStyle = props.__applyNodeLayoutStyle !== false;
  const templateStyle = resolveTemplateStyle(props.style);
  const nodeLayoutStyle: CSSProperties = applyNodeLayoutStyle
    ? {
        ...resolveLayoutStyle(
          props.__layout as LayoutNodeLayout,
          typeof props.__parentAlias === 'string' ? props.__parentAlias : undefined,
        ),
        ...(props.__layoutMode === 'absolute'
          ? resolveFrameStyle(props.__frame as LayoutNodeFrame | undefined)
          : {}),
        ...templateStyle,
      }
    : {
        ...((props.__templateStyle as CSSProperties | undefined) ?? {}),
        ...templateStyle,
      };

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
    case 'core.progress':
      return <ProgressNode {...nodeProps} />;
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
    // Navigation
    case 'core.navbar':
      return <NavBarNode {...nodeProps} />;
    case 'core.tabbar':
      return <TabBarNode {...nodeProps} />;
    case 'core.breadcrumb':
      return <BreadcrumbNode {...nodeProps} />;
    case 'core.pagination':
      return <PaginationNode {...nodeProps} />;
    // Data display
    case 'core.avatar':
      return <AvatarNode {...nodeProps} />;
    case 'core.badge':
      return <BadgeNode {...nodeProps} />;
    case 'core.list':
      return <ListNode {...nodeProps} />;
    case 'core.list-item':
      return <ListItemNode {...nodeProps} />;
    case 'core.statistic':
      return <StatisticNode {...nodeProps} />;
    case 'core.collapse':
      return <CollapseNode {...nodeProps} />;
    case 'core.carousel':
      return <CarouselNode {...nodeProps} />;
    case 'core.empty':
      return <EmptyNode {...nodeProps} />;
    case 'core.skeleton':
      return <SkeletonNode {...nodeProps} />;
    // Data input
    case 'core.select':
      return <SelectNode {...nodeProps} />;
    case 'core.checkbox':
      return <CheckboxNode {...nodeProps} />;
    case 'core.radio':
      return <RadioNode {...nodeProps} />;
    case 'core.switch':
      return <SwitchNode {...nodeProps} />;
    case 'core.rate':
      return <RateNode {...nodeProps} />;
    case 'core.slider':
      return <SliderNode {...nodeProps} />;
    case 'core.datepicker':
      return <DatePickerNode {...nodeProps} />;
    case 'core.timepicker':
      return <TimePickerNode {...nodeProps} />;
    case 'core.form':
      return <FormNode {...nodeProps} />;
    case 'core.upload':
      return <UploadNode {...nodeProps} />;
    // Feedback
    case 'core.dialog':
      return <DialogNode {...nodeProps} />;
    case 'core.toast':
      return <ToastNode {...nodeProps} />;
    case 'core.alert':
      return <AlertNode {...nodeProps} />;
    case 'core.loading':
      return <LoadingNode {...nodeProps} />;
    case 'core.drawer':
      return <DrawerNode {...nodeProps} />;
    // Media
    case 'core.video':
      return <VideoNode {...nodeProps} />;
    case 'core.audio':
      return <AudioNode {...nodeProps} />;
    // Layout & Navigation
    case 'core.sidebar':
      return <SidebarNode {...nodeProps} />;
    case 'core.toolbar':
      return <ToolbarNode {...nodeProps} />;
    case 'core.splitter':
      return <SplitterNode {...nodeProps} />;
    // Professional
    case 'core.timeline':
      return <TimelineNode {...nodeProps} />;
    case 'core.tooltip':
      return <TooltipNode {...nodeProps} />;
    case 'core.tree':
      return <TreeNode {...nodeProps} />;
    case 'core.table':
      return <TableNode {...nodeProps} />;
    default:
      return null;
  }
}
