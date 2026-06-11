import type { CompiledSemanticInstruction } from '../compiler/semanticInstructionCompiler';
import type { AgentEditResult } from '../errors/agentErrors';
import type { ThemeLayoutDocument } from '../types';
import { applyEditorAiEditInstructions } from './applyEditorInstructions';
import { atomicOperationManager, type OperationStep } from './atomicOperations';

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
        reason:
          execution.error && 'reason' in execution.error ? execution.error.reason : 'Unknown atomic apply failure',
        partialSuccess: false,
        recoverable: false,
      },
    };
  }

  // Copy mutated state back into the caller's document reference.
  // AtomicOperationManager works on an internal clone to keep rollback possible;
  // the caller expects the original document to reflect the applied changes.
  // Object.assign copies all enumerable own properties, picking up future schema additions.
  const mutated = execution.data;
  Object.assign(document, mutated);

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
