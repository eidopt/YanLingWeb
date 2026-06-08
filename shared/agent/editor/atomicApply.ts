import { atomicOperationManager, type OperationStep } from './atomicOperations';
import type { AgentEditResult } from '../errors/agentErrors';
import type { CompiledSemanticInstruction } from '../compiler/semanticInstructionCompiler';
import { applyEditorAiEditInstructions } from './applyEditorInstructions';
import type { ThemeLayoutDocument } from '../types';

export interface AtomicApplyOptions {
  sessionId?: string;
}

export interface ApplyResult {
  applied: boolean;
  snapshot: ThemeLayoutDocument;
  appliedOperations: CompiledSemanticInstruction['operations'];
  warnings: string[];
  preview?: CompiledSemanticInstruction['operations']; // dryRun 时填充
}

export async function applyCompiledOperationsAtomic(
  compiled: CompiledSemanticInstruction,
  document: ThemeLayoutDocument,
  options?: AtomicApplyOptions,
): Promise<AgentEditResult<ApplyResult>> {
  const snapshot: ThemeLayoutDocument = structuredClone(document);
  const sessionId = options?.sessionId ?? 'unknown';

  if (compiled.operations.length === 0) {
    return {
      success: true,
      data: { applied: false, snapshot, appliedOperations: [], warnings: compiled.warnings },
    };
  }

  const steps: OperationStep<ThemeLayoutDocument>[] = compiled.operations.map((op, i) => ({
    stepId: `op-${i}`,
    description: op.type,
    execute: (doc) => {
      const result = applyEditorAiEditInstructions(doc, [op]);
      if (result.errors.length > 0) {
        throw new Error(result.errors.join('; '));
      }
      return result.document;
    },
    // AtomicOperationManager rolls back to snapshot[0] when no rollback provided
  }));

  const opId = atomicOperationManager.createAtomicOperation(document, sessionId, steps);
  const execution = await atomicOperationManager.executeAtomicOperation(opId);

  if (!execution.success || !execution.data) {
    return {
      success: false,
      error: {
        code: 'apply_failed',
        reason: execution.error?.reason ?? 'Unknown atomic apply failure',
        partialSuccess: false,
        recoverable: false,
      },
    };
  }

  // Copy mutated state back into the caller's document reference.
  // AtomicOperationManager works on an internal clone to keep rollback possible;
  // the caller expects the original document to reflect the applied changes.
  const mutated = execution.data;
  document.themeId = mutated.themeId;
  document.themeName = mutated.themeName;
  document.version = mutated.version;
  document.description = mutated.description;
  document.pageName = mutated.pageName;
  document.defaultPageId = mutated.defaultPageId;
  document.components = mutated.components;
  document.pages = mutated.pages;
  document.layout = mutated.layout;
  document.componentTemplates = mutated.componentTemplates;
  document.dependencies = mutated.dependencies;
  document.cssVars = mutated.cssVars;
  document.cssAnimations = mutated.cssAnimations;
  document.style = mutated.style;

  return {
    success: true,
    data: {
      applied: true,
      snapshot,
      appliedOperations: compiled.operations,
      warnings: compiled.warnings,
    },
  };
}
