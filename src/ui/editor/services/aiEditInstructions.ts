import type { ThemeLayoutDocument } from '../../layout/types';
import { applyOneInstruction } from './aiEditInstructions.apply';
import { aiEditInstructionsContent as c } from './aiEditInstructions.content';
import {
  explicitUnresolvedNodeId,
  resolveInstructionIds,
  resolveInstructionSemanticTargets,
} from './aiEditInstructions.resolve';
import type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
  NodeIdAliases,
} from './aiEditInstructions.types';
import { cloneDocument } from 'domain/template';

export type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from './aiEditInstructions.types';

export function applyEditorAiEditInstructions(
  document: ThemeLayoutDocument,
  instructions: readonly EditorAiEditInstruction[],
  options?: ApplyEditorAiEditInstructionsOptions,
): ApplyEditorAiEditInstructionsResult {
  let currentDocument = cloneDocument(document);
  const nodeIdAliases: NodeIdAliases = new Map();
  const applied: string[] = [];
  const errors: string[] = [];
  let selectedNodeId: string | null | undefined;
  let aborted = false;

  instructions.forEach((instruction, index) => {
    if (aborted) {
      return;
    }

    if (instruction.type === 'insert_node' && instruction.alias === 'core.screen' && instruction.nodeId) {
      nodeIdAliases.set(instruction.nodeId, currentDocument.layout.id);
    }

    const resolvedInstruction = resolveInstructionIds(instruction, nodeIdAliases);
    const unresolvedNodeId = explicitUnresolvedNodeId(currentDocument, resolvedInstruction);
    if (unresolvedNodeId) {
      errors.push(c.instructionFailed(index, c.missingNode(unresolvedNodeId)));
      aborted = true;
      return;
    }
    const semanticResolvedInstruction = resolveInstructionSemanticTargets(
      currentDocument,
      resolvedInstruction,
      options,
    );
    const result = applyOneInstruction(currentDocument, semanticResolvedInstruction);
    currentDocument = result.document;
    if (result.error) {
      errors.push(c.instructionFailed(index, result.error));
      aborted = true;
      return;
    }

    if (result.message) {
      applied.push(result.message);
    }
    if (result.selectedNodeId !== undefined) {
      selectedNodeId = result.selectedNodeId;
    }
  });

  return {
    applied,
    document: currentDocument,
    errors,
    selectedNodeId,
  };
}
