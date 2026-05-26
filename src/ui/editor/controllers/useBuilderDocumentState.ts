import {
  normalizeThemeLayoutDocument,
  type ThemeLayoutDocument,
  type ThemeLayoutNavigateAction,
  type ThemeLayoutNode,
  type ThemeLayoutPage,
  type ThemeLayoutTabInteraction,
} from '../../layout/types';
import {
  type DynamicThemeScreenPreset,
  getDefaultPreviewScreenPreset,
} from '../../renderer';
import {
  applyEditorAiEditInstructions,
  type ApplyEditorAiEditInstructionsOptions,
  type ApplyEditorAiEditInstructionsResult,
  type EditorAiEditInstruction,
} from '../services/aiEditInstructions';
import {
  buildNodeFromDraft,
  cloneDocument,
  CONTAINER_ALIASES,
  createBlankDocument,
  createDraft,
  createLibrarySampleChildren,
  descriptorForAlias,
  type DropIndicatorAxis,
  findNode,
  flattenNodes,
  FOOTER_ALIASES,
  insertNodeRelativeToTargetInDocument,
  moveNodeToParentEndInDocument,
  moveNodeWithinParentInDocument,
  moveRootNodeToRowBoundaryInDocument,
  nextRootFlowRow,
  normalizeRootRows,
  removeNode,
  updateNodeInDocument,
  upsertNode,
} from '../services/layoutBuilderService';
import type { BuilderCanvas, LayoutBuilderTheme } from '../types';
import { builderDocumentStateContent as c } from './useBuilderDocumentState.content';
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';

type PageCreationInstruction = Extract<
  EditorAiEditInstruction,
  { type: 'create_page' | 'create_page_from_reference' | 'insert_node' }
>;
type PageDeletionInstruction = Extract<
  EditorAiEditInstruction,
  { type: 'delete_page' }
>;

function createCanvasId() {
  return `canvas-${Math.random().toString(36).slice(2, 8)}`;
}

function createCanvasName(index: number) {
  return `${c.defaultCanvasNamePrefix}${index + 1}`;
}

function createPageId(index: number) {
  return `ai-page-${index + 1}`;
}

function createRootNodeId(pageId: string) {
  return `${pageId}-screen`;
}

function getStringProp(
  props: Record<string, unknown> | undefined,
  name: string,
) {
  const value = props?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function firstNonEmpty(...values: (string | undefined)[]) {
  return values.find((value) => Boolean(value?.trim()))?.trim() ?? '';
}

function getInstructionPageId(instruction: EditorAiEditInstruction) {
  return 'pageId' in instruction && typeof instruction.pageId === 'string'
    ? instruction.pageId.trim()
    : '';
}

function getInstructionRootNodeId(instruction: EditorAiEditInstruction) {
  if (
    instruction.type === 'create_page' ||
    instruction.type === 'create_page_from_reference'
  ) {
    return instruction.rootNodeId?.trim() ?? '';
  }
  if (instruction.type === 'insert_node') {
    return instruction.nodeId?.trim() ?? '';
  }
  return '';
}

function getRootNodePageAlias(rootNodeId: string) {
  return rootNodeId.endsWith('-screen')
    ? rootNodeId.slice(0, -'-screen'.length).trim()
    : '';
}

function withResolvedNodeAliases(
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

function isPageCreationInstruction(
  instruction: EditorAiEditInstruction,
): instruction is PageCreationInstruction {
  return (
    instruction.type === 'create_page' ||
    instruction.type === 'create_page_from_reference' ||
    isRootScreenInsert(instruction)
  );
}

function isPageDeletionInstruction(
  instruction: EditorAiEditInstruction,
): instruction is PageDeletionInstruction {
  return instruction.type === 'delete_page';
}

function isPageNavigationSyncInstruction(instruction: EditorAiEditInstruction) {
  return (
    instruction.type === 'sync_page_navigation' ||
    instruction.type === 'sync_footer_tabs'
  );
}

function needsMultiPageContext(instruction: EditorAiEditInstruction) {
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
  const base = label.trim() || c.defaultCanvasNamePrefix.trim() || '页面';
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
  const activeTab = firstNonEmpty(
    canvas.document.pageName,
    canvas.name,
    canvas.document.defaultPageId,
  );
  return {
    id: createFooterNodeId(canvas.document),
    alias: 'core.tabs',
    slot: 'footer' as const,
    layout: { mode: 'flow' as const, order: 1, width: '100%' },
    props: { tabs: [activeTab], activeTab },
  };
}

function syncPageNavigation(canvases: BuilderCanvas[]) {
  const tabEntries = createPageTabEntries(canvases);
  const tabs = tabEntries.map((entry) => entry.label);
  const labelToPageId = new Map(
    tabEntries.map((entry) => [entry.label, entry.pageId]),
  );
  const templateFooter = canvases
    .flatMap((canvas) => findFooterTabs(canvas.document))
    .find(Boolean);

  canvases.forEach((canvas) => {
    let footers = findFooterTabs(canvas.document);
    if (!footers.length) {
      const clonedFooter = templateFooter
        ? structuredClone(templateFooter)
        : createDefaultFooterTabs(canvas);
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
      const activeTab =
        tabEntries.find((entry) => entry.canvasId === canvas.id)?.label ??
        getActiveTabLabel(canvas);
      const onTabClick = Object.fromEntries(
        tabs
          .map((label) => {
            const targetPageId = labelToPageId.get(label);
            return targetPageId
              ? [label, { type: 'navigate' as const, targetPageId }]
              : null;
          })
          .filter((entry): entry is [
            string,
            { type: 'navigate'; targetPageId: string },
          ] => Boolean(entry)),
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

function createDocumentFromPage(
  themeDocument: ThemeLayoutDocument,
  page: ThemeLayoutPage,
): ThemeLayoutDocument {
  return normalizeThemeLayoutDocument({
    ...themeDocument,
    pageName: page.name,
    defaultPageId: page.id,
    pages: [structuredClone(page)],
    layout: structuredClone(page.layout),
  });
}

function createCanvasesFromTheme(theme: LayoutBuilderTheme): BuilderCanvas[] {
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

function createCanvasFromTheme(
  theme: LayoutBuilderTheme,
  index: number,
  blank = false,
): BuilderCanvas {
  const defaultName = blank
    ? createCanvasName(index)
    /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through */
    : theme.layoutDocument.pageName?.trim()
      || theme.layoutDocument.layout.props?.title?.toString().trim()
      || theme.name;
    /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
  const document = blank
    ? createBlankDocument(theme.layoutDocument)
    : cloneDocument(theme.layoutDocument);
  document.pageName = defaultName;

  return {
    id: createCanvasId(),
    name: defaultName,
    defaultName,
    themeId: theme.id,
    document,
  };
}

function createCanvasFromAiPageInstruction(
  theme: LayoutBuilderTheme,
  index: number,
  instruction: EditorAiEditInstruction,
): BuilderCanvas {
  const insertedRootId =
    instruction.type === 'insert_node' ? instruction.nodeId : undefined;
  const requestedPageId =
    instruction.type === 'create_page' ? instruction.pageId : undefined;
  const props = 'props' in instruction ? instruction.props : undefined;
  const title = getStringProp(props, 'title');
  const fallbackName = title ? title : createCanvasName(index);
  const name =
    instruction.type === 'create_page' && instruction.name?.trim()
      ? instruction.name.trim()
      : fallbackName;
  const pageId = firstNonEmpty(
    requestedPageId,
    insertedRootId?.replace(/-screen$/, ''),
    createPageId(index),
  );
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

function remapReferenceNodeId(
  referenceNodeId: string,
  referencePageId: string,
  pageId: string,
) {
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
  return action.targetPageId === referencePageId
    ? { ...action, targetPageId: pageId }
    : action;
}

function isNavigateAction(
  interaction: ThemeLayoutTabInteraction,
): interaction is ThemeLayoutNavigateAction {
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
    onClick: rewriteNavigateActionTarget(interactions.onClick, referencePageId, pageId),
    onActionClick: rewriteNavigateActionTarget(interactions.onActionClick, referencePageId, pageId),
    onStatusClick: rewriteNavigateActionTarget(interactions.onStatusClick, referencePageId, pageId),
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
    options.isRoot
      ? options.rootNodeId
      : remapReferenceNodeId(node.id, options.referencePageId, options.pageId),
    options.usedIds,
  );
  options.idMap.set(node.id, nextId);
  const cloned: ThemeLayoutNode = {
    ...structuredClone(node),
    id: nextId,
    interactions: rewriteInteractionTargets(
      node.interactions,
      options.referencePageId,
      options.pageId,
    ),
  };
  cloned.children = (node.children ?? [])
    .map((child) => cloneReferenceNode(child, { ...options, isRoot: false }))
    .filter((child): child is ThemeLayoutNode => Boolean(child));
  if (!cloned.children.length && !CONTAINER_ALIASES.has(cloned.alias)) {
    delete cloned.children;
  }
  return cloned;
}

function createCanvasFromReferencePageInstruction(
  theme: LayoutBuilderTheme,
  referenceCanvas: BuilderCanvas,
  canvases: readonly BuilderCanvas[],
  instruction: Extract<EditorAiEditInstruction, { type: 'create_page_from_reference' }>,
): { canvas: BuilderCanvas; idMap: Map<string, string> } {
  const name = instruction.name.trim() || createCanvasName(canvases.length);
  const pageId = firstNonEmpty(instruction.pageId, createPageId(canvases.length));
  const rootNodeId = firstNonEmpty(instruction.rootNodeId, createRootNodeId(pageId));
  const idMap = new Map<string, string>();
  const root = cloneReferenceNode(referenceCanvas.document.layout, {
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

function validateReferencePageInstructionShape(
  instruction: Extract<EditorAiEditInstruction, { type: 'create_page_from_reference' }>,
) {
  if (
    instruction.referenceNodeUpdates !== undefined &&
    !Array.isArray(instruction.referenceNodeUpdates)
  ) {
    return 'referenceNodeUpdates 必须是数组';
  }
  if (
    instruction.omitReferenceNodeIds !== undefined &&
    !Array.isArray(instruction.omitReferenceNodeIds)
  ) {
    return 'omitReferenceNodeIds 必须是数组';
  }
  return '';
}

interface ApplyAiEditInstructionsToCanvasesInput {
  canvases: BuilderCanvas[];
  activeCanvasId: string;
  activeTheme: LayoutBuilderTheme;
  instructions: readonly EditorAiEditInstruction[];
  options?: ApplyEditorAiEditInstructionsOptions;
}

interface ApplyAiEditInstructionsToCanvasesResult
  extends ApplyEditorAiEditInstructionsResult {
  canvases: BuilderCanvas[];
  activeCanvasId: string;
}

export function applyAiEditInstructionsToCanvases({
  canvases,
  activeCanvasId,
  activeTheme,
  instructions,
  options,
}: ApplyAiEditInstructionsToCanvasesInput): ApplyAiEditInstructionsToCanvasesResult {
  const activeCanvas =
    canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0];
  const nextCanvases = canvases.map((canvas) => ({
    ...canvas,
    document: cloneDocument(canvas.document),
  }));
  const applied: string[] = [];
  const errors: string[] = [];
  const pageIdAliases = new Map<string, string>();
  const nodeIdAliases = new Map<string, string>();
  const newlyCreatedCanvasIds = new Set<string>();
  let activeWorkingCanvasId = activeCanvas.id;
  let selectedNodeIdFromAi: string | null | undefined;
  let aborted = false;

  function findCanvasIndexById(canvasId: string) {
    return nextCanvases.findIndex((canvas) => canvas.id === canvasId);
  }

  function findCanvasIndexByPageId(pageId: string) {
    return nextCanvases.findIndex(
      (canvas) => canvas.document.defaultPageId === pageId,
    );
  }

  function rememberPageIdAlias(alias: string | undefined, pageId: string) {
    const normalizedAlias = alias?.trim();
    if (!normalizedAlias || normalizedAlias === pageId) {
      return;
    }
    pageIdAliases.set(normalizedAlias, pageId);
  }

  function rememberNodeIdAlias(alias: string | undefined, nodeId: string) {
    const normalizedAlias = alias?.trim();
    if (!normalizedAlias || normalizedAlias === nodeId) {
      return;
    }
    nodeIdAliases.set(normalizedAlias, nodeId);
  }

  function rememberCreatedPageAliases(
    instruction: PageCreationInstruction,
    canvas: BuilderCanvas,
  ) {
    const pageId = canvas.document.defaultPageId;
    const rootNodeId = getInstructionRootNodeId(instruction);
    const createdRootNodeId = canvas.document.layout.id;
    rememberPageIdAlias(getInstructionPageId(instruction), pageId);
    rememberPageIdAlias(rootNodeId, pageId);
    rememberPageIdAlias(getRootNodePageAlias(rootNodeId), pageId);
    rememberPageIdAlias(createdRootNodeId, pageId);
    rememberPageIdAlias(getRootNodePageAlias(createdRootNodeId), pageId);
    rememberPageIdAlias(canvas.name, pageId);
    rememberPageIdAlias(canvas.document.pageName, pageId);

    rememberNodeIdAlias(getInstructionPageId(instruction), createdRootNodeId);
    rememberNodeIdAlias(rootNodeId, createdRootNodeId);
    rememberNodeIdAlias(getRootNodePageAlias(rootNodeId), createdRootNodeId);
    rememberNodeIdAlias(getRootNodePageAlias(createdRootNodeId), createdRootNodeId);
    rememberNodeIdAlias(canvas.name, createdRootNodeId);
    rememberNodeIdAlias(canvas.document.pageName, createdRootNodeId);
  }

  function rememberReferenceNodeAliases(idMap: Map<string, string>) {
    idMap.forEach((newNodeId, referenceNodeId) => {
      rememberNodeIdAlias(referenceNodeId, newNodeId);
    });
  }

  function resolvePageIdAlias(pageId: string) {
    return pageIdAliases.get(pageId) ?? pageId;
  }

  function resolveNodeIdAlias(nodeId: string | undefined) {
    if (!nodeId) {
      return undefined;
    }
    return nodeIdAliases.get(nodeId) ?? nodeId;
  }

  function findCanvasIndexForInstruction(instruction: EditorAiEditInstruction) {
    const requestedPageId = getInstructionPageId(instruction);
    if (!requestedPageId) {
      return findCanvasIndexById(activeWorkingCanvasId);
    }

    const resolvedPageId = resolvePageIdAlias(requestedPageId);
    const resolvedCanvasIndex = findCanvasIndexByPageId(resolvedPageId);
    if (resolvedCanvasIndex >= 0) {
      return resolvedCanvasIndex;
    }

    const activeCanvasIndex = findCanvasIndexById(activeWorkingCanvasId);
    if (
      activeCanvasIndex >= 0 &&
      newlyCreatedCanvasIds.has(activeWorkingCanvasId)
    ) {
      rememberPageIdAlias(
        requestedPageId,
        nextCanvases[activeCanvasIndex].document.defaultPageId,
      );
      return activeCanvasIndex;
    }

    return -1;
  }

  function findCanvasIndexForPageDeletion(
    instruction: PageDeletionInstruction,
  ) {
    const pageId = getInstructionPageId(instruction);
    if (pageId) {
      return findCanvasIndexByPageId(resolvePageIdAlias(pageId));
    }

    const name = instruction.name?.trim();
    if (!name) {
      return -1;
    }

    return nextCanvases.findIndex((canvas) => (
      canvas.name === name || canvas.document.pageName === name
    ));
  }

  function findCanvasIndexForReferencePage(
    instruction: Extract<EditorAiEditInstruction, { type: 'create_page_from_reference' }>,
  ) {
    const referencePageId = resolvePageIdAlias(instruction.referencePageId.trim());
    const byPageId = findCanvasIndexByPageId(referencePageId);
    if (byPageId >= 0) {
      return byPageId;
    }
    return nextCanvases.findIndex((canvas) => (
      canvas.name === instruction.referencePageId ||
      canvas.document.pageName === instruction.referencePageId
    ));
  }

  function describePageDeletionTarget(instruction: PageDeletionInstruction) {
    return firstNonEmpty(getInstructionPageId(instruction), instruction.name)
      || '未指定页面';
  }

  function selectFallbackCanvasAfterDeletion(deletedIndex: number) {
    return (
      nextCanvases[Math.min(deletedIndex, nextCanvases.length - 1)] ??
      nextCanvases[0]
    );
  }

  instructions.forEach((instruction, index) => {
    if (aborted) {
      return;
    }

    if (isPageCreationInstruction(instruction)) {
      if (instruction.type === 'create_page_from_reference') {
        const shapeError = validateReferencePageInstructionShape(instruction);
        if (shapeError) {
          errors.push(`第 ${index + 1} 条：${shapeError}`);
          aborted = true;
          return;
        }
        const referenceCanvasIndex = findCanvasIndexForReferencePage(instruction);
        if (referenceCanvasIndex < 0) {
          errors.push(
            `第 ${index + 1} 条：未找到参考页面：${instruction.referencePageId}`,
          );
          aborted = true;
          return;
        }
        const created = createCanvasFromReferencePageInstruction(
          activeTheme,
          nextCanvases[referenceCanvasIndex],
          nextCanvases,
          instruction,
        );
        let createdCanvas = created.canvas;
        let createdUpdateApplied: string[] = [];
        const updateInstructions: EditorAiEditInstruction[] = [];
        for (const update of instruction.referenceNodeUpdates ?? []) {
          if (!update.referenceNodeId) {
            errors.push(`第 ${index + 1} 条：referenceNodeUpdates 缺少 referenceNodeId`);
            aborted = true;
            return;
          }
          const targetNodeId = created.idMap.get(update.referenceNodeId);
          if (!targetNodeId) {
            errors.push(
              `第 ${index + 1} 条：参考节点未复制：${update.referenceNodeId}`,
            );
            aborted = true;
            return;
          }
          updateInstructions.push({
            type: 'update_props',
            pageId: created.canvas.document.defaultPageId,
            nodeId: targetNodeId,
            props: update.props,
            select: false,
          });
        }
        if (updateInstructions.length > 0) {
          const result = applyEditorAiEditInstructions(
            createdCanvas.document,
            updateInstructions,
            options,
          );
          if (result.errors.length > 0) {
            errors.push(
              ...result.errors.map((error) =>
                error.replace(/^第 \d+ 条：/, `第 ${index + 1} 条：`),
              ),
            );
            aborted = true;
            return;
          }
          createdCanvas = {
            ...createdCanvas,
            document: result.document,
          };
          createdUpdateApplied = result.applied;
        }

        nextCanvases.push(createdCanvas);
        activeWorkingCanvasId = createdCanvas.id;
        newlyCreatedCanvasIds.add(createdCanvas.id);
        rememberCreatedPageAliases(instruction, createdCanvas);
        rememberReferenceNodeAliases(created.idMap);
        applied.push(`基于参考页面创建 ${createdCanvas.name}`);
        applied.push(...createdUpdateApplied);
        selectedNodeIdFromAi =
          instruction.select === false ? undefined : createdCanvas.document.layout.id;
        return;
      }

      const nextCanvas = createCanvasFromAiPageInstruction(
        activeTheme,
        nextCanvases.length,
        instruction,
      );
      nextCanvases.push(nextCanvas);
      activeWorkingCanvasId = nextCanvas.id;
      newlyCreatedCanvasIds.add(nextCanvas.id);
      rememberCreatedPageAliases(instruction, nextCanvas);
      applied.push(`创建页面 ${nextCanvas.name}`);
      const shouldSelectNewPageRoot =
        instruction.type === 'insert_node'
        || instruction.activate !== false;
      if (shouldSelectNewPageRoot) {
        selectedNodeIdFromAi =
          instruction.select === false ? undefined : nextCanvas.document.layout.id;
      }
      return;
    }

    if (isPageDeletionInstruction(instruction)) {
      if (nextCanvases.length <= 1) {
        errors.push(`第 ${index + 1} 条：至少需要保留一个页面`);
        aborted = true;
        return;
      }

      const deletingIndex = findCanvasIndexForPageDeletion(instruction);
      if (deletingIndex < 0) {
        errors.push(
          `第 ${index + 1} 条：未找到页面：${describePageDeletionTarget(instruction)}`,
        );
        aborted = true;
        return;
      }

      const deletedCanvas = nextCanvases[deletingIndex];
      nextCanvases.splice(deletingIndex, 1);
      applied.push(`删除页面 ${deletedCanvas.name}`);
      if (activeWorkingCanvasId === deletedCanvas.id) {
        activeWorkingCanvasId =
          selectFallbackCanvasAfterDeletion(deletingIndex).id;
        selectedNodeIdFromAi = null;
      }
      return;
    }

    if (isPageNavigationSyncInstruction(instruction)) {
      syncPageNavigation(nextCanvases);
      applied.push('同步页面导航');
      return;
    }

    const targetPageId = getInstructionPageId(instruction);
    const targetCanvasIndex = findCanvasIndexForInstruction(instruction);
    if (targetCanvasIndex < 0) {
      errors.push(`第 ${index + 1} 条：未找到页面：${targetPageId}`);
      aborted = true;
      return;
    }

    const targetCanvas = nextCanvases[targetCanvasIndex];
    const resolvedInstruction = withResolvedNodeAliases(
      instruction,
      resolveNodeIdAlias,
    );
    const result = applyEditorAiEditInstructions(
      targetCanvas.document,
      [resolvedInstruction],
      options,
    );
    nextCanvases[targetCanvasIndex] = {
      ...targetCanvas,
      document: result.document,
    };
    applied.push(...result.applied);
    errors.push(
      ...result.errors.map((error) =>
        error.replace(/^第 1 条：/, `第 ${index + 1} 条：`),
      ),
    );
    if (result.errors.length > 0) {
      aborted = true;
    }
    if (result.selectedNodeId !== undefined) {
      selectedNodeIdFromAi = result.selectedNodeId;
    }
  });

  const finalCanvases = syncPageNavigation(nextCanvases);
  const nextActiveCanvas =
    finalCanvases.find((canvas) => canvas.id === activeWorkingCanvasId)
    ?? finalCanvases[0];

  if (errors.length > 0) {
    return {
      applied,
      canvases: finalCanvases,
      activeCanvasId: nextActiveCanvas.id,
      document: nextActiveCanvas.document,
      errors,
      selectedNodeId: selectedNodeIdFromAi,
    };
  }

  return {
    applied,
    canvases: finalCanvases,
    activeCanvasId: nextActiveCanvas.id,
    document: nextActiveCanvas.document,
    errors,
    selectedNodeId: selectedNodeIdFromAi,
  };
}

export function useBuilderDocumentState(
  themes: LayoutBuilderTheme[],
  initialThemeId?: string,
) {
  const initialTheme = (
    initialThemeId
      ? themes.find((t) => t.id === initialThemeId)
      : undefined
  ) ?? themes[0];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- themes[0] may be undefined at runtime without noUncheckedIndexedAccess
  const initialScreenPreset = initialTheme
    ? getDefaultPreviewScreenPreset(initialTheme.platformCategories)
    : 'mobile';
  const [canvases, setCanvases] = useState<BuilderCanvas[]>(() =>
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- themes[0] may be undefined at runtime without noUncheckedIndexedAccess
    initialTheme ? createCanvasesFromTheme(initialTheme) : [],
  );
  const [activeCanvasId, setActiveCanvasIdState] = useState(
    () => canvases[0]?.id ?? '',
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [screenPreset, setScreenPreset] =
    useState<DynamicThemeScreenPreset>(initialScreenPreset);
  const canvasesRef = useRef(canvases);
  const activeCanvasIdRef = useRef(activeCanvasId);

  useEffect(() => {
    canvasesRef.current = canvases;
  }, [canvases]);

  useEffect(() => {
    activeCanvasIdRef.current = activeCanvasId;
  }, [activeCanvasId]);

  const activeCanvas =
    canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0];
  const activeTheme =
    themes.find((theme) => theme.id === activeCanvas.themeId) ?? themes[0];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard; array elements may be undefined at runtime
  if (!activeTheme || !activeCanvas) {
    throw new Error('Theme layout builder requires at least one theme.');
  }

  const currentDocument = activeCanvas.document;
  const flatNodes = flattenNodes(currentDocument.layout);
  const containerNodes = flatNodes.filter(
    ({ node }) => CONTAINER_ALIASES.has(node.alias),
  );
  const selectedNode = selectedNodeId
    ? flatNodes.find(({ node }) => node.id === selectedNodeId)?.node ?? null
    : null;
  const selectedDescriptor = selectedNode
    ? descriptorForAlias(currentDocument, selectedNode.alias)
    : null;
  const selectedContainerId =
    selectedNode && CONTAINER_ALIASES.has(selectedNode.alias)
      ? selectedNode.id
      : currentDocument.layout.id;
  const layoutDescriptors = activeTheme.layoutDocument.components.filter(
    (component) =>
      component.kind === 'layout' &&
      component.alias !== 'core.screen' &&
      component.alias !== 'core.row' &&
      component.alias !== 'core.grid',
  );
  const componentDescriptors = activeTheme.layoutDocument.components.filter(
    (component) => component.kind === 'component',
  );

  function setActiveCanvasId(canvasId: string) {
    activeCanvasIdRef.current = canvasId;
    setActiveCanvasIdState(canvasId);
    setSelectedNodeId(null);
  }

  const setEditorDocument: Dispatch<
    SetStateAction<ThemeLayoutDocument | null>
  > = (value) => {
    setCanvases((current) => {
      const activeId = activeCanvasIdRef.current;
      const nextCanvases = current.map((canvas) => {
        if (canvas.id !== activeId) {
          return canvas;
        }

        const nextDocument =
          typeof value === 'function' ? value(canvas.document) : value;
        return nextDocument
          ? {
              ...canvas,
              document: nextDocument,
            }
          : canvas;
      });
      canvasesRef.current = nextCanvases;
      return nextCanvases;
    });
  };

  function updateNode(
    nodeId: string,
    updater: (node: ThemeLayoutNode) => void,
  ) {
    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return updateNodeInDocument(current, nodeId, updater) ?? current;
    });
  }

  function updateSelectedNodeProp(name: string, value: string | boolean) {
    if (!selectedDescriptor || !selectedNode) {
      return;
    }

    const propDescriptor = selectedDescriptor.props.find(
      (prop) => prop.name === name,
    );
    if (!propDescriptor) {
      return;
    }

    updateNode(selectedNode.id, (node) => {
      const nextProps = { ...(node.props ?? {}) };

      if (propDescriptor.type === 'boolean') {
        nextProps[name] = Boolean(value);
        node.props = nextProps;
        return;
      }

      if (typeof value !== 'string') {
        return;
      }

      if (propDescriptor.type === 'number') {
        nextProps[name] = value === '' ? '' : Number(value);
        node.props = nextProps;
        return;
      }

      if (propDescriptor.type === 'string[]') {
        nextProps[name] = value
          .split(/[,，]/)
          .map((item) => item.trim())
          .filter(Boolean);
        node.props = nextProps;
        return;
      }

      nextProps[name] = value;
      node.props = nextProps;
    });
  }

  function applyAiEditInstructions(
    instructions: readonly EditorAiEditInstruction[],
    options?: ApplyEditorAiEditInstructionsOptions,
  ) {
    const liveCanvases = canvasesRef.current;
    const liveActiveCanvas =
      liveCanvases.find((canvas) => canvas.id === activeCanvasIdRef.current)
      ?? liveCanvases[0];
    const liveActiveTheme =
      themes.find((theme) => theme.id === liveActiveCanvas.themeId)
      ?? activeTheme;

    if (instructions.some(needsMultiPageContext)) {
      const result = applyAiEditInstructionsToCanvases({
        canvases: liveCanvases,
        activeCanvasId: liveActiveCanvas.id,
        activeTheme: liveActiveTheme,
        instructions,
        options,
      });
      canvasesRef.current = result.canvases;
      activeCanvasIdRef.current = result.activeCanvasId;
      setCanvases(result.canvases);
      setActiveCanvasIdState(result.activeCanvasId);
      if (result.selectedNodeId !== undefined) {
        setSelectedNodeId(result.selectedNodeId);
      }
      return result;
    }

    const result = applyEditorAiEditInstructions(
      liveActiveCanvas.document,
      instructions,
      options,
    );
    const nextCanvases = liveCanvases.map((canvas) =>
      canvas.id === liveActiveCanvas.id
        ? { ...canvas, document: result.document }
        : canvas,
    );
    canvasesRef.current = nextCanvases;
    setCanvases(nextCanvases);
    if (result.selectedNodeId !== undefined) {
      setSelectedNodeId(result.selectedNodeId);
    }
    return result;
  }

  function moveNodeWithinParent(
    nodeId: string,
    targetId: string,
    position: 'before' | 'after',
  ) {
    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return (
        moveNodeWithinParentInDocument(current, nodeId, targetId, position)
        ?? current
      );
    });
  }

  function moveNodeToParentEnd(nodeId: string, parentId: string) {
    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return (
        moveNodeToParentEndInDocument(current, nodeId, parentId) ?? current
      );
    });
  }

  function moveRootNodeToRowBoundary(
    nodeId: string,
    targetId: string,
    position: 'before' | 'after',
  ) {
    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return (
        moveRootNodeToRowBoundaryInDocument(
          current,
          nodeId,
          targetId,
          position,
        ) ?? current
      );
    });
  }

  function handleDeleteNode(nodeId: string) {
    if (nodeId === currentDocument.layout.id) {
      return;
    }

    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      const nextDocument = cloneDocument(current);
      removeNode(nextDocument.layout, nodeId);
      return nextDocument;
    });

    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  }

  function addNodeFromAlias(
    alias: string,
    parentId = currentDocument.layout.id,
  ) {
    const descriptor = descriptorForAlias(currentDocument, alias);
    if (!descriptor) {
      return;
    }

    const slot =
      parentId === currentDocument.layout.id
      && FOOTER_ALIASES.has(descriptor.alias)
        ? 'footer'
        : 'body';
    const sampleChildren =
      descriptor.alias === 'core.panel' || descriptor.alias === 'core.stack'
        ? createLibrarySampleChildren(currentDocument, descriptor.alias)
        : undefined;
    const nextNode = buildNodeFromDraft(
      descriptor,
      createDraft(
        currentDocument.themeId,
        descriptor,
        parentId,
        slot,
        undefined,
        parentId === currentDocument.layout.id && slot === 'body'
          ? nextRootFlowRow(currentDocument.layout)
          : 0,
      ),
      sampleChildren,
    );

    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return upsertNode(current, parentId, nextNode) ?? current;
    });
    setSelectedNodeId(nextNode.id);
  }

  function insertNodeFromAliasRelative(
    alias: string,
    parentId: string,
    targetId: string,
    position: 'before' | 'after',
    axis: DropIndicatorAxis,
  ) {
    const descriptor = descriptorForAlias(currentDocument, alias);
    if (!descriptor) {
      return;
    }

    const slot =
      parentId === currentDocument.layout.id
      && FOOTER_ALIASES.has(descriptor.alias)
        ? 'footer'
        : 'body';
    if (slot === 'footer') {
      addNodeFromAlias(alias, parentId);
      return;
    }

    const sampleChildren =
      descriptor.alias === 'core.panel' || descriptor.alias === 'core.stack'
        ? createLibrarySampleChildren(currentDocument, descriptor.alias)
        : undefined;
    const nextNode = buildNodeFromDraft(
      descriptor,
      createDraft(
        currentDocument.themeId,
        descriptor,
        parentId,
        slot,
        undefined,
        parentId === currentDocument.layout.id
          ? nextRootFlowRow(currentDocument.layout)
          : 0,
      ),
      sampleChildren,
    );

    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return (
        insertNodeRelativeToTargetInDocument(
          current,
          parentId,
          nextNode,
          targetId,
          position,
          axis,
        ) ?? current
      );
    });
    setSelectedNodeId(nextNode.id);
  }

  function applyTemplateToActiveCanvas(themeId: string) {
    const nextTheme = themes.find((theme) => theme.id === themeId) ?? themes[0];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard
    if (!nextTheme) {
      return;
    }

    const nextCanvases = createCanvasesFromTheme(nextTheme);
    const defaultPageId = nextTheme.layoutDocument.defaultPageId;
    const defaultCanvas =
      nextCanvases.find(
        (canvas) => canvas.document.defaultPageId === defaultPageId,
      ) ?? nextCanvases[0];

    setCanvases(nextCanvases);
    setScreenPreset(
      getDefaultPreviewScreenPreset(nextTheme.platformCategories),
    );
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- nextCanvases[0] may be undefined at runtime
    setActiveCanvasIdState(defaultCanvas?.id ?? '');
    setSelectedNodeId(null);
  }

  function createCanvas() {
    const nextCanvas = createCanvasFromTheme(
      activeTheme,
      canvases.length,
      true,
    );
    setCanvases((current) => [...current, nextCanvas]);
    setActiveCanvasIdState(nextCanvas.id);
    setSelectedNodeId(null);
  }

  function clearActiveCanvas() {
    setCanvases((current) =>
      current.map((canvas) =>
        canvas.id === activeCanvas.id
          ? {
              ...canvas,
              document: {
                ...createBlankDocument(canvas.document),
                pageName: canvas.name,
              },
            }
          : canvas,
      ),
    );
    setSelectedNodeId(null);
  }

  function updateActiveCanvasName(name: string) {
    setCanvases((current) =>
      current.map((canvas) =>
        canvas.id === activeCanvas.id
          ? {
              ...canvas,
              name,
              document: {
                ...canvas.document,
                pageName: name,
              },
            }
          : canvas,
      ),
    );
  }

  return {
    canvases,
    activeCanvas,
    activeCanvasId,
    setActiveCanvasId,
    activeTheme,
    currentDocument,
    setEditorDocument,
    containerNodes,
    selectedNode,
    selectedDescriptor,
    selectedNodeId,
    setSelectedNodeId,
    selectedContainerId,
    layoutDescriptors,
    componentDescriptors,
    screenPreset,
    setScreenPreset,
    updateNode,
    updateSelectedNodeProp,
    applyAiEditInstructions,
    moveNodeWithinParent,
    moveNodeToParentEnd,
    moveRootNodeToRowBoundary,
    insertNodeFromAliasRelative,
    handleDeleteNode,
    addNodeFromAlias,
    applyTemplateToActiveCanvas,
    createCanvas,
    clearActiveCanvas,
    updateActiveCanvasName,
  };
}
