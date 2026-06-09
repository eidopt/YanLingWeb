import { createNodeId, toFieldString } from './nodeOperations';
import { SAMPLE_PROP_OVERRIDES } from './sampleContent';
import { CONTAINER_ALIASES, type DraftLayoutMode, FOOTER_ALIASES, type NodeDraft } from './types';
import { getPropDisplayName } from 'ui/editor/displayText';
import { themeLayoutBuilderContent } from 'ui/editor/ThemeLayoutBuilder.content';
import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
  LayoutPropDescriptor,
  ThemeComponentDescriptor,
  ThemeLayoutNode,
} from 'ui/layout/types';

function buildDefaultPropValue(themeId: string, descriptor: ThemeComponentDescriptor, prop: LayoutPropDescriptor) {
  const themeOverrides = Object.hasOwn(SAMPLE_PROP_OVERRIDES, themeId) ? SAMPLE_PROP_OVERRIDES[themeId] : undefined;
  const aliasOverrides = themeOverrides?.[descriptor.alias];
  if (aliasOverrides && Object.hasOwn(aliasOverrides, prop.name)) {
    return aliasOverrides[prop.name];
  }

  if (prop.type === 'boolean') {
    return false;
  }

  if (prop.enum?.length) {
    return prop.enum[0] ?? '';
  }

  if (!prop.required) {
    return '';
  }

  if (prop.type === 'number') {
    return prop.name === 'columns' ? '2' : '1';
  }

  switch (prop.name) {
    case 'title':
      return descriptor.name;
    case 'subtitle':
      return themeLayoutBuilderContent.defaultProps.subtitle;
    case 'caption':
      return themeLayoutBuilderContent.defaultProps.caption;
    case 'body':
      return themeLayoutBuilderContent.defaultProps.body;
    case 'text':
      return descriptor.name;
    case 'label':
      return descriptor.name;
    case 'placeholder':
      return themeLayoutBuilderContent.defaultProps.placeholder;
    case 'overline':
      return themeLayoutBuilderContent.defaultProps.overline;
    case 'price':
      return '¥99';
    case 'badgeLabel':
      return themeLayoutBuilderContent.defaultProps.badgeLabel;
    case 'actionLabel':
      return themeLayoutBuilderContent.defaultProps.actionLabel;
    case 'statusLabel':
      return themeLayoutBuilderContent.defaultProps.statusLabel;
    case 'iconColor':
      return 'var(--app-color-wechat)';
    default:
      return descriptor.name;
  }
}

export function buildDefaultProps(themeId: string, descriptor: ThemeComponentDescriptor) {
  return Object.fromEntries(
    descriptor.props.map((prop) => [prop.name, buildDefaultPropValue(themeId, descriptor, prop)]),
  );
}

export function defaultFlowWidth(descriptor: ThemeComponentDescriptor) {
  if (descriptor.alias === 'core.notice') {
    return '';
  }

  if (descriptor.kind === 'layout') {
    return '100%';
  }

  if (
    descriptor.alias === 'svc-text' ||
    descriptor.alias === 'com-text' ||
    descriptor.alias === 'svc-section-header' ||
    descriptor.alias === 'svc-order-cell' ||
    descriptor.alias === 'com-product-card' ||
    descriptor.alias === 'com-promo-card' ||
    FOOTER_ALIASES.has(descriptor.alias)
  ) {
    return '100%';
  }

  return '';
}

export function defaultFlowAlignSelf(descriptor: ThemeComponentDescriptor) {
  return descriptor.alias === 'core.notice' ? 'start' : '';
}

export function defaultAbsoluteWidth(descriptor: ThemeComponentDescriptor) {
  if (descriptor.alias === 'svc-text' || descriptor.alias === 'com-text') {
    return '180';
  }

  if (
    descriptor.alias === 'svc-button' ||
    descriptor.alias === 'com-button' ||
    descriptor.alias === 'svc-tag' ||
    descriptor.alias === 'com-tag' ||
    descriptor.alias === 'com-pill'
  ) {
    return '140';
  }

  if (descriptor.alias === 'com-product-card') {
    return '168';
  }

  if (descriptor.alias === 'svc-action-card') {
    return '156';
  }

  if (
    descriptor.alias === 'core.search' ||
    descriptor.alias === 'core.notice' ||
    descriptor.alias === 'svc-order-cell' ||
    descriptor.alias === 'svc-section-header'
  ) {
    return '320';
  }

  if (descriptor.kind === 'layout' || FOOTER_ALIASES.has(descriptor.alias)) {
    return '320';
  }

  return '280';
}

function parseNumericField(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  return Number(value);
}

function parseSizeField(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const numericValue = Number(value);
  return Number.isNaN(numericValue) ? value : numericValue;
}

export function buildLayoutFromDraft(draft: NodeDraft): LayoutNodeLayout {
  return {
    mode: draft.layoutMode,
    flowRow: draft.flowRow || undefined,
    order: parseNumericField(draft.order),
    width: parseSizeField(draft.width),
    height: parseSizeField(draft.height),
    minWidth: parseSizeField(draft.minWidth),
    minHeight: parseSizeField(draft.minHeight),
    maxWidth: parseSizeField(draft.maxWidth),
    maxHeight: parseSizeField(draft.maxHeight),
    gridColumn: draft.gridColumn || undefined,
    gridRow: draft.gridRow || undefined,
    alignSelf: (draft.alignSelf || undefined) as LayoutNodeLayout['alignSelf'],
    justifySelf: (draft.justifySelf || undefined) as LayoutNodeLayout['justifySelf'],
  };
}

export function buildFrameFromDraft(draft: NodeDraft): LayoutNodeFrame | undefined {
  if (draft.layoutMode !== 'absolute') {
    return undefined;
  }

  return {
    position: 'absolute',
    x: parseNumericField(draft.frameX),
    y: parseNumericField(draft.frameY),
    left: draft.frameLeft || undefined,
    top: draft.frameTop || undefined,
    right: draft.frameRight || undefined,
    bottom: draft.frameBottom || undefined,
    width: parseSizeField(draft.frameWidth),
    height: parseSizeField(draft.frameHeight),
    zIndex: parseNumericField(draft.frameZIndex),
    unit: draft.frameUnit,
  };
}

export function buildPropsFromValues(descriptor: ThemeComponentDescriptor, values: Record<string, string | boolean>) {
  const nextProps: Record<string, unknown> = {};

  descriptor.props.forEach((prop) => {
    const value = values[prop.name];
    if (prop.type === 'boolean') {
      nextProps[prop.name] = Boolean(value);
      return;
    }

    if (typeof value !== 'string' || !value.trim()) {
      return;
    }

    if (prop.type === 'number') {
      nextProps[prop.name] = Number(value);
      return;
    }

    if (prop.type === 'string[]') {
      nextProps[prop.name] = value
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean);
      return;
    }

    nextProps[prop.name] = value;
  });

  return nextProps;
}

export function buildPropsFromDraft(descriptor: ThemeComponentDescriptor, draft: NodeDraft) {
  return buildPropsFromValues(descriptor, draft.props);
}

export function validateDraft(descriptor: ThemeComponentDescriptor, draft: NodeDraft) {
  for (const prop of descriptor.props) {
    const value = draft.props[prop.name];
    if (prop.required) {
      if (prop.type === 'boolean') {
        continue;
      }

      if (typeof value !== 'string' || !value.trim()) {
        return themeLayoutBuilderContent.validation.requiredProp(getPropDisplayName(prop));
      }
    }
  }

  if (!draft.parentId) {
    return themeLayoutBuilderContent.validation.parentRequired;
  }

  if (draft.layoutMode === 'absolute' && !draft.frameX.trim() && !draft.frameLeft.trim()) {
    return themeLayoutBuilderContent.validation.absoluteXRequired;
  }

  if (draft.layoutMode === 'absolute' && !draft.frameY.trim() && !draft.frameTop.trim()) {
    return themeLayoutBuilderContent.validation.absoluteYRequired;
  }

  return null;
}

export function createDraft(
  themeId: string,
  descriptor: ThemeComponentDescriptor,
  parentId: string,
  slot: 'body' | 'footer',
  dropPoint?: { x: number; y: number },
  flowRow = 0,
): NodeDraft {
  const layoutMode: DraftLayoutMode = slot === 'footer' ? 'flow' : dropPoint ? 'absolute' : 'flow';
  const isAbsolute = layoutMode === 'absolute';

  return {
    alias: descriptor.alias,
    parentId,
    slot,
    layoutMode,
    flowRow,
    order: '',
    width: isAbsolute ? '' : defaultFlowWidth(descriptor),
    height: '',
    minWidth: '',
    minHeight: '',
    maxWidth: '',
    maxHeight: '',
    gridColumn: '',
    gridRow: '',
    alignSelf: isAbsolute ? '' : defaultFlowAlignSelf(descriptor),
    justifySelf: '',
    frameX: dropPoint ? String(dropPoint.x) : '',
    frameY: dropPoint ? String(dropPoint.y) : '',
    frameLeft: '',
    frameTop: '',
    frameRight: '',
    frameBottom: '',
    frameWidth: isAbsolute ? defaultAbsoluteWidth(descriptor) : '',
    frameHeight: '',
    frameZIndex: '',
    frameUnit: 'px',
    props: buildDefaultProps(themeId, descriptor),
  };
}

export function createDraftFromNode(
  descriptor: ThemeComponentDescriptor,
  node: ThemeLayoutNode,
  parentId: string,
): NodeDraft {
  const propEntries: [string, string | boolean][] = descriptor.props.map((prop) => {
    const rawValue = node.props?.[prop.name];
    return [prop.name, prop.type === 'boolean' ? Boolean(rawValue) : toFieldString(rawValue)];
  });

  return {
    nodeId: node.id,
    alias: node.alias,
    parentId,
    slot: node.slot ?? 'body',
    layoutMode: node.layout.mode,
    flowRow: node.layout.flowRow ?? 0,
    order: toFieldString(node.layout.order),
    width: toFieldString(node.layout.width),
    height: toFieldString(node.layout.height),
    minWidth: toFieldString(node.layout.minWidth),
    minHeight: toFieldString(node.layout.minHeight),
    maxWidth: toFieldString(node.layout.maxWidth),
    maxHeight: toFieldString(node.layout.maxHeight),
    gridColumn: toFieldString(node.layout.gridColumn),
    gridRow: toFieldString(node.layout.gridRow),
    alignSelf: toFieldString(node.layout.alignSelf),
    justifySelf: toFieldString(node.layout.justifySelf),
    frameX: toFieldString(node.frame?.x),
    frameY: toFieldString(node.frame?.y),
    frameLeft: toFieldString(node.frame?.left),
    frameTop: toFieldString(node.frame?.top),
    frameRight: toFieldString(node.frame?.right),
    frameBottom: toFieldString(node.frame?.bottom),
    frameWidth: toFieldString(node.frame?.width),
    frameHeight: toFieldString(node.frame?.height),
    frameZIndex: toFieldString(node.frame?.zIndex),
    frameUnit: node.frame?.unit ?? 'px',
    props: Object.fromEntries(propEntries),
  };
}

export function buildNodeFromDraft(
  descriptor: ThemeComponentDescriptor,
  draft: NodeDraft,
  children?: ThemeLayoutNode[],
): ThemeLayoutNode {
  return {
    id: draft.nodeId ?? createNodeId(descriptor.alias),
    alias: descriptor.alias,
    slot: draft.slot,
    layout: buildLayoutFromDraft(draft),
    frame: buildFrameFromDraft(draft),
    props: buildPropsFromDraft(descriptor, draft),
    children: CONTAINER_ALIASES.has(descriptor.alias) || descriptor.kind === 'layout' ? (children ?? []) : undefined,
  };
}
