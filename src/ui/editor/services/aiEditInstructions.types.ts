import type {
  LayoutNodeFrame,
  LayoutNodeLayout,
  ThemeLayoutDocument,
  ThemeLayoutNodeInteractions,
} from '../../layout/types';
import type { DropIndicatorAxis } from 'domain/template';

interface EditorAiInstructionTarget {
  pageId?: string;
  semanticTarget?: string;
  target?: string;
}

export type EditorAiEditInstruction =
  | ({
      type: 'create_page';
      pageId: string;
      name?: string;
      rootNodeId?: string;
      props?: Record<string, unknown>;
      layout?: Partial<LayoutNodeLayout>;
      select?: boolean;
      activate?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'create_page_from_reference';
      pageId: string;
      name: string;
      referencePageId: string;
      rootNodeId?: string;
      rootProps?: Record<string, unknown>;
      referenceNodeUpdates?: {
        referenceNodeId: string;
        props: Record<string, unknown>;
      }[];
      omitReferenceNodeIds?: string[];
      select?: boolean;
      activate?: boolean;
      syncNavigation?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'delete_page';
      name?: string;
      select?: boolean;
      activate?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'sync_page_navigation';
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'sync_footer_tabs';
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'insert_node';
      alias: string;
      nodeId?: string;
      parentId?: string;
      targetId?: string;
      position?: 'before' | 'after' | 'inside_end';
      axis?: DropIndicatorAxis;
      props?: Record<string, unknown>;
      layout?: Partial<LayoutNodeLayout>;
      frame?: Partial<LayoutNodeFrame>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'clone_pattern_items';
      sourceRootNodeId: string;
      parentId?: string;
      replaceExisting?: boolean;
      select?: boolean;
      items: Record<string, unknown>[];
      fields: {
        fieldKey: string;
        referenceNodeId: string;
        prop: string;
        required?: boolean;
      }[];
    } & EditorAiInstructionTarget)
  | ({
      type: 'update_props';
      nodeId: string;
      props: Record<string, unknown>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'set_layout';
      nodeId: string;
      layout: Partial<LayoutNodeLayout>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'set_frame';
      nodeId: string;
      frame: Partial<LayoutNodeFrame>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'move_node';
      nodeId: string;
      parentId?: string;
      targetId?: string;
      position?: 'before' | 'after' | 'inside_end';
      axis?: DropIndicatorAxis;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'delete_node';
      nodeId: string;
    } & EditorAiInstructionTarget)
  | ({
      type: 'update_interactions';
      nodeId: string;
      interactions: Partial<ThemeLayoutNodeInteractions>;
      select?: boolean;
    } & EditorAiInstructionTarget);

export interface ApplyEditorAiEditInstructionsResult {
  applied: string[];
  document: ThemeLayoutDocument;
  errors: string[];
  selectedNodeId?: string | null;
}

export interface ApplyEditorAiEditInstructionsOptions {
  userPrompt?: string;
  reason?: string;
  selectedNodeId?: string | null;
}

export interface ApplyOneResult {
  document: ThemeLayoutDocument;
  error?: string;
  message?: string;
  selectedNodeId?: string | null;
}

export type NodeIdAliases = Map<string, string>;
