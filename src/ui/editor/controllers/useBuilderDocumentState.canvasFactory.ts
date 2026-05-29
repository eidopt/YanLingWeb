import {
  normalizeThemeLayoutDocument,
  type ThemeLayoutDocument,
  type ThemeLayoutNavigateAction,
  type ThemeLayoutNode,
  type ThemeLayoutNodeAction,
  type ThemeLayoutPage,
  type ThemeLayoutTabInteraction,
} from '../../layout/types';
import type { EditorAiEditInstruction } from '../services/aiEditInstructions';
import type { BuilderCanvas, LayoutBuilderTheme } from '../types';
import { builderDocumentStateContent as c } from './useBuilderDocumentState.content';
import {
  cloneDocument,
  CONTAINER_ALIASES,
  createBlankDocument,
  findNode,
  flattenNodes,
  normalizeRootRows,
} from 'domain/template';

export type PageCreationInstruction = Extract<
  EditorAiEditInstruction,
  { type: 'create_page' | 'create_page_from_reference' | 'insert_node' }
>;
export type PageDeletionInstruction = Extract<EditorAiEditInstruction, { type: 'delete_page' }>;

export function createCanvasId() {
  return `canvas-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCanvasName(index: number) {
  return `${c.defaultCanvasNamePrefix}${index + 1}`;
}

function createPageId(index: number) {
  return `ai-page-${index + 1}`;
}

function createRootNodeId(pageId: string) {
  return `${pageId}-screen`;
}

function getStringProp(props: Record<string, unknown> | undefined, name: string) {
  const value = props?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function firstNonEmpty(...values: (string | undefined)[]) {
  return values.find((value) => Boolean(value?.trim()))?.trim() ?? '';
}

export function getInstructionPageId(instruction: EditorAiEditInstruction) {
  return 'pageId' in instruction && typeof instruction.pageId === 'string' ? instruction.pageId.trim() : '';
}

export function getInstructionRootNodeId(instruction: EditorAiEditInstruction) {
  if (instruction.type === 'create_page' || instruction.type === 'create_page_from_reference') {
    return instruction.rootNodeId?.trim() ?? '';
  }
  if (instruction.type === 'insert_node') {
    return instruction.nodeId?.trim() ?? '';
  }
  return '';
}

export function getRootNodePageAlias(rootNodeId: string) {
  return rootNodeId.endsWith('-screen') ? rootNodeId.slice(0, -'-screen'.length).trim() : '';
}

export function withResolvedNodeAliases(
  instruction: EditorAiEditInstruction,
  resolveNodeId: (nodeId: string | undefined) => string | undefined,
): EditorAiEditInstruction {
  switch (instruction.type) {
    case 'create_page':
    case 'create_page_from_reference':
    case 'delete_page':
    case 'sync_page_navigation':
    case 'sync_footer_tabs':
      return instruction;
    case 'insert_node':
      return {
        ...instruction,
        parentId: resolveNodeId(instruction.parentId),
        targetId: resolveNodeId(instruction.targetId),
      };
    case 'clone_pattern_items':
      return {
        ...instruction,
        sourceRootNodeId: resolveNodeId(instruction.sourceRootNodeId) ?? instruction.sourceRootNodeId,
        parentId: resolveNodeId(instruction.parentId),
      };
    case 'update_props':
    case 'set_layout':
    case 'set_frame':
    case 'delete_node':
    case 'update_interactions':
      return {
        ...instruction,
        nodeId: resolveNodeId(instruction.nodeId) ?? instruction.nodeId,
      };
    case 'move_node':
      return {
        ...instruction,
        nodeId: resolveNodeId(instruction.nodeId) ?? instruction.nodeId,
        parentId: resolveNodeId(instruction.parentId),
        targetId: resolveNodeId(instruction.targetId),
      };
  }
}

function isRootScreenInsert(
  instruction: EditorAiEditInstruction,
): instruction is Extract<EditorAiEditInstruction, { type: 'insert_node' }> {
  return instruction.type === 'insert_node' && instruction.alias === 'core.screen';
}

export function isPageCreationInstruction(
  instruction: EditorAiEditInstruction,
): instruction is PageCreationInstruction {
  return (
    instruction.type === 'create_page' ||
    instruction.type === 'create_page_from_reference' ||
    isRootScreenInsert(instruction)
  );
}

export function isPageDeletionInstruction(
  instruction: EditorAiEditInstruction,
): instruction is PageDeletionInstruction {
  return instruction.type === 'delete_page';
}

export function isPageNavigationSyncInstruction(instruction: EditorAiEditInstruction) {
  return instruction.type === 'sync_page_navigation' || instruction.type === 'sync_footer_tabs';
}

export function needsMultiPageContext(instruction: EditorAiEditInstruction) {
  return (
    isPageCreationInstruction(instruction) ||
    isPageDeletionInstruction(instruction) ||
    isPageNavigationSyncInstruction(instruction) ||
    instruction.type === 'clone_pattern_items'
  );
}

function findFooterTabs(document: ThemeLayoutDocument) {
  return flattenNodes(document.layout)
    .map(({ node }) => node)
    .filter((node) => node.alias === 'core.tabs' && node.slot === 'footer');
}

function getActiveTabLabel(canvas: BuilderCanvas) {
  const footers = findFooterTabs(canvas.document);
  if (!footers.length) {
    return firstNonEmpty(canvas.document.pageName, canvas.name);
  }

  const activeTab = footers[0].props?.activeTab;
  if (typeof activeTab === 'string' && activeTab.trim()) {
    return activeTab.trim();
  }

  return firstNonEmpty(canvas.document.pageName, canvas.name);
}

function uniquePageTabLabel(label: string, usedLabels: Set<string>) {
  const base = label.trim() || c.defaultCanvasNamePrefix.trim() || c.fallbackPageName;
  if (!usedLabels.has(base)) {
    usedLabels.add(base);
    return base;
  }

  let index = 2;
  let candidate = `${base} ${index}`;
  while (usedLabels.has(candidate)) {
    index += 1;
    candidate = `${base} ${index}`;
  }
  usedLabels.add(candidate);
  return candidate;
}

function createPageTabEntries(canvases: BuilderCanvas[]) {
  const usedLabels = new Set<string>();
  return canvases.map((canvas, index) => {
    const fallbackName = createCanvasName(index);
    const label = uniquePageTabLabel(
      firstNonEmpty(getActiveTabLabel(canvas), canvas.document.pageName, canvas.name, fallbackName),
      usedLabels,
    );
    return {
      canvasId: canvas.id,
      label,
      pageId: canvas.document.defaultPageId,
    };
  });
}

function createFooterNodeId(document: ThemeLayoutDocument) {
  const baseId = `${document.defaultPageId}-footer`;
  if (!findNode(document.layout, baseId)) {
    return baseId;
  }

  let index = 2;
  let candidate = `${baseId}-${index}`;
  while (findNode(document.layout, candidate)) {
    index += 1;
    candidate = `${baseId}-${index}`;
  }
  return candidate;
}

function createDefaultFooterTabs(canvas: BuilderCanvas) {
  const activeTab = firstNonEmpty(canvas.document.pageName, canvas.name, canvas.document.defaultPageId);
  return {
    id: createFooterNodeId(canvas.document),
    alias: 'core.tabs',
    slot: 'footer' as const,
    layout: { mode: 'flow' as const, order: 1, width: '100%' },
    props: { tabs: [activeTab], activeTab },
  };
}

export function syncPageNavigation(canvases: BuilderCanvas[]) {
  const tabEntries = createPageTabEntries(canvases);
  const tabs = tabEntries.map((entry) => entry.label);
  const labelToPageId = new Map(tabEntries.map((entry) => [entry.label, entry.pageId]));
  const templateFooter = canvases.flatMap((canvas) => findFooterTabs(canvas.document)).find(Boolean);

  canvases.forEach((canvas) => {
    let footers = findFooterTabs(canvas.document);
    if (!footers.length) {
      const clonedFooter = templateFooter ? structuredClone(templateFooter) : createDefaultFooterTabs(canvas);
      clonedFooter.id = createFooterNodeId(canvas.document);
      clonedFooter.slot = 'footer';
      clonedFooter.layout = {
        ...clonedFooter.layout,
        mode: 'flow',
        order: 1,
        width: '100%',
      };
      canvas.document.layout.children ??= [];
      canvas.document.layout.children.push(clonedFooter);
      normalizeRootRows(canvas.document.layout);
      footers = [clonedFooter];
    }

    footers.forEach((footer) => {
      const activeTab = tabEntries.find((entry) => entry.canvasId === canvas.id)?.label ?? getActiveTabLabel(canvas);
      const onTabClick = Object.fromEntries(
        tabs
          .map((label) => {
            const targetPageId = labelToPageId.get(label);
            return targetPageId ? [label, { type: 'navigate' as const, targetPageId }] : null;
          })
          .filter((entry): entry is [string, { type: 'navigate'; targetPageId: string }] => Boolean(entry)),
      );

      footer.props = {
        ...(footer.props ?? {}),
        tabs,
        activeTab,
      };
      footer.interactions = {
        ...(footer.interactions ?? {}),
        onTabClick,
      };
    });
  });

  return canvases;
}

function createDocumentFromPage(themeDocument: ThemeLayoutDocument, page: ThemeLayoutPage): ThemeLayoutDocument {
  return normalizeThemeLayoutDocument({
    ...themeDocument,
    pageName: page.name,
    defaultPageId: page.id,
    pages: [structuredClone(page)],
    layout: structuredClone(page.layout),
  });
}

export function createCanvasesFromTheme(theme: LayoutBuilderTheme): BuilderCanvas[] {
  return theme.layoutDocument.pages.map((page) => {
    const defaultName = page.name.trim() || theme.name;

    return {
      id: createCanvasId(),
      name: defaultName,
      defaultName,
      themeId: theme.id,
      document: createDocumentFromPage(theme.layoutDocument, page),
    };
  });
}

export function createCanvasFromTheme(theme: LayoutBuilderTheme, index: number, blank = false): BuilderCanvas {
  const defaultName = blank
    ? createCanvasName(index)
    : /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- 空字符串需要继续回退到下一个选项 */
      theme.layoutDocument.pageName?.trim() ||
      theme.layoutDocument.layout.props?.title?.toString().trim() ||
      theme.name;
  /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
  const document = blank ? createBlankDocument(theme.layoutDocument) : cloneDocument(theme.layoutDocument);
  document.pageName = defaultName;

  return {
    id: createCanvasId(),
    name: defaultName,
    defaultName,
    themeId: theme.id,
    document,
  };
}

export function createCanvasFromAiPageInstruction(
  theme: LayoutBuilderTheme,
  index: number,
  instruction: EditorAiEditInstruction,
): BuilderCanvas {
  const insertedRootId = instruction.type === 'insert_node' ? instruction.nodeId : undefined;
  const requestedPageId = instruction.type === 'create_page' ? instruction.pageId : undefined;
  const props = 'props' in instruction ? instruction.props : undefined;
  const title = getStringProp(props, 'title');
  const fallbackName = title ? title : createCanvasName(index);
  const name = instruction.type === 'create_page' && instruction.name?.trim() ? instruction.name.trim() : fallbackName;
  const pageId = firstNonEmpty(requestedPageId, insertedRootId?.replace(/-screen$/, ''), createPageId(index));
  const rootNodeId = firstNonEmpty(
    instruction.type === 'create_page' ? instruction.rootNodeId : insertedRootId,
    createRootNodeId(pageId),
  );
  const document = createBlankDocument(theme.layoutDocument);
  const root = document.layout;

  root.id = rootNodeId;
  root.props = {
    ...(root.props ?? {}),
    ...(props ?? {}),
    title: getStringProp(props, 'title') || name,
  };
  if ('layout' in instruction && instruction.layout) {
    root.layout = {
      ...root.layout,
      ...instruction.layout,
    };
  }
  root.children = [];

  document.defaultPageId = pageId;
  document.pageName = name;
  document.layout = root;
  document.pages = [{ id: pageId, name, layout: root }];

  return {
    id: createCanvasId(),
    name,
    defaultName: name,
    themeId: theme.id,
    document,
  };
}

function slugNodeId(value: string) {
  const slug = value
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'node';
}

function collectCanvasNodeIds(canvases: readonly BuilderCanvas[]) {
  const ids = new Set<string>();
  const walk = (node: ThemeLayoutNode) => {
    ids.add(node.id);
    node.children?.forEach(walk);
  };
  canvases.forEach((canvas) => walk(canvas.document.layout));
  return ids;
}

function uniqueNodeId(baseId: string, usedIds: Set<string>) {
  let candidate = baseId;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function remapReferenceNodeId(referenceNodeId: string, referencePageId: string, pageId: string) {
  if (referenceNodeId === `${referencePageId}-screen`) {
    return `${pageId}-screen`;
  }
  if (referenceNodeId.startsWith(`${referencePageId}-`)) {
    return `${pageId}-${referenceNodeId.slice(referencePageId.length + 1)}`;
  }
  return `${pageId}-${slugNodeId(referenceNodeId)}`;
}

function rewriteNavigateActionTarget(
  action: ThemeLayoutNavigateAction | undefined,
  referencePageId: string,
  pageId: string,
): ThemeLayoutNavigateAction | undefined {
  if (!action) {
    return undefined;
  }
  return action.targetPageId === referencePageId ? { ...action, targetPageId: pageId } : action;
}

function rewriteNodeActionTarget(
  action: ThemeLayoutNodeAction | undefined,
  referencePageId: string,
  pageId: string,
): ThemeLayoutNodeAction | undefined {
  if (!action) {
    return undefined;
  }
  if (action.type === 'navigate') {
    return rewriteNavigateActionTarget(action, referencePageId, pageId);
  }
  return {
    ...action,
    targetNodeId: remapReferenceNodeId(action.targetNodeId, referencePageId, pageId),
  };
}

function isNavigateAction(interaction: ThemeLayoutTabInteraction): interaction is ThemeLayoutNavigateAction {
  return 'type' in interaction && interaction.type === 'navigate';
}

function rewriteTabInteractionTargets(
  interaction: ThemeLayoutTabInteraction | undefined,
  referencePageId: string,
  pageId: string,
): ThemeLayoutTabInteraction | undefined {
  if (!interaction) {
    return undefined;
  }
  if (isNavigateAction(interaction)) {
    return rewriteNavigateActionTarget(interaction, referencePageId, pageId);
  }
  return Object.fromEntries(
    Object.entries(interaction).map(([label, action]) => [
      label,
      rewriteNavigateActionTarget(action, referencePageId, pageId) ?? action,
    ]),
  );
}

function rewriteInteractionTargets(
  interactions: ThemeLayoutNode['interactions'],
  referencePageId: string,
  pageId: string,
): ThemeLayoutNode['interactions'] {
  if (!interactions) {
    return undefined;
  }
  return {
    ...interactions,
    onClick: rewriteNodeActionTarget(interactions.onClick, referencePageId, pageId),
    onActionClick: rewriteNodeActionTarget(interactions.onActionClick, referencePageId, pageId),
    onStatusClick: rewriteNodeActionTarget(interactions.onStatusClick, referencePageId, pageId),
    onTabClick: rewriteTabInteractionTargets(interactions.onTabClick, referencePageId, pageId),
  };
}

function cloneReferenceNode(
  node: ThemeLayoutNode,
  options: {
    idMap: Map<string, string>;
    omitIds: Set<string>;
    pageId: string;
    referencePageId: string;
    rootNodeId: string;
    usedIds: Set<string>;
    isRoot?: boolean;
  },
): ThemeLayoutNode | null {
  if (!options.isRoot && options.omitIds.has(node.id)) {
    return null;
  }
  const nextId = uniqueNodeId(
    options.isRoot ? options.rootNodeId : remapReferenceNodeId(node.id, options.referencePageId, options.pageId),
    options.usedIds,
  );
  options.idMap.set(node.id, nextId);
  const cloned: ThemeLayoutNode = {
    ...structuredClone(node),
    id: nextId,
    interactions: rewriteInteractionTargets(node.interactions, options.referencePageId, options.pageId),
  };
  cloned.children = (node.children ?? [])
    .map((child) => cloneReferenceNode(child, { ...options, isRoot: false }))
    .filter((child): child is ThemeLayoutNode => Boolean(child));
  if (!cloned.children.length && !CONTAINER_ALIASES.has(cloned.alias)) {
    delete cloned.children;
  }
  return cloned;
}

export function createCanvasFromReferencePageInstruction(
  theme: LayoutBuilderTheme,
  referenceCanvas: BuilderCanvas,
  canvases: readonly BuilderCanvas[],
  instruction: Extract<EditorAiEditInstruction, { type: 'create_page_from_reference' }>,
): { canvas: BuilderCanvas; idMap: Map<string, string> } {
  const name = instruction.name.trim() || createCanvasName(canvases.length);
  const pageId = firstNonEmpty(instruction.pageId, createPageId(canvases.length));
  const rootNodeId = firstNonEmpty(instruction.rootNodeId, createRootNodeId(pageId));
  const idMap = new Map<string, string>();
  const root =
    cloneReferenceNode(referenceCanvas.document.layout, {
      idMap,
      omitIds: new Set(
        (instruction.omitReferenceNodeIds ?? [])
          .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          .map((value) => value.trim()),
      ),
      pageId,
      referencePageId: referenceCanvas.document.defaultPageId,
      rootNodeId,
      usedIds: collectCanvasNodeIds(canvases),
      isRoot: true,
    }) ?? structuredClone(referenceCanvas.document.layout);
  const rootProps = instruction.rootProps ?? {};
  root.props = {
    ...(root.props ?? {}),
    ...rootProps,
    title: getStringProp(rootProps, 'title') || name,
  };
  normalizeRootRows(root);

  const document = normalizeThemeLayoutDocument({
    ...theme.layoutDocument,
    pageName: name,
    defaultPageId: pageId,
    pages: [{ id: pageId, name, layout: root }],
    layout: root,
  });

  return {
    canvas: {
      id: createCanvasId(),
      name,
      defaultName: name,
      themeId: theme.id,
      document,
    },
    idMap,
  };
}

export function validateReferencePageInstructionShape(
  instruction: Extract<EditorAiEditInstruction, { type: 'create_page_from_reference' }>,
) {
  if (instruction.referenceNodeUpdates !== undefined && !Array.isArray(instruction.referenceNodeUpdates)) {
    return c.referenceNodeUpdatesArrayRequired;
  }
  if (instruction.omitReferenceNodeIds !== undefined && !Array.isArray(instruction.omitReferenceNodeIds)) {
    return c.omitReferenceNodeIdsArrayRequired;
  }
  return '';
}
