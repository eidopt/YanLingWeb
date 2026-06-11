import type { AgentEditResult } from '../errors/agentErrors';
import type { ThemeLayoutDocument } from '../types';

export interface OperationSnapshot {
  documentId: string;
  snapshotId: string;
  timestamp: number;
  state: ThemeLayoutDocument;
  metadata: {
    operation: string;
    sessionId: string;
    description: string;
  };
}

export interface OperationStep<TContext> {
  stepId: string;
  description: string;
  execute: (context: TContext) => Promise<TContext> | TContext;
  rollback?: (context: TContext) => Promise<TContext> | TContext;
  committed?: boolean;
}

export interface AtomicOperation<TContext> {
  operationId: string;
  documentId: string;
  steps: OperationStep<TContext>[];
  currentStep: number;
  snapshots: OperationSnapshot[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
}

function cloneDocument(document: ThemeLayoutDocument): ThemeLayoutDocument {
  return structuredClone(document);
}

export class AtomicOperationManager {
  private operations = new Map<string, AtomicOperation<ThemeLayoutDocument>>();

  createSnapshot(document: ThemeLayoutDocument, metadata: OperationSnapshot['metadata']): OperationSnapshot {
    return {
      documentId: document.themeId,
      snapshotId: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      timestamp: Date.now(),
      state: cloneDocument(document),
      metadata,
    };
  }

  createAtomicOperation(
    document: ThemeLayoutDocument,
    sessionId: string,
    steps: OperationStep<ThemeLayoutDocument>[],
  ): string {
    const operationId = `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const snapshot = this.createSnapshot(document, {
      operation: operationId,
      sessionId,
      description: 'Initial state before atomic operation',
    });
    this.operations.set(operationId, {
      operationId,
      documentId: document.themeId,
      steps,
      currentStep: 0,
      snapshots: [snapshot],
      status: 'pending',
    });
    return operationId;
  }

  async executeAtomicOperation(operationId: string): Promise<AgentEditResult<ThemeLayoutDocument>> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return {
        success: false,
        error: {
          code: 'operation_not_found',
          reason: `Operation ${operationId} not found`,
          recoverable: false,
        },
      };
    }

    operation.status = 'in_progress';
    let context = cloneDocument(operation.snapshots[0].state);

    for (let index = operation.currentStep; index < operation.steps.length; index += 1) {
      const step = operation.steps[index];
      try {
        context = await step.execute(context);
        step.committed = true;
        operation.currentStep = index + 1;
        operation.snapshots.push(
          this.createSnapshot(context, {
            operation: operationId,
            sessionId: operation.snapshots[0].metadata.sessionId,
            description: `After step: ${step.description}`,
          }),
        );
      } catch (error) {
        operation.status = 'failed';
        const rollback = await this.rollbackOperation(operationId);
        if (!rollback.success) {
          return rollback;
        }
        return {
          success: false,
          error: {
            code: 'apply_failed',
            reason: error instanceof Error ? error.message : String(error),
            partialSuccess: false,
            recoverable: false,
          },
        };
      }
    }

    operation.status = 'completed';
    return { success: true, data: context };
  }

  async rollbackOperation(operationId: string): Promise<AgentEditResult<ThemeLayoutDocument>> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return {
        success: false,
        error: {
          code: 'operation_not_found',
          reason: `Operation ${operationId} not found`,
          recoverable: false,
        },
      };
    }

    let context = cloneDocument(operation.snapshots.at(-1)?.state ?? operation.snapshots[0].state);
    for (let index = operation.currentStep - 1; index >= 0; index -= 1) {
      const step = operation.steps[index];
      if (!step.committed) {
        continue;
      }
      try {
        context = step.rollback ? await step.rollback(context) : cloneDocument(operation.snapshots[0].state);
      } catch (error) {
        operation.status = 'failed';
        return {
          success: false,
          error: {
            code: 'atomic_rollback_failed',
            reason: error instanceof Error ? error.message : String(error),
            recoverable: false,
          },
        };
      }
    }

    const restored = cloneDocument(operation.snapshots[0].state);
    operation.status = 'rolled_back';
    return { success: true, data: restored };
  }

  cleanupSnapshots(maxAgeMs = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;
    for (const operation of this.operations.values()) {
      const before = operation.snapshots.length;
      operation.snapshots = operation.snapshots.filter(
        (snapshot, index) => index === 0 || now - snapshot.timestamp <= maxAgeMs,
      );
      removed += before - operation.snapshots.length;
    }
    return removed;
  }

  clear(): void {
    this.operations.clear();
  }
}

export const atomicOperationManager = new AtomicOperationManager();
