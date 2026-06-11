import type {
  EditorAiCacheContextRecord,
  EditorAiConversation,
  EditorAiConversationUndoStackRecord,
} from '../entities/editorAiConversation.entity';

export const EDITOR_CONVERSATION_REPOSITORY = Symbol('EDITOR_CONVERSATION_REPOSITORY');

export interface CreateEditorConversationInput {
  ownerUserId: string;
  templateId: string;
  messages?: EditorAiConversation['messages'];
  providerMessages?: EditorAiConversation['providerMessages'];
  providerSession?: EditorAiConversation['providerSession'];
  undoStack?: EditorAiConversation['undoStack'];
  compactSummary?: EditorAiConversation['compactSummary'];
  lastPrefixHash?: EditorAiConversation['lastPrefixHash'];
  cacheContext?: EditorAiConversation['cacheContext'];
}

export interface EditorConversationRepository {
  create(input: CreateEditorConversationInput): EditorAiConversation;
  save(conversation: EditorAiConversation): Promise<EditorAiConversation>;
  remove(conversation: EditorAiConversation): Promise<void>;
  findByOwnerAndTemplate(
    ownerUserId: string,
    templateId: string,
  ): Promise<EditorAiConversation | null>;
}

export type { EditorAiCacheContextRecord, EditorAiConversationUndoStackRecord };
