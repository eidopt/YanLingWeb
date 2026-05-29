import type { ThemeLayoutDocument } from '../../layout/types';
import {
  buildNodeFromDraft,
  createDraftFromNode,
  descriptorForAlias,
  findNode,
  findParentId,
  type NodeDraft,
  upsertNode,
  validateDraft,
} from 'domain/template';
import type { Dispatch, SetStateAction } from 'react';
import { editorNodeDialogStateActions, useEditorNodeDialogSnapshot } from 'state/editorNodeDialogState';

interface UseNodeEditDialogControllerArgs {
  currentDocument: ThemeLayoutDocument;
  setEditorDocument: Dispatch<SetStateAction<ThemeLayoutDocument | null>>;
  setSelectedNodeId: (nodeId: string | null) => void;
}

export function useNodeEditDialogController({
  currentDocument,
  setEditorDocument,
  setSelectedNodeId,
}: UseNodeEditDialogControllerArgs) {
  const { dialogState, dialogError } = useEditorNodeDialogSnapshot();
  const { setDialogState, setDialogError, resetDialog } = editorNodeDialogStateActions;

  function openEditDialog(nodeId: string) {
    const node = findNode(currentDocument.layout, nodeId);
    if (!node) {
      return;
    }

    const descriptor = descriptorForAlias(currentDocument, node.alias);
    if (!descriptor) {
      return;
    }

    setDialogError('');
    setDialogState({
      descriptor,
      draft: createDraftFromNode(
        descriptor,
        node,
        findParentId(currentDocument.layout, nodeId) ?? currentDocument.layout.id,
      ),
    });
  }

  function closeDialog() {
    resetDialog();
  }

  function updateDraft<K extends keyof NodeDraft>(key: K, value: NodeDraft[K]) {
    setDialogState((current) => {
      if (!current) {
        return current;
      }

      const nextDraft = { ...current.draft, [key]: value };
      if (key === 'parentId' && value !== currentDocument.layout.id && nextDraft.slot === 'footer') {
        nextDraft.slot = 'body';
      }
      return { ...current, draft: nextDraft };
    });
  }

  function updateDraftProp(name: string, value: string | boolean) {
    setDialogState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        draft: {
          ...current.draft,
          props: {
            ...current.draft.props,
            [name]: value,
          },
        },
      };
    });
  }

  function handleSaveDraft() {
    if (!dialogState) {
      return;
    }

    const error = validateDraft(dialogState.descriptor, dialogState.draft);
    if (error) {
      setDialogError(error);
      return;
    }

    const existingNode = dialogState.draft.nodeId ? findNode(currentDocument.layout, dialogState.draft.nodeId) : null;
    const nextNode = buildNodeFromDraft(dialogState.descriptor, dialogState.draft, existingNode?.children);

    setEditorDocument((current) => {
      if (!current) {
        return current;
      }

      return upsertNode(current, dialogState.draft.parentId, nextNode, dialogState.draft.nodeId) ?? current;
    });

    setSelectedNodeId(nextNode.id);
    closeDialog();
  }

  function resetDialogState() {
    closeDialog();
  }

  return {
    dialogState,
    dialogError,
    openEditDialog,
    closeDialog,
    updateDraft,
    updateDraftProp,
    handleSaveDraft,
    resetDialogState,
  };
}
