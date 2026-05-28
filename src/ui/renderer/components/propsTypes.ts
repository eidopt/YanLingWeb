/**
 * Per-component prop interfaces for all 55 core.* components.
 * Each interface includes `[key: string]: unknown` to allow runtime-injected
 * props (like onClick, __hasAbsoluteChildren) that the renderer adds alongside
 * the template-defined props.
 */

// ─── Layout Containers ────────────────────────────────────────────

export interface ScreenProps {
  title?: string;
  statusTime?: string;
  headerActionLabel?: string;
  headerLeftAriaLabel?: string;
  headerRightAriaLabel?: string;
  surface?: 'mini-program' | 'mobile-app' | 'web';
  chrome?: 'wechat' | 'app' | 'none';
  [key: string]: unknown;
}

export interface PanelProps {
  tone?: 'default' | 'accent' | 'promo' | 'warm' | 'soft' | 'member' | 'highlight';
  gap?: string;
  title?: string;
  [key: string]: unknown;
}

export interface StackProps {
  gap?: string;
  alignItems?: string;
  [key: string]: unknown;
}

export interface RowProps {
  gap?: string;
  wrap?: boolean;
  justify?: string;
  align?: string;
  tone?: string;
  [key: string]: unknown;
}

export interface GridProps {
  gap?: string;
  columns?: number;
  [key: string]: unknown;
}

export interface HtmlProps {
  tag?: string;
  style?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── Navigation ───────────────────────────────────────────────────

export interface NavBarProps {
  title?: string;
  subtitle?: string;
  leftArrow?: boolean;
  fixed?: boolean;
  transparent?: boolean;
  [key: string]: unknown;
}

export interface TabBarProps {
  items?: string[];
  active?: string;
  icons?: string[];
  [key: string]: unknown;
}

export interface BreadcrumbProps {
  items?: string[];
  separator?: string;
  [key: string]: unknown;
}

export interface PaginationProps {
  current?: number;
  total?: number;
  pageSize?: number;
  [key: string]: unknown;
}

// ─── Data Display ─────────────────────────────────────────────────

export interface AvatarProps {
  src?: string;
  text?: string;
  size?: 'small' | 'medium' | 'large';
  shape?: 'circle' | 'square';
  [key: string]: unknown;
}

export interface BadgeProps {
  count?: number;
  dot?: boolean;
  max?: number;
  text?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'info' | 'error' | 'danger';
  placement?: 'inline' | 'corner';
  [key: string]: unknown;
}

export interface ListProps {
  bordered?: boolean;
  split?: boolean;
  [key: string]: unknown;
}

export interface ListItemProps {
  title?: string;
  description?: string;
  note?: string;
  arrow?: boolean;
  thumb?: string;
  [key: string]: unknown;
}

export interface StatisticProps {
  title?: string;
  value?: string;
  suffix?: string;
  prefix?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'info' | 'error';
  trend?: 'up' | 'down' | 'neutral';
  [key: string]: unknown;
}

export interface CollapseProps {
  title?: string;
  expanded?: boolean;
  [key: string]: unknown;
}

export interface CarouselProps {
  images?: string[];
  autoplay?: boolean;
  interval?: number;
  [key: string]: unknown;
}

export interface EmptyProps {
  text?: string;
  image?: string;
  actionLabel?: string;
  [key: string]: unknown;
}

export interface SkeletonProps {
  rows?: number;
  animated?: boolean;
  [key: string]: unknown;
}

// ─── Data Input ───────────────────────────────────────────────────

export interface SelectProps {
  label?: string;
  placeholder?: string;
  options?: string[];
  value?: string;
  multiple?: boolean;
  [key: string]: unknown;
}

export interface CheckboxProps {
  label?: string;
  checked?: boolean;
  disabled?: boolean;
  [key: string]: unknown;
}

export interface RadioProps {
  label?: string;
  checked?: boolean;
  disabled?: boolean;
  group?: string;
  [key: string]: unknown;
}

export interface SwitchProps {
  checked?: boolean;
  disabled?: boolean;
  label?: string;
  [key: string]: unknown;
}

export interface RateProps {
  value?: number;
  count?: number;
  size?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

export interface SliderProps {
  value?: number;
  startValue?: number;
  endValue?: number;
  min?: number;
  max?: number;
  step?: number;
  range?: boolean;
  [key: string]: unknown;
}

export interface DatePickerProps {
  value?: string;
  format?: string;
  placeholder?: string;
  [key: string]: unknown;
}

export interface TimePickerProps {
  value?: string;
  format?: string;
  placeholder?: string;
  [key: string]: unknown;
}

export interface FormProps {
  labelWidth?: string;
  labelAlign?: 'left' | 'right' | 'top';
  [key: string]: unknown;
}

export interface UploadProps {
  accept?: string;
  multiple?: boolean;
  maxCount?: number;
  actionLabel?: string;
  [key: string]: unknown;
}

// ─── Feedback ─────────────────────────────────────────────────────

export interface DialogProps {
  title?: string;
  visible?: boolean;
  confirmText?: string;
  cancelText?: string;
  [key: string]: unknown;
}

export interface ToastProps {
  message?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  [key: string]: unknown;
}

export interface AlertProps {
  text?: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  closable?: boolean;
  [key: string]: unknown;
}

export interface LoadingProps {
  size?: 'small' | 'medium' | 'large';
  text?: string;
  type?: 'spinner' | 'skeleton';
  [key: string]: unknown;
}

export interface DrawerProps {
  title?: string;
  visible?: boolean;
  placement?: 'left' | 'right' | 'top' | 'bottom';
  [key: string]: unknown;
}

// ─── Media ────────────────────────────────────────────────────────

export interface VideoProps {
  src?: string;
  poster?: string;
  autoplay?: boolean;
  controls?: boolean;
  [key: string]: unknown;
}

export interface AudioProps {
  src?: string;
  autoplay?: boolean;
  controls?: boolean;
  [key: string]: unknown;
}

// ─── Layout & Navigation ──────────────────────────────────────────

export interface SidebarProps {
  collapsed?: boolean;
  width?: string;
  [key: string]: unknown;
}

export interface ToolbarProps {
  title?: string;
  fixed?: boolean;
  [key: string]: unknown;
}

export interface SplitterProps {
  direction?: 'horizontal' | 'vertical';
  min?: string;
  max?: string;
  [key: string]: unknown;
}

// ─── Professional ─────────────────────────────────────────────────

export interface TimelineProps {
  direction?: 'vertical' | 'horizontal';
  [key: string]: unknown;
}

export interface TooltipProps {
  text?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  [key: string]: unknown;
}

export interface TreeProps {
  data?: { label: string; children?: TreeProps['data'][] };
  expandAll?: boolean;
  [key: string]: unknown;
}

export interface TableColumn {
  key: string;
  title: string;
  width?: string;
}

export interface TableProps {
  columns?: TableColumn[];
  data?: Record<string, unknown>[];
  bordered?: boolean;
  stripe?: boolean;
  [key: string]: unknown;
}

// ─── Existing Components ──────────────────────────────────────────

export interface TextProps {
  text?: string;
  variant?:
    | 'display'
    | 'heading'
    | 'subheading'
    | 'body'
    | 'caption'
    | 'price'
    | 'overline'
    | 'eyebrow'
    | 'title'
    | 'subtitle';
  as?: string;
  [key: string]: unknown;
}

export interface ButtonProps {
  label?: string;
  text?: string;
  variant?: 'primary' | 'secondary' | 'link' | 'pill';
  active?: boolean;
  disabled?: boolean;
  icon?: string;
  [key: string]: unknown;
}

export interface ImageProps {
  assetId?: string;
  src?: string;
  alt?: string;
  title?: string;
  iconColor?: string;
  objectFit?: 'cover' | 'contain' | 'fill';
  [key: string]: unknown;
}

export interface SearchProps {
  placeholder?: string;
  value?: string;
  [key: string]: unknown;
}

export interface TabsProps {
  tabs?: string[];
  activeTab?: string;
  [key: string]: unknown;
}

export interface TagProps {
  label?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'info' | 'hot' | 'new' | 'deal' | 'member';
  [key: string]: unknown;
}

export interface ProgressProps {
  value?: number;
  max?: number;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'info';
  [key: string]: unknown;
}

export interface NoticeProps {
  text?: string;
  tone?: 'info' | 'warning' | 'error' | 'success' | 'neutral';
  variant?: string;
  [key: string]: unknown;
}

export interface InputProps {
  placeholder?: string;
  label?: string;
  type?: string;
  value?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

export interface SpacerProps {
  size?: string;
  [key: string]: unknown;
}

export interface WidgetProps {
  library?: string;
  renderer?: 'echarts' | 'chartjs' | 'lottie' | 'mermaid';
  data?: Record<string, unknown>;
  [key: string]: unknown;
}
