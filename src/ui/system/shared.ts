import type {
  AriaAttributes,
  AriaRole,
  CSSProperties,
  DragEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
  Ref,
} from 'react';

export type DataAttributeProps = Partial<
  Record<`data-${string}`, string | number | boolean | undefined>
>;

export type SystemElementProps<TElement extends keyof HTMLElementTagNameMap> =
  AriaAttributes &
  DataAttributeProps & {
    as?: TElement;
    children?: ReactNode;
    className?: string;
    draggable?: boolean;
    id?: string;
    onClick?: MouseEventHandler<HTMLElementTagNameMap[TElement]>;
    onDragEnd?: DragEventHandler<HTMLElementTagNameMap[TElement]>;
    onDragLeave?: DragEventHandler<HTMLElementTagNameMap[TElement]>;
    onDragOver?: DragEventHandler<HTMLElementTagNameMap[TElement]>;
    onDragStart?: DragEventHandler<HTMLElementTagNameMap[TElement]>;
    onDrop?: DragEventHandler<HTMLElementTagNameMap[TElement]>;
    onKeyDown?: KeyboardEventHandler<HTMLElementTagNameMap[TElement]>;
    ref?: Ref<HTMLElementTagNameMap[TElement]>;
    role?: AriaRole;
    style?: CSSProperties;
    tabIndex?: number;
    title?: string;
  };

export type SystemTextAlign = 'start' | 'center' | 'end' | 'left' | 'right' | 'justify';

export type SystemStyle = CSSProperties & {
  '--ui-container-max'?: string;
  '--ui-container-gutter'?: string;
  '--ui-gap'?: string;
  '--ui-grid-columns'?: number;
  '--ui-grid-template'?: string;
  '--ui-divider-inset'?: string;
  '--ui-divider-spacing'?: string;
  '--ui-divider-thickness'?: string;
  '--ui-layout-align'?: CSSProperties['alignItems'];
  '--ui-layout-direction'?: CSSProperties['flexDirection'];
  '--ui-layout-justify'?: CSSProperties['justifyContent'];
  '--ui-layout-wrap'?: CSSProperties['flexWrap'];
  '--ui-spacer-size'?: string;
};

export const GAP_TOKENS = {
  '0': '0',
  'u0-25': 'var(--app-unit-0-25)',
  'u0-5': 'var(--app-unit-0-5)',
  'u0-7': 'var(--app-unit-0-75)',
  'u0-75': 'var(--app-unit-0-75)',
  'u0-8': 'var(--app-unit-0-75)',
  'u0-875': 'var(--app-unit-0-75)',
  'u0-9': 'var(--app-unit-1)',
  'u1': 'var(--app-unit-1)',
  'u1-3': 'var(--app-unit-1-25)',
  'u1-4': 'var(--app-unit-1-5)',
  'u1-5': 'var(--app-unit-1-5)',
  'u1-75': 'var(--app-unit-1-75)',
  'u2-5': 'var(--app-unit-2-5)',
  xs: 'var(--app-space-1)',
  sm: 'var(--app-space-2)',
  md: 'var(--app-space-4)',
  lg: 'var(--app-space-6)',
  xl: 'var(--app-space-8)',
  '2xl': 'var(--app-space-12)',
} as const;

export type SystemGap = keyof typeof GAP_TOKENS;

export const CONTAINER_MAX: Record<string, string> = {
  sm: 'var(--app-unit-80)',
  md: 'var(--app-unit-112)',
  lg: 'var(--app-unit-150)',
  xl: 'var(--app-unit-160)',
  full: 'none',
};

export function resolveToken(
  value: string | undefined,
  tokens: Record<string, string>,
) {
  if (!value) {
    return undefined;
  }

  return tokens[value] ?? value;
}

export function mergeStyle(
  style: CSSProperties | undefined,
  vars: SystemStyle,
): SystemStyle {
  return { ...vars, ...style };
}
