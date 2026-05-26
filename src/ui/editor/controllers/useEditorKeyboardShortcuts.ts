'use client';

import { useEffect } from 'react';

interface UseEditorKeyboardShortcutsArgs {
  /** Delete the currently selected node */
  onDelete: () => void;
  /** Deselect the current node */
  onDeselect: () => void;
  /** Close any open dialog */
  onCloseDialog: () => void;
  /** Whether shortcuts are enabled (e.g. disabled in preview mode) */
  enabled: boolean;
}

/**
 * Global keyboard shortcuts for the layout editor.
 * Zero-CSS — purely functional enhancement.
 *
 * Shortcuts:
 * - Delete / Backspace → delete selected node
 * - Escape → deselect node (or close dialog)
 */
export function useEditorKeyboardShortcuts({
  onDelete,
  onDeselect,
  onCloseDialog,
  enabled,
}: UseEditorKeyboardShortcutsArgs) {
  useEffect(() => {
    if (!enabled) {return;}

    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when typing in inputs
      if (!(e.target instanceof HTMLElement)) {return;}
      const target = e.target;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {return;}
      if (target.isContentEditable) {return;}

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          onDelete();
          break;
        case 'Escape':
          e.preventDefault();
          onCloseDialog();
          // Fall through — Escape also deselects after closing dialog
          onDeselect();
          break;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onDelete, onDeselect, onCloseDialog]);
}
