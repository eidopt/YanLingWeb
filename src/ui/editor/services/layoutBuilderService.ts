import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
  LayoutPropDescriptor,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '../../layout/types';
import { normalizeThemeLayoutDocument } from '../../layout/types';
import { getPropDisplayName } from '../displayText';
import { themeLayoutBuilderContent } from '../ThemeLayoutBuilder.content';

export type DraftLayoutMode = LayoutNodeLayout['mode'];
export type DropIndicatorPosition = 'before' | 'after';
export type DropIndicatorAxis = 'horizontal' | 'vertical';

export interface NodeDraft {
  nodeId?: string;
  alias: string;
  parentId: string;
  slot: 'body' | 'footer';
  layoutMode: DraftLayoutMode;
  flowRow: number;
  order: string;
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  gridColumn: string;
  gridRow: string;
  alignSelf: string;
  justifySelf: string;
  frameX: string;
  frameY: string;
  frameLeft: string;
  frameTop: string;
  frameRight: string;
  frameBottom: string;
  frameWidth: string;
  frameHeight: string;
  frameZIndex: string;
  frameUnit: 'px' | '%';
  props: Record<string, string | boolean>;
}

export interface DialogState {
  descriptor: ThemeComponentDescriptor;
  draft: NodeDraft;
}

export interface FlatNode {
  node: ThemeLayoutNode;
  depth: number;
  parentId?: string;
}

export interface DropIndicator {
  nodeId: string;
  position: DropIndicatorPosition;
  axis: DropIndicatorAxis;
}

export type PointerInteraction =
  | {
      type: 'move-absolute';
      nodeId: string;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    }
  | {
      type: 'resize';
      nodeId: string;
      axis: 'x' | 'y' | 'xy';
      mode: DraftLayoutMode;
      startX: number;
      startY: number;
      originWidth: number;
      originHeight: number;
    };

export const CONTAINER_ALIASES = new Set([
  'core.screen',
  'core.panel',
  'core.stack',
  'core.row',
  'core.grid',
]);
export const FOOTER_ALIASES = new Set([
  'svc-bottom-bar',
  'com-bottom-tabs',
]);
export const ALIGN_OPTIONS = ['auto', 'start', 'center', 'end', 'stretch'];

const SAMPLE_PROP_OVERRIDES: Record<
  string,
  Record<string, Record<string, string | boolean>>
> = {
  'service-center': {
    'core.search': { placeholder: '搜索家政、维修、缴费服务' },
    'core.notice': {
      text: '样例提示：拖动左侧例子组件到画布，中文示例文案会一起带入。',
    },
    'core.panel': { tone: 'accent', gap: '12' },
    'core.stack': { gap: '10' },
    'svc-text': {
      variant: 'body',
      text: '附近好店今日可约，拖入后可以继续改成你的业务文案。',
      as: 'p',
    },
    'svc-button': { label: '立即预约', variant: 'primary' },
    'svc-action-card': {
      title: '家电清洗',
      subtitle: '最快 30 分钟上门',
      caption: '新人立减 20 元',
      iconColor: 'var(--app-color-wechat)',
    },
    'svc-info-card': {
      overline: '限时推荐',
      title: '保洁次卡已上线',
      body: '拖入后可直接修改服务介绍、配色和布局参数。',
      tone: 'highlight',
    },
    'svc-order-cell': {
      title: '空调清洗预约',
      subtitle: '今天 14:00 上门 · 2 位技师',
      statusLabel: '待服务',
    },
    'svc-section-header': { title: '热门服务', actionLabel: '查看全部' },
    'svc-tag': { label: '最快上门', tone: 'success' },
    'svc-bottom-bar': { activeTab: '首页', disabledTabs: '消息' },
  },
  'commerce-market': {
    'core.search': { placeholder: '搜索水果零食、家清百货' },
    'core.notice': {
      text: '样例提示：把这个例子拖进画布，中文商品文案会一起创建。',
    },
    'core.panel': { tone: 'accent', gap: '12' },
    'core.stack': { gap: '10' },
    'com-text': {
      variant: 'body',
      text: '今日爆款正在热卖，拖入后可继续替换成你的商品介绍。',
      as: 'p',
    },
    'com-button': { label: '马上抢', variant: 'primary' },
    'com-info-card': {
      overline: '会员精选',
      title: '加价购专区',
      body: '把这张信息卡拖进画布，继续编辑活动利益点和风格。',
      tone: 'member',
    },
    'com-pill': { label: '新品上架', active: true },
    'com-product-card': {
      overline: '24h 达',
      title: '云南蓝莓 125g',
      body: '现摘冷链发货，酸甜平衡，适合早餐酸奶杯。',
      price: '¥19.9',
      badgeLabel: '限时',
      actionLabel: '加入购物车',
    },
    'com-promo-card': {
      overline: '今日特惠',
      title: '晚餐食材 1 小时达',
      body: '拖入后会保留这段中文样例，方便你继续替换成自己的活动文案。',
      actionLabel: '去凑单',
    },
    'com-tag': { label: '满减', tone: 'deal' },
    'com-bottom-tabs': { activeTab: '首页', disabledTabs: '分类' },
  },
};

const HEIGHT_LOCKED_ALIASES = new Set([
  'core.notice',
  'core.search',
  'svc-text',
  'com-text',
  'svc-button',
  'com-button',
  'svc-tag',
  'com-tag',
  'com-pill',
  'svc-section-header',
  'svc-order-cell',
  'svc-bottom-bar',
  'com-bottom-tabs',
]);

const WIDTH_LOCKED_ALIASES = new Set(['svc-bottom-bar', 'com-bottom-tabs']);

function getPreviewThemeAliases(themeId: string) {
  return themeId === 'service-center'
    ? { text: 'svc-text', action: 'svc-button', chip: 'svc-tag' }
    : { text: 'com-text', action: 'com-button', chip: 'com-tag' };
}

export function cloneDocument(document: ThemeLayoutDocument) {
  return normalizeThemeLayoutDocument(structuredClone(document));
}

export function createBlankDocument(document: ThemeLayoutDocument) {
  const next = cloneDocument(document);
  const blankLayout = structuredClone(next.layout);
  blankLayout.children = [];
  next.layout = blankLayout;
  next.pages = [
    {
      id: next.defaultPageId,
      /* eslint-disable @typescript-eslint/prefer-nullish-coalescing --
       * empty string should fall through to next option */
      name:
        next.pageName?.trim() ||
        next.pages.find((page) => page.id === next.defaultPageId)?.name ||
        next.defaultPageId,
      /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
      layout: blankLayout,
    },
  ];
  return next;
}

export function flattenNodes(
  node: ThemeLayoutNode,
  depth = 0,
  parentId?: string,
): FlatNode[] {
  return [
    { node, depth, parentId },
    ...(node.children?.flatMap(
      (child) => flattenNodes(child, depth + 1, node.id),
    ) ?? []),
  ];
}

export function findNode(
  node: ThemeLayoutNode,
  targetId: string,
): ThemeLayoutNode | null {
  if (node.id === targetId) {
    return node;
  }

  for (const child of node.children ?? []) {
    const found = findNode(child, targetId);
    if (found) {
      return found;
    }
  }

  return null;
}

export function findParentId(
  node: ThemeLayoutNode,
  targetId: string,
  parentId?: string,
): string | undefined {
  if (node.id === targetId) {
    return parentId;
  }

  for (const child of node.children ?? []) {
    const found = findParentId(child, targetId, node.id);
    if (found) {
      return found;
    }
  }

  return undefined;
}

export function removeNode(
  node: ThemeLayoutNode,
  targetId: string,
): boolean {
  if (!node.children?.length) {
    return false;
  }

  const index = node.children.findIndex((child) => child.id === targetId);
  if (index >= 0) {
    node.children.splice(index, 1);
    return true;
  }

  return node.children.some((child) => removeNode(child, targetId));
}

export function descriptorForAlias(
  document: ThemeLayoutDocument,
  alias: string,
): ThemeComponentDescriptor | null {
  // 1. Look up in the component catalog
  const catalog = document.components.find((c) => c.alias === alias);
  if (catalog) { return catalog; }

  // 2. Fall back to componentTemplates — build a synthetic descriptor
  const componentTemplates = (document as ThemeLayoutDocument & {
    componentTemplates?: Record<string, unknown>;
  }).componentTemplates;
  const template = componentTemplates?.[alias];
  if (template && typeof template === 'object' && 'root' in template) {
    const root = (template as { root: { alias: string } }).root;
    return {
      alias,
      name: (template as { displayName?: string }).displayName ?? alias,
      kind: CONTAINER_ALIASES.has(root.alias) ? 'layout' : 'component',
      description: `Custom component defined in componentTemplates`,
      props: [],
    };
  }

  return null;
}

export function toFieldString(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return '';
}

function buildDefaultPropValue(
  themeId: string,
  descriptor: ThemeComponentDescriptor,
  prop: LayoutPropDescriptor,
) {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- themeId may not be in registry at runtime
  const aliasOverrides = SAMPLE_PROP_OVERRIDES[themeId]?.[descriptor.alias];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard
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

export function buildDefaultProps(
  themeId: string,
  descriptor: ThemeComponentDescriptor,
) {
  return Object.fromEntries(
    descriptor.props.map((prop) => [
      prop.name,
      buildDefaultPropValue(themeId, descriptor, prop),
    ]),
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

export function defaultAbsoluteWidth(
  descriptor: ThemeComponentDescriptor,
) {
  if (
    descriptor.alias === 'svc-text' ||
    descriptor.alias === 'com-text'
  ) {
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
    alignSelf:
      (draft.alignSelf || undefined) as LayoutNodeLayout['alignSelf'],
    justifySelf:
      (draft.justifySelf || undefined) as LayoutNodeLayout['justifySelf'],
  };
}

export function buildFrameFromDraft(
  draft: NodeDraft,
): LayoutNodeFrame | undefined {
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

export function buildPropsFromValues(
  descriptor: ThemeComponentDescriptor,
  values: Record<string, string | boolean>,
) {
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

export function buildPropsFromDraft(
  descriptor: ThemeComponentDescriptor,
  draft: NodeDraft,
) {
  return buildPropsFromValues(descriptor, draft.props);
}

export function validateDraft(
  descriptor: ThemeComponentDescriptor,
  draft: NodeDraft,
) {
  for (const prop of descriptor.props) {
    const value = draft.props[prop.name];
    if (prop.required) {
      if (prop.type === 'boolean') {
        continue;
      }

      if (typeof value !== 'string' || !value.trim()) {
        return themeLayoutBuilderContent.validation.requiredProp(
          getPropDisplayName(prop),
        );
      }
    }
  }

  if (!draft.parentId) {
    return themeLayoutBuilderContent.validation.parentRequired;
  }

  if (
    draft.layoutMode === 'absolute' &&
    !draft.frameX.trim() &&
    !draft.frameLeft.trim()
  ) {
    return themeLayoutBuilderContent.validation.absoluteXRequired;
  }

  if (
    draft.layoutMode === 'absolute' &&
    !draft.frameY.trim() &&
    !draft.frameTop.trim()
  ) {
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
  const layoutMode: DraftLayoutMode =
    slot === 'footer' ? 'flow' : dropPoint ? 'absolute' : 'flow';
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
  const propEntries: [string, string | boolean][] =
    descriptor.props.map((prop) => {
      const rawValue = node.props?.[prop.name];
      return [
        prop.name,
        prop.type === 'boolean'
          ? Boolean(rawValue)
          : toFieldString(rawValue),
      ];
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

export function createNodeId(alias: string) {
  return `${alias.replace(/\./g, '-')}-${Math.random().toString(36).slice(2, 8)}`;
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
    children: CONTAINER_ALIASES.has(descriptor.alias) || descriptor.kind === 'layout'
      ? (children ?? [])
      : undefined,
  };
}

export function nextRootFlowRow(root: ThemeLayoutNode) {
  return (root.children ?? []).reduce((maxRow, child, index) => {
    if (child.slot === 'footer') {
      return maxRow;
    }

    return Math.max(maxRow, child.layout.flowRow ?? index + 1);
  }, 0) + 1;
}

export function moveNodeWithinParentInDocument(
  document: ThemeLayoutDocument,
  nodeId: string,
  targetId: string,
  position: 'before' | 'after',
) {
  const nextDocument = cloneDocument(document);
  const parentId = findParentId(nextDocument.layout, nodeId);
  const targetParentId = findParentId(nextDocument.layout, targetId);
  if (!parentId || parentId !== targetParentId) {
    return null;
  }

  const parent = findNode(nextDocument.layout, parentId);
  if (!parent?.children) {
    return null;
  }

  const fromIndex = parent.children.findIndex(
    (child) => child.id === nodeId,
  );
  const targetIndex = parent.children.findIndex(
    (child) => child.id === targetId,
  );
  if (fromIndex < 0 || targetIndex < 0) {
    return null;
  }

  const [movingNode] = parent.children.splice(fromIndex, 1);
  let insertIndex = targetIndex + (position === 'after' ? 1 : 0);
  if (fromIndex < insertIndex) {
    insertIndex -= 1;
  }

  parent.children.splice(insertIndex, 0, movingNode);
  if (parent.id === nextDocument.layout.id) {
    const targetNode = parent.children.find(
      (child) => child.id === targetId,
    );
    if (targetNode) {
      movingNode.layout.flowRow = targetNode.layout.flowRow;
    }
    normalizeRootRows(nextDocument.layout);
  } else if (parent.alias === 'core.grid') {
    normalizeGridChildren(parent);
  } else {
    normalizeChildOrder(parent);
  }

  return nextDocument;
}

export function moveNodeToParentEndInDocument(
  document: ThemeLayoutDocument,
  nodeId: string,
  parentId: string,
) {
  const nextDocument = cloneDocument(document);
  const currentParentId = findParentId(nextDocument.layout, nodeId);
  if (!currentParentId || currentParentId !== parentId) {
    return null;
  }

  const parent = findNode(nextDocument.layout, parentId);
  if (!parent?.children) {
    return null;
  }

  const fromIndex = parent.children.findIndex(
    (child) => child.id === nodeId,
  );
  if (fromIndex < 0 || fromIndex === parent.children.length - 1) {
    return null;
  }

  const [movingNode] = parent.children.splice(fromIndex, 1);
  parent.children.push(movingNode);
  if (parent.id === nextDocument.layout.id) {
    movingNode.layout.flowRow = nextRootFlowRow(nextDocument.layout);
    normalizeRootRows(nextDocument.layout);
  } else if (parent.alias === 'core.grid') {
    normalizeGridChildren(parent);
  } else {
    normalizeChildOrder(parent);
  }

  return nextDocument;
}

export function moveRootNodeToRowBoundaryInDocument(
  document: ThemeLayoutDocument,
  nodeId: string,
  targetId: string,
  position: 'before' | 'after',
) {
  const nextDocument = cloneDocument(document);
  const root = nextDocument.layout;
  const rootChildren =
    root.children?.filter((child) => child.slot !== 'footer') ?? [];
  const fromIndex = rootChildren.findIndex((child) => child.id === nodeId);
  const targetIndex = rootChildren.findIndex(
    (child) => child.id === targetId,
  );
  if (fromIndex < 0 || targetIndex < 0) {
    return null;
  }

  const movingNode = rootChildren[fromIndex];
  const targetNode = rootChildren[targetIndex];
  const targetRow = targetNode.layout.flowRow ?? targetIndex + 1;
  const temporaryRow =
    position === 'before' ? targetRow - 0.5 : targetRow + 0.5;

  movingNode.layout.flowRow = temporaryRow;
  root.children = [
    ...rootChildren,
    ...(root.children?.filter((child) => child.slot === 'footer') ?? []),
  ];
  normalizeRootRows(root);
  return nextDocument;
}

export function insertNodeRelativeToTargetInDocument(
  document: ThemeLayoutDocument,
  parentId: string,
  nextNode: ThemeLayoutNode,
  targetId: string,
  position: 'before' | 'after',
  axis: DropIndicatorAxis,
) {
  const nextDocument = cloneDocument(document);
  const parent = findNode(nextDocument.layout, parentId);
  if (!parent) {
    return null;
  }

  parent.children ??= [];

  const targetIndex = parent.children.findIndex(
    (child) => child.id === targetId,
  );
  if (targetIndex < 0) {
    return null;
  }

  const targetNode = parent.children[targetIndex];
  if (parent.id === nextDocument.layout.id) {
    const targetRow = targetNode.layout.flowRow ?? targetIndex + 1;
    if (axis === 'vertical') {
      nextNode.layout.flowRow =
        position === 'before' ? targetRow - 0.5 : targetRow + 0.5;
      nextNode.layout.order = 1;
    } else {
      const targetOrder = targetNode.layout.order ?? targetIndex + 1;
      nextNode.layout.flowRow = targetRow;
      nextNode.layout.order =
        position === 'before'
          ? targetOrder - 0.5
          : targetOrder + 0.5;
    }

    parent.children.push(nextNode);
    normalizeRootRows(nextDocument.layout);
    return nextDocument;
  }

  const insertIndex = targetIndex + (position === 'after' ? 1 : 0);
  parent.children.splice(insertIndex, 0, nextNode);
  if (parent.alias === 'core.grid') {
    normalizeGridChildren(parent);
  } else {
    normalizeChildOrder(parent);
  }
  return nextDocument;
}

export function normalizeChildOrder(parent: ThemeLayoutNode) {
  parent.children?.forEach((child, index) => {
    if (child.layout.mode !== 'absolute') {
      child.layout.order = index + 1;
    }
  });
}

function parseGridTrack(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return { start: null, span: 1 };
  }

  const startMatch = /\d+/.exec(value);
  const spanMatch = /span\s+(\d+)/i.exec(value);
  return {
    start: startMatch ? Number.parseInt(startMatch[0], 10) : null,
    span: spanMatch
      ? Math.max(1, Number.parseInt(spanMatch[1], 10))
      : 1,
  };
}

function resolveGridColumnCount(parent: ThemeLayoutNode) {
  const rawColumns = parent.props?.columns;
  if (typeof rawColumns === 'number' && Number.isFinite(rawColumns)) {
    return Math.max(1, Math.round(rawColumns));
  }

  if (typeof rawColumns === 'string') {
    const parsed = Number.parseInt(rawColumns, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(1, parsed);
    }
  }

  return 2;
}

export function normalizeGridChildren(parent: ThemeLayoutNode) {
  const children = parent.children ?? [];
  const columns = resolveGridColumnCount(parent);
  const occupancy: boolean[][] = [];

  function ensureCell(row: number, column: number) {
    while (occupancy.length < row) {
      occupancy.push(Array.from({ length: columns }, () => false));
    }

    while (occupancy[row - 1].length < column) {
      occupancy[row - 1].push(false);
    }
  }

  function canPlace(
    row: number,
    column: number,
    columnSpan: number,
    rowSpan: number,
  ) {
    if (column + columnSpan - 1 > columns) {
      return false;
    }

    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
      for (
        let columnOffset = 0;
        columnOffset < columnSpan;
        columnOffset += 1
      ) {
        ensureCell(row + rowOffset, column + columnOffset);
        if (occupancy[row + rowOffset - 1][column + columnOffset - 1]) {
          return false;
        }
      }
    }

    return true;
  }

  function place(
    row: number,
    column: number,
    columnSpan: number,
    rowSpan: number,
  ) {
    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
      for (
        let columnOffset = 0;
        columnOffset < columnSpan;
        columnOffset += 1
      ) {
        ensureCell(row + rowOffset, column + columnOffset);
        occupancy[row + rowOffset - 1][column + columnOffset - 1] = true;
      }
    }
  }

  let flowOrder = 0;
  children.forEach((child) => {
    if (child.layout.mode === 'absolute') {
      return;
    }

    flowOrder += 1;
    const columnTrack = parseGridTrack(child.layout.gridColumn);
    const rowTrack = parseGridTrack(child.layout.gridRow);
    const columnSpan = Math.min(columns, Math.max(1, columnTrack.span));
    const rowSpan = Math.max(1, rowTrack.span);

    let placedRow = 1;
    let placedColumn = 1;
    let found = false;

    for (let row = 1; !found; row += 1) {
      for (let column = 1; column <= columns - columnSpan + 1; column += 1) {
        if (!canPlace(row, column, columnSpan, rowSpan)) {
          continue;
        }

        place(row, column, columnSpan, rowSpan);
        placedRow = row;
        placedColumn = column;
        found = true;
        break;
      }
    }

    child.layout.order = flowOrder;
    child.layout.gridColumn =
      columnSpan > 1
        ? `${placedColumn} / span ${columnSpan}`
        : String(placedColumn);
    child.layout.gridRow =
      rowSpan > 1
        ? `${placedRow} / span ${rowSpan}`
        : String(placedRow);
  });
}

export function normalizeRootRows(root: ThemeLayoutNode) {
  const children = root.children ?? [];
  const bodyChildren = children.filter((child) => child.slot !== 'footer');
  const footerChildren = children.filter(
    (child) => child.slot === 'footer',
  );
  const rankedBodyChildren = bodyChildren
    .map((child, index) => ({
      child,
      index,
      sourceRow: child.layout.flowRow ?? index + 1,
      sourceOrder: child.layout.order ?? index + 1,
    }))
    .sort((left, right) => {
      if (left.sourceRow !== right.sourceRow) {
        return left.sourceRow - right.sourceRow;
      }

      if (left.sourceOrder !== right.sourceOrder) {
        return left.sourceOrder - right.sourceOrder;
      }

      return left.index - right.index;
    });
  const rowMapping = new Map<number, number>();
  let nextRow = 1;

  rankedBodyChildren.forEach(({ child, sourceRow }) => {
    if (!rowMapping.has(sourceRow)) {
      rowMapping.set(sourceRow, nextRow);
      nextRow += 1;
    }

    child.layout.flowRow = rowMapping.get(sourceRow);
  });

  bodyChildren.sort((left, right) => {
    const leftRow = left.layout.flowRow ?? 0;
    const rightRow = right.layout.flowRow ?? 0;
    if (leftRow !== rightRow) {
      return leftRow - rightRow;
    }

    return (left.layout.order ?? 0) - (right.layout.order ?? 0);
  });

  let currentRow = -1;
  let rowOrder = 0;
  bodyChildren.forEach((child) => {
    const childRow = child.layout.flowRow ?? 0;
    if (childRow !== currentRow) {
      currentRow = childRow;
      rowOrder = 1;
    } else {
      rowOrder += 1;
    }

    if (child.layout.mode !== 'absolute') {
      child.layout.order = rowOrder;
    }
  });

  root.children = [...bodyChildren, ...footerChildren];
}

export function upsertNode(
  document: ThemeLayoutDocument,
  parentId: string,
  nextNode: ThemeLayoutNode,
  targetNodeId?: string,
) {
  const nextDocument = cloneDocument(document);

  if (targetNodeId === nextDocument.layout.id) {
    nextDocument.layout = {
      ...nextNode,
      id: nextDocument.layout.id,
      children: nextDocument.layout.children,
    };
    return nextDocument;
  }

  if (targetNodeId) {
    removeNode(nextDocument.layout, targetNodeId);
  }

  const parent = findNode(nextDocument.layout, parentId);
  if (!parent) {
    return null;
  }

  parent.children ??= [];

  parent.children.push(nextNode);
  if (parent.id === nextDocument.layout.id) {
    normalizeRootRows(nextDocument.layout);
  } else {
    normalizeChildOrder(parent);
  }
  return nextDocument;
}

export function updateNodeInDocument(
  document: ThemeLayoutDocument,
  nodeId: string,
  updater: (node: ThemeLayoutNode) => void,
) {
  const nextDocument = cloneDocument(document);
  const node = findNode(nextDocument.layout, nodeId);
  if (!node) {
    return null;
  }

  updater(node);
  return nextDocument;
}

export function canAcceptNestedDrop(
  node: ThemeLayoutNode,
  componentTemplates?: Record<string, unknown>,
): boolean {
  // 1. Known core containers
  if (CONTAINER_ALIASES.has(node.alias)) { return true; }

  // 2. Custom templates whose root alias is a known container
  if (componentTemplates) {
    const template = componentTemplates[node.alias];
    if (template && typeof template === 'object' && 'root' in template) {
      const rootAlias = (template as { root: { alias: string } }).root.alias;
      if (rootAlias && CONTAINER_ALIASES.has(rootAlias)) {
        return true;
      }
    }
  }

  // 3. If the node already has children in the document, it's a container
  if (Array.isArray(node.children) && node.children.length > 0) {
    return true;
  }

  return false;
}

export function getNodeCapabilities(
  node: ThemeLayoutNode,
  descriptor: ThemeComponentDescriptor | null,
  rootId: string,
) {
  const isRoot = node.id === rootId;
  const canDragAbsolute = !isRoot && node.layout.mode === 'absolute';
  const canReorderRelative =
    !isRoot && node.layout.mode !== 'absolute';
  const canResizeWidth =
    !isRoot && !WIDTH_LOCKED_ALIASES.has(node.alias);
  const isCardLike = node.alias.includes('card');
  const canResizeHeight =
    !isRoot &&
    !HEIGHT_LOCKED_ALIASES.has(node.alias) &&
    (node.layout.mode === 'absolute' ||
      descriptor?.kind === 'layout' ||
      isCardLike);

  return {
    canDragAbsolute,
    canReorderRelative,
    canResizeWidth,
    canResizeHeight,
  };
}

export function createLibrarySampleNode(
  themeId: string,
  descriptor: ThemeComponentDescriptor,
  overrides?: Record<string, string | boolean>,
  children?: ThemeLayoutNode[],
  order?: number,
): ThemeLayoutNode {
  const defaultProps = buildDefaultProps(themeId, descriptor);

  return {
    id: createNodeId(descriptor.alias),
    alias: descriptor.alias,
    layout: {
      mode: 'flow',
      width: defaultFlowWidth(descriptor) || undefined,
      order,
    },
    props: buildPropsFromValues(descriptor, { ...defaultProps, ...overrides }),
    children,
  };
}

export function createLibrarySampleChildren(
  document: ThemeLayoutDocument,
  containerAlias: string,
): ThemeLayoutNode[] {
  const previewThemeAliases = getPreviewThemeAliases(document.themeId);
  const textDescriptor = descriptorForAlias(
    document,
    previewThemeAliases.text,
  );
  const actionDescriptor = descriptorForAlias(
    document,
    previewThemeAliases.action,
  );
  const chipDescriptor = descriptorForAlias(
    document,
    previewThemeAliases.chip,
  );

  if (!textDescriptor || !actionDescriptor) {
    return [];
  }

  return [
    createLibrarySampleNode(
      document.themeId,
      textDescriptor,
      { variant: containerAlias === 'core.panel' ? 'title' : 'body' },
      undefined,
      1,
    ),
    createLibrarySampleNode(
      document.themeId,
      actionDescriptor,
      { variant: 'primary' },
      undefined,
      2,
    ),
    containerAlias === 'core.stack' && chipDescriptor
      ? createLibrarySampleNode(
          document.themeId,
          chipDescriptor,
          undefined,
          undefined,
          3,
        )
      : null,
  ].filter((node): node is ThemeLayoutNode => Boolean(node));
}

export function createLibraryPreviewNode(
  themeId: string,
  descriptor: ThemeComponentDescriptor,
  key: string,
  overrides?: Record<string, string | boolean>,
  children?: ThemeLayoutNode[],
): ThemeLayoutNode {
  const defaultProps = buildDefaultProps(themeId, descriptor);

  return {
    id: `library-preview-${key}`,
    alias: descriptor.alias,
    layout: {
      mode: 'flow',
      width: defaultFlowWidth(descriptor) || undefined,
    },
    props: buildPropsFromValues(descriptor, { ...defaultProps, ...overrides }),
    children,
  };
}

export function createLibraryPreviewDocument(
  document: ThemeLayoutDocument,
  descriptor: ThemeComponentDescriptor,
): ThemeLayoutDocument {
  const previewPageId = document.defaultPageId;
  const previewPageName = document.pageName ?? '组件预览';

  if (
    descriptor.alias === 'core.panel' ||
    descriptor.alias === 'core.stack'
  ) {
    const previewChildren = createLibrarySampleChildren(
      document,
      descriptor.alias,
    ).map((child, index) => {
      const childDescriptor = descriptorForAlias(document, child.alias);
      if (!childDescriptor) {
        return child;
      }

      return createLibraryPreviewNode(
        document.themeId,
        childDescriptor,
        `${descriptor.alias}-${index}`,
        Object.fromEntries(
          childDescriptor.props.map((prop) => [
            prop.name,
            /* eslint-disable @typescript-eslint/no-unnecessary-condition -- child.props may be undefined at runtime */
            typeof child.props?.[prop.name] === 'boolean'
              ? Boolean(child.props?.[prop.name])
              : toFieldString(child.props?.[prop.name]),
            /* eslint-enable @typescript-eslint/no-unnecessary-condition */
          ]),
        ),
      );
    });

    const previewLayout = createLibraryPreviewNode(
      document.themeId,
      descriptor,
      descriptor.alias,
      undefined,
      previewChildren,
    );

    return normalizeThemeLayoutDocument({
      ...document,
      defaultPageId: previewPageId,
      pageName: previewPageName,
      pages: [
        {
          id: previewPageId,
          name: previewPageName,
          layout: previewLayout,
        },
      ],
      layout: previewLayout,
    });
  }

  const previewLayout = createLibraryPreviewNode(
    document.themeId,
    descriptor,
    descriptor.alias,
  );

  return normalizeThemeLayoutDocument({
    ...document,
    defaultPageId: previewPageId,
    pageName: previewPageName,
    pages: [
      {
        id: previewPageId,
        name: previewPageName,
        layout: previewLayout,
      },
    ],
    layout: previewLayout,
  });
}
