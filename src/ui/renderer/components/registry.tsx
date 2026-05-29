'use client';

import type { ThemeRuntime } from '../types';
import { AlertNode } from './AlertNode/AlertNode';
import { AudioNode } from './AudioNode/AudioNode';
import { AvatarNode } from './AvatarNode/AvatarNode';
import { BadgeNode } from './BadgeNode/BadgeNode';
import { BreadcrumbNode } from './BreadcrumbNode/BreadcrumbNode';
import { ButtonNode } from './ButtonNode/ButtonNode';
import { CarouselNode } from './CarouselNode/CarouselNode';
import { CheckboxNode } from './CheckboxNode/CheckboxNode';
import { CollapseNode } from './CollapseNode/CollapseNode';
import { DatePickerNode } from './DatePickerNode/DatePickerNode';
import { DialogNode } from './DialogNode/DialogNode';
import { DividerNode } from './DividerNode/DividerNode';
import { DrawerNode } from './DrawerNode/DrawerNode';
import { EmptyNode } from './EmptyNode/EmptyNode';
import { FormNode } from './FormNode/FormNode';
import { GridNode } from './GridNode/GridNode';
import { HtmlNode } from './HtmlNode/HtmlNode';
import { ImageNode } from './ImageNode/ImageNode';
import { InputNode } from './InputNode/InputNode';
import { ListItemNode } from './ListItemNode/ListItemNode';
import { ListNode } from './ListNode/ListNode';
import { LoadingNode } from './LoadingNode/LoadingNode';
import { NavBarNode } from './NavBarNode/NavBarNode';
import { NoticeNode } from './NoticeNode/NoticeNode';
import { PaginationNode } from './PaginationNode/PaginationNode';
import { PanelNode } from './PanelNode/PanelNode';
import { ProgressNode } from './ProgressNode/ProgressNode';
import { RadioNode } from './RadioNode/RadioNode';
import { RateNode } from './RateNode/RateNode';
import { RowNode } from './RowNode/RowNode';
import { ScreenNode } from './ScreenNode/ScreenNode';
import { SearchNode } from './SearchNode/SearchNode';
import { SelectNode } from './SelectNode/SelectNode';
import { SidebarNode } from './SidebarNode/SidebarNode';
import { SkeletonNode } from './SkeletonNode/SkeletonNode';
import { SliderNode } from './SliderNode/SliderNode';
import { SpacerNode } from './SpacerNode/SpacerNode';
import { SplitterNode } from './SplitterNode/SplitterNode';
import { StackNode } from './StackNode/StackNode';
import { StatisticNode } from './StatisticNode/StatisticNode';
import { SwitchNode } from './SwitchNode/SwitchNode';
import { TabBarNode } from './TabBarNode/TabBarNode';
import { TableNode } from './TableNode/TableNode';
import { TabsNode } from './TabsNode/TabsNode';
import { TagNode } from './TagNode/TagNode';
import { TextNode } from './TextNode/TextNode';
import { TimelineNode } from './TimelineNode/TimelineNode';
import { TimePickerNode } from './TimePickerNode/TimePickerNode';
import { ToastNode } from './ToastNode/ToastNode';
import { ToolbarNode } from './ToolbarNode/ToolbarNode';
import { TooltipNode } from './TooltipNode/TooltipNode';
import { TreeNode } from './TreeNode/TreeNode';
import type { CoreNodeProps } from './types';
import { UploadNode } from './UploadNode/UploadNode';
import { VideoNode } from './VideoNode/VideoNode';
import { WidgetNode } from './WidgetNode/WidgetNode';
import type { ReactNode } from 'react';

interface CoreComponentRenderContext extends CoreNodeProps {
  runtime: ThemeRuntime;
}

export type CoreComponentRenderer = (context: CoreComponentRenderContext) => ReactNode;

function renderComponent<T>(Component: (props: CoreNodeProps<T>) => ReactNode): CoreComponentRenderer {
  function renderRegisteredComponent({ runtime: _runtime, ...nodeProps }: CoreComponentRenderContext) {
    return <Component {...(nodeProps as CoreNodeProps<T>)} />;
  }

  return renderRegisteredComponent;
}

function renderRuntimeComponent<T>(
  Component: (props: CoreNodeProps<T> & { runtime: ThemeRuntime }) => ReactNode,
): CoreComponentRenderer {
  function renderRegisteredRuntimeComponent({ runtime, ...nodeProps }: CoreComponentRenderContext) {
    return <Component runtime={runtime} {...(nodeProps as CoreNodeProps<T>)} />;
  }

  return renderRegisteredRuntimeComponent;
}

export const CORE_COMPONENT_RENDERERS = {
  'core.alert': renderComponent(AlertNode),
  'core.audio': renderComponent(AudioNode),
  'core.avatar': renderComponent(AvatarNode),
  'core.badge': renderComponent(BadgeNode),
  'core.breadcrumb': renderComponent(BreadcrumbNode),
  'core.button': renderComponent(ButtonNode),
  'core.carousel': renderComponent(CarouselNode),
  'core.checkbox': renderComponent(CheckboxNode),
  'core.collapse': renderComponent(CollapseNode),
  'core.datepicker': renderComponent(DatePickerNode),
  'core.dialog': renderComponent(DialogNode),
  'core.divider': renderComponent(DividerNode),
  'core.drawer': renderComponent(DrawerNode),
  'core.empty': renderComponent(EmptyNode),
  'core.form': renderComponent(FormNode),
  'core.grid': renderComponent(GridNode),
  'core.html': renderComponent(HtmlNode),
  'core.image': renderComponent(ImageNode),
  'core.input': renderComponent(InputNode),
  'core.list': renderComponent(ListNode),
  'core.list-item': renderComponent(ListItemNode),
  'core.loading': renderComponent(LoadingNode),
  'core.navbar': renderComponent(NavBarNode),
  'core.notice': renderComponent(NoticeNode),
  'core.pagination': renderComponent(PaginationNode),
  'core.panel': renderComponent(PanelNode),
  'core.progress': renderComponent(ProgressNode),
  'core.radio': renderComponent(RadioNode),
  'core.rate': renderComponent(RateNode),
  'core.row': renderComponent(RowNode),
  'core.screen': renderRuntimeComponent(ScreenNode),
  'core.search': renderComponent(SearchNode),
  'core.select': renderComponent(SelectNode),
  'core.sidebar': renderComponent(SidebarNode),
  'core.skeleton': renderComponent(SkeletonNode),
  'core.slider': renderComponent(SliderNode),
  'core.spacer': renderComponent(SpacerNode),
  'core.splitter': renderComponent(SplitterNode),
  'core.stack': renderComponent(StackNode),
  'core.statistic': renderComponent(StatisticNode),
  'core.switch': renderComponent(SwitchNode),
  'core.tabbar': renderComponent(TabBarNode),
  'core.table': renderComponent(TableNode),
  'core.tabs': renderComponent(TabsNode),
  'core.tag': renderComponent(TagNode),
  'core.text': renderComponent(TextNode),
  'core.timeline': renderComponent(TimelineNode),
  'core.timepicker': renderComponent(TimePickerNode),
  'core.toast': renderComponent(ToastNode),
  'core.toolbar': renderComponent(ToolbarNode),
  'core.tooltip': renderComponent(TooltipNode),
  'core.tree': renderComponent(TreeNode),
  'core.upload': renderComponent(UploadNode),
  'core.video': renderComponent(VideoNode),
  'core.widget': renderRuntimeComponent(WidgetNode),
} as const satisfies Record<string, CoreComponentRenderer>;

export type CoreComponentAlias = keyof typeof CORE_COMPONENT_RENDERERS;

export const CORE_COMPONENT_ALIASES = Object.keys(CORE_COMPONENT_RENDERERS) as CoreComponentAlias[];

export function resolveCoreComponentRenderer(alias: string): CoreComponentRenderer | undefined {
  return CORE_COMPONENT_RENDERERS[alias as CoreComponentAlias];
}
