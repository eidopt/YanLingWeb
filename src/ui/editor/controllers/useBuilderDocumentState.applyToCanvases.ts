import {
  applyEditorAiEditInstructions,
  type ApplyEditorAiEditInstructionsOptions,
  type ApplyEditorAiEditInstructionsResult,
  type EditorAiEditInstruction,
} from '../services/aiEditInstructions';
import type { BuilderCanvas, LayoutBuilderTheme } from '../types';
import {
  createCanvasFromAiPageInstruction,
  createCanvasFromReferencePageInstruction,
  firstNonEmpty,
  getInstructionPageId,
  getInstructionRootNodeId,
  getRootNodePageAlias,
  isPageCreationInstruction,
  isPageDeletionInstruction,
  isPageNavigationSyncInstruction,
  type PageCreationInstruction,
  type PageDeletionInstruction,
  syncPageNavigation,
  validateReferencePageInstructionShape,
  withResolvedNodeAliases,
} from './useBuilderDocumentState.canvasFactory';
import { builderDocumentStateContent as c } from './useBuilderDocumentState.content';
import { cloneDocument } from 'domain/template';

interface ApplyAiEditInstructionsToCanvasesInput {
  canvases: BuilderCanvas[];
  activeCanvasId: string;
  activeTheme: LayoutBuilderTheme;
  instructions: readonly EditorAiEditInstruction[];
  options?: ApplyEditorAiEditInstructionsOptions;
}

interface ApplyAiEditInstructionsToCanvasesResult extends ApplyEditorAiEditInstructionsResult {
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
  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0];
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
    return nextCanvases.findIndex((canvas) => canvas.document.defaultPageId === pageId);
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

  function rememberCreatedPageAliases(instruction: PageCreationInstruction, canvas: BuilderCanvas) {
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
    if (activeCanvasIndex >= 0 && newlyCreatedCanvasIds.has(activeWorkingCanvasId)) {
      rememberPageIdAlias(requestedPageId, nextCanvases[activeCanvasIndex].document.defaultPageId);
      return activeCanvasIndex;
    }

    return -1;
  }

  function findCanvasIndexForPageDeletion(instruction: PageDeletionInstruction) {
    const pageId = getInstructionPageId(instruction);
    if (pageId) {
      return findCanvasIndexByPageId(resolvePageIdAlias(pageId));
    }

    const name = instruction.name?.trim();
    if (!name) {
      return -1;
    }

    return nextCanvases.findIndex((canvas) => canvas.name === name || canvas.document.pageName === name);
  }

  function findCanvasIndexForReferencePage(
    instruction: Extract<EditorAiEditInstruction, { type: 'create_page_from_reference' }>,
  ) {
    const referencePageId = resolvePageIdAlias(instruction.referencePageId.trim());
    const byPageId = findCanvasIndexByPageId(referencePageId);
    if (byPageId >= 0) {
      return byPageId;
    }
    return nextCanvases.findIndex(
      (canvas) =>
        canvas.name === instruction.referencePageId || canvas.document.pageName === instruction.referencePageId,
    );
  }

  function describePageDeletionTarget(instruction: PageDeletionInstruction) {
    return firstNonEmpty(getInstructionPageId(instruction), instruction.name) || c.unspecifiedPage;
  }

  function selectFallbackCanvasAfterDeletion(deletedIndex: number) {
    return nextCanvases[Math.min(deletedIndex, nextCanvases.length - 1)] ?? nextCanvases[0];
  }

  instructions.forEach((instruction, index) => {
    if (aborted) {
      return;
    }

    if (isPageCreationInstruction(instruction)) {
      if (instruction.type === 'create_page_from_reference') {
        const shapeError = validateReferencePageInstructionShape(instruction);
        if (shapeError) {
          errors.push(`${c.instructionPrefix(index)}${shapeError}`);
          aborted = true;
          return;
        }
        const referenceCanvasIndex = findCanvasIndexForReferencePage(instruction);
        if (referenceCanvasIndex < 0) {
          errors.push(`${c.instructionPrefix(index)}${c.missingReferencePage(instruction.referencePageId)}`);
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
            errors.push(`${c.instructionPrefix(index)}${c.missingReferenceNodeId}`);
            aborted = true;
            return;
          }
          const targetNodeId = created.idMap.get(update.referenceNodeId);
          if (!targetNodeId) {
            errors.push(`${c.instructionPrefix(index)}${c.referenceNodeNotCopied(update.referenceNodeId)}`);
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
          const result = applyEditorAiEditInstructions(createdCanvas.document, updateInstructions, options);
          if (result.errors.length > 0) {
            errors.push(
              ...result.errors.map((error) => error.replace(c.instructionPrefixPattern, c.instructionPrefix(index))),
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
        applied.push(c.createdFromReferencePage(createdCanvas.name));
        applied.push(...createdUpdateApplied);
        selectedNodeIdFromAi = instruction.select === false ? undefined : createdCanvas.document.layout.id;
        return;
      }

      const nextCanvas = createCanvasFromAiPageInstruction(activeTheme, nextCanvases.length, instruction);
      nextCanvases.push(nextCanvas);
      activeWorkingCanvasId = nextCanvas.id;
      newlyCreatedCanvasIds.add(nextCanvas.id);
      rememberCreatedPageAliases(instruction, nextCanvas);
      applied.push(c.createdPage(nextCanvas.name));
      const shouldSelectNewPageRoot = instruction.type === 'insert_node' || instruction.activate !== false;
      if (shouldSelectNewPageRoot) {
        selectedNodeIdFromAi = instruction.select === false ? undefined : nextCanvas.document.layout.id;
      }
      return;
    }

    if (isPageDeletionInstruction(instruction)) {
      if (nextCanvases.length <= 1) {
        errors.push(`${c.instructionPrefix(index)}${c.atLeastOnePageRequired}`);
        aborted = true;
        return;
      }

      const deletingIndex = findCanvasIndexForPageDeletion(instruction);
      if (deletingIndex < 0) {
        errors.push(`${c.instructionPrefix(index)}${c.missingPage(describePageDeletionTarget(instruction))}`);
        aborted = true;
        return;
      }

      const deletedCanvas = nextCanvases[deletingIndex];
      nextCanvases.splice(deletingIndex, 1);
      applied.push(c.deletedPage(deletedCanvas.name));
      if (activeWorkingCanvasId === deletedCanvas.id) {
        activeWorkingCanvasId = selectFallbackCanvasAfterDeletion(deletingIndex).id;
        selectedNodeIdFromAi = null;
      }
      return;
    }

    if (isPageNavigationSyncInstruction(instruction)) {
      syncPageNavigation(nextCanvases);
      applied.push(c.syncedPageNavigation);
      return;
    }

    const targetPageId = getInstructionPageId(instruction);
    const targetCanvasIndex = findCanvasIndexForInstruction(instruction);
    if (targetCanvasIndex < 0) {
      errors.push(`${c.instructionPrefix(index)}${c.missingPage(targetPageId)}`);
      aborted = true;
      return;
    }

    const targetCanvas = nextCanvases[targetCanvasIndex];
    const resolvedInstruction = withResolvedNodeAliases(instruction, resolveNodeIdAlias);
    const result = applyEditorAiEditInstructions(targetCanvas.document, [resolvedInstruction], options);
    nextCanvases[targetCanvasIndex] = {
      ...targetCanvas,
      document: result.document,
    };
    applied.push(...result.applied);
    errors.push(
      ...result.errors.map((error) => error.replace(c.firstInstructionPrefixPattern, c.instructionPrefix(index))),
    );
    if (result.errors.length > 0) {
      aborted = true;
    }
    if (result.selectedNodeId !== undefined) {
      selectedNodeIdFromAi = result.selectedNodeId;
    }
  });

  const finalCanvases = syncPageNavigation(nextCanvases);
  const nextActiveCanvas = finalCanvases.find((canvas) => canvas.id === activeWorkingCanvasId) ?? finalCanvases[0];

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
