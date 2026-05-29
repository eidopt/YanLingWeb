import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
  ThemeComponentDescriptor,
  ThemeLayoutNodeInteractions,
  ThemeLayoutTabInteraction,
} from '../../layout/types';
import { aiEditInstructionsContent as c } from './aiEditInstructions.content';

const CORE_IMAGE_PROP_FALLBACKS = new Map([
  ['src', 'string'],
  ['alt', 'string'],
  ['title', 'string'],
  ['iconColor', 'string'],
  ['objectFit', 'string'],
]);
const CORE_PROP_ALIASES = new Map([
  ['core.button:text', 'label'],
  ['core.notice:variant', 'tone'],
]);

const SIZE_LAYOUT_KEYS = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'] as const;

const GRID_LAYOUT_KEYS = ['gridColumn', 'gridRow'] as const;
const ALIGN_VALUES = new Set(['auto', 'start', 'center', 'end', 'stretch']);

function stringifyPropValue(value: unknown) {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isSizeValue(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}

export function sanitizeLayoutPatch(layout: Partial<LayoutNodeLayout> | undefined): Partial<LayoutNodeLayout> {
  const next: Partial<LayoutNodeLayout> = {};
  if (!layout) {
    return next;
  }

  if (layout.mode === 'flow' || layout.mode === 'grid' || layout.mode === 'absolute') {
    next.mode = layout.mode;
  }
  if (typeof layout.flowRow === 'number') {
    next.flowRow = layout.flowRow;
  }
  if (typeof layout.order === 'number') {
    next.order = layout.order;
  }

  SIZE_LAYOUT_KEYS.forEach((key) => {
    const value = layout[key];
    if (isSizeValue(value)) {
      next[key] = value;
    }
  });

  GRID_LAYOUT_KEYS.forEach((key) => {
    const value = layout[key];
    if (typeof value === 'string') {
      next[key] = value;
    }
  });

  if (typeof layout.alignSelf === 'string' && ALIGN_VALUES.has(layout.alignSelf)) {
    next.alignSelf = layout.alignSelf;
  }
  if (typeof layout.justifySelf === 'string' && ALIGN_VALUES.has(layout.justifySelf)) {
    next.justifySelf = layout.justifySelf;
  }

  return next;
}

export function sanitizeFramePatch(frame: Partial<LayoutNodeFrame> | undefined): Partial<LayoutNodeFrame> {
  const next: Partial<LayoutNodeFrame> = {};
  if (!frame) {
    return next;
  }

  next.position = 'absolute';
  if (typeof frame.x === 'number') {
    next.x = frame.x;
  }
  if (typeof frame.y === 'number') {
    next.y = frame.y;
  }
  if (isSizeValue(frame.left)) {
    next.left = frame.left;
  }
  if (isSizeValue(frame.top)) {
    next.top = frame.top;
  }
  if (isSizeValue(frame.right)) {
    next.right = frame.right;
  }
  if (isSizeValue(frame.bottom)) {
    next.bottom = frame.bottom;
  }
  if (isSizeValue(frame.width)) {
    next.width = frame.width;
  }
  if (isSizeValue(frame.height)) {
    next.height = frame.height;
  }
  if (isSizeValue(frame.minWidth)) {
    next.minWidth = frame.minWidth;
  }
  if (isSizeValue(frame.minHeight)) {
    next.minHeight = frame.minHeight;
  }
  if (isSizeValue(frame.maxWidth)) {
    next.maxWidth = frame.maxWidth;
  }
  if (isSizeValue(frame.maxHeight)) {
    next.maxHeight = frame.maxHeight;
  }
  if (typeof frame.zIndex === 'number') {
    next.zIndex = frame.zIndex;
  }
  if (frame.unit === 'px' || frame.unit === '%') {
    next.unit = frame.unit;
  }
  return next;
}

function coercePropValue(
  descriptor: ThemeComponentDescriptor,
  name: string,
  value: unknown,
): { error?: string; value?: unknown } {
  const fallbackType = descriptor.alias === 'core.image' ? CORE_IMAGE_PROP_FALLBACKS.get(name) : undefined;
  const prop =
    descriptor.props.find((item) => item.name === name) ?? (fallbackType ? { name, type: fallbackType } : undefined);
  if (!prop) {
    return { error: c.propNotInComponent(name, descriptor.alias) };
  }

  if (prop.type === 'boolean') {
    return { value: Boolean(value) };
  }

  if (prop.type === 'number') {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      return { error: c.propNeedsNumber(name) };
    }
    return { value: numericValue };
  }

  if (prop.type === 'string[]') {
    if (Array.isArray(value)) {
      return {
        value: value.map((item) => String(item).trim()).filter(Boolean),
      };
    }

    if (typeof value === 'string') {
      return {
        value: value
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean),
      };
    }

    return { error: c.propNeedsStringArray(name) };
  }

  if (prop.type === 'object') {
    if (isPlainObject(value)) {
      return { value };
    }

    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (isPlainObject(parsed)) {
          return { value: parsed };
        }
      } catch {
        return { error: c.propNeedsObject(name) };
      }
    }

    return { error: c.propNeedsObject(name) };
  }

  const stringValue = stringifyPropValue(value);
  if (prop.enum?.length && !prop.enum.includes(stringValue)) {
    return {
      error: c.propEnumRequired(name, prop.enum),
    };
  }

  return { value: stringValue };
}

export function coerceProps(descriptor: ThemeComponentDescriptor, props: Record<string, unknown> | undefined) {
  const nextProps: Record<string, unknown> = {};
  const errors: string[] = [];
  Object.entries(props ?? {}).forEach(([name, value]) => {
    const effectiveName = CORE_PROP_ALIASES.get(`${descriptor.alias}:${name}`) ?? name;
    if (effectiveName !== name && nextProps[effectiveName] !== undefined) {
      return;
    }
    const result = coercePropValue(descriptor, effectiveName, value);
    if (result.error) {
      errors.push(result.error);
      return;
    }
    nextProps[effectiveName] = result.value;
  });
  return { errors, props: nextProps };
}

function sanitizeNavigateAction(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return { type: 'navigate' as const, targetPageId: value.trim() };
  }

  if (!isPlainObject(value)) {
    return null;
  }

  return (value.type === 'navigate' || !value.type) && typeof value.targetPageId === 'string'
    ? { type: 'navigate' as const, targetPageId: value.targetPageId }
    : null;
}

function sanitizeTabInteraction(value: unknown): ThemeLayoutTabInteraction | null {
  const directAction = sanitizeNavigateAction(value);
  if (directAction) {
    return directAction;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const entries = Object.entries(value)
    .map(([label, action]) => [label, sanitizeNavigateAction(action)] as const)
    .filter((entry): entry is readonly [string, { type: 'navigate'; targetPageId: string }] => Boolean(entry[1]));

  return entries.length ? Object.fromEntries(entries) : null;
}

export function sanitizeInteractionsPatch(interactions: Partial<ThemeLayoutNodeInteractions> | undefined) {
  const next: Partial<ThemeLayoutNodeInteractions> = {};
  if (!interactions) {
    return next;
  }

  const onClick = sanitizeNavigateAction(interactions.onClick);
  if (onClick) {
    next.onClick = onClick;
  }

  const onActionClick = sanitizeNavigateAction(interactions.onActionClick);
  if (onActionClick) {
    next.onActionClick = onActionClick;
  }

  const onStatusClick = sanitizeNavigateAction(interactions.onStatusClick);
  if (onStatusClick) {
    next.onStatusClick = onStatusClick;
  }

  const onTabClick = sanitizeTabInteraction(interactions.onTabClick);
  if (onTabClick) {
    next.onTabClick = onTabClick;
  }

  if (Object.keys(next).length === 0) {
    const implicitTabClick = sanitizeTabInteraction(interactions);
    if (implicitTabClick) {
      next.onTabClick = implicitTabClick;
    }
  }

  return next;
}
