import type { AgentEditResult } from '../errors/agentErrors';
import {
  compileSemanticEditorInstruction,
  type SemanticEditorInstruction,
} from '../compiler/semanticInstructionCompiler';
import { buildTemplateProfile } from '../template/buildTemplateProfile';
import { applyCompiledOperationsAtomic, type ApplyResult } from '../editor/atomicApply';
import type { ThemeLayoutDocument } from '../types';
import type { SemanticToolName } from './semanticTools';

export type { ApplyResult } from '../editor/atomicApply';
export type { SemanticToolName } from './semanticTools';

export interface ExecuteSemanticToolOptions {
  sessionId?: string;
  dryRun?: boolean;
}

function buildInstruction(name: SemanticToolName, params: Record<string, unknown>): SemanticEditorInstruction {
  switch (name) {
    case 'editor_update_slot':
      return {
        type: 'update_slot',
        slotKey: String(params.slotKey ?? ''),
        props: (params.props as Record<string, unknown>) ?? {},
        pageKey: typeof params.pageKey === 'string' ? params.pageKey : undefined,
        select: params.select as boolean | undefined,
      };
    case 'editor_fill_pattern':
      return {
        type: 'fill_pattern',
        patternKey: String(params.patternKey ?? ''),
        items: (params.items as Record<string, unknown>[]) ?? [],
        replaceExisting: params.replaceExisting as boolean | undefined,
        pageKey: typeof params.pageKey === 'string' ? params.pageKey : undefined,
        select: params.select as boolean | undefined,
      };
    case 'editor_create_page_from_page_kind':
      return {
        type: 'create_page_from_page_kind',
        pageKind: String(params.pageKind ?? ''),
        name: String(params.name ?? ''),
        contentIntent: typeof params.contentIntent === 'string' ? params.contentIntent : undefined,
        activate: params.activate as boolean | undefined,
        select: params.select as boolean | undefined,
        syncNavigation: params.syncNavigation as boolean | undefined,
      };
    case 'editor_replace_section':
      return {
        type: 'replace_section',
        regionKey: String(params.regionKey ?? ''),
        sectionKind: String(params.sectionKind ?? ''),
        content: (params.content as Record<string, unknown>) ?? undefined,
        patternKey: typeof params.patternKey === 'string' ? params.patternKey : undefined,
        pageKey: typeof params.pageKey === 'string' ? params.pageKey : undefined,
        select: params.select as boolean | undefined,
      };
    case 'editor_submit_page_spec':
      return {
        type: 'submit_page_spec',
        spec: (params.spec as { intent: 'create_page' | 'update_page' } | undefined) ?? {
          intent: 'create_page',
        },
        select: params.select as boolean | undefined,
      };
  }
}

export async function executeSemanticTool(
  toolName: SemanticToolName,
  params: Record<string, unknown>,
  document: ThemeLayoutDocument,
  options: ExecuteSemanticToolOptions = {},
): Promise<AgentEditResult<ApplyResult>> {
  const instruction = buildInstruction(toolName, params);
  const profile = buildTemplateProfile(document);
  const compiled = compileSemanticEditorInstruction(document, instruction, profile);

  if (!compiled.success || !compiled.data) {
    return compiled;
  }

  if (options.dryRun) {
    return {
      success: true,
      data: {
        applied: false,
        snapshot: structuredClone(document),
        appliedOperations: [],
        warnings: compiled.data.warnings,
        preview: compiled.data.operations,
      },
    };
  }

  return applyCompiledOperationsAtomic(compiled.data, document, {
    sessionId: options.sessionId,
  });
}
