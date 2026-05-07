'use client';

import {
  getOptionDisplayName,
  getPropDisplayName,
} from '../displayText';
import type {
  DialogState,
  DraftLayoutMode,
  FlatNode,
  NodeDraft,
} from '../services/layoutBuilderService';
import { ALIGN_OPTIONS } from '../services/layoutBuilderService';
import { themeLayoutBuilderContent } from '../ThemeLayoutBuilder.content';
import styles from '../ThemeLayoutBuilder.module.css';
import { cx } from 'base/classname';

interface NodeEditDialogProps {
  dialogState: DialogState | null;
  dialogError: string;
  containerNodes: FlatNode[];
  rootId: string;
  onClose: () => void;
  onUpdateDraft: <K extends keyof NodeDraft>(
    key: K,
    value: NodeDraft[K],
  ) => void;
  onUpdateDraftProp: (name: string, value: string | boolean) => void;
  onSave: () => void;
}

export function NodeEditDialog({
  dialogState,
  dialogError,
  containerNodes,
  rootId,
  onClose,
  onUpdateDraft,
  onUpdateDraftProp,
  onSave,
}: NodeEditDialogProps) {
  if (!dialogState) {
    return null;
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <div className={styles.dialogHeader}>
          <div>
            <h3>{themeLayoutBuilderContent.dialog.title}</h3>
          </div>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={onClose}
          >
            {themeLayoutBuilderContent.dialog.close}
          </button>
        </div>

        <div className={styles.dialogGrid}>
          <section className={styles.dialogSection}>
            <h4>
              {themeLayoutBuilderContent.dialog.layoutSectionTitle}
            </h4>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                {themeLayoutBuilderContent.dialog.parentLabel}{' '}
                <span className={styles.required}>*</span>
                <select
                  value={dialogState.draft.parentId}
                  onChange={(event) =>
                    onUpdateDraft('parentId', event.target.value)
                  }
                >
                  {containerNodes.map(({ node, depth }) => (
                    <option key={node.id} value={node.id}>
                      {`${'— '.repeat(depth)}${node.id}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                {themeLayoutBuilderContent.dialog.slotLabel}
                <select
                  value={dialogState.draft.slot}
                  onChange={(event) =>
                    onUpdateDraft(
                      'slot',
                      event.target.value as NodeDraft['slot'],
                    )
                  }
                  disabled={dialogState.draft.parentId !== rootId}
                >
                  <option value="body">body</option>
                  <option value="footer">footer</option>
                </select>
              </label>

              <label className={styles.field}>
                layout.mode <span className={styles.required}>*</span>
                <select
                  value={dialogState.draft.layoutMode}
                  onChange={(event) =>
                    onUpdateDraft(
                      'layoutMode',
                      event.target.value as DraftLayoutMode,
                    )
                  }
                >
                  <option value="flow">flow</option>
                  <option value="grid">grid</option>
                  <option value="absolute">absolute</option>
                </select>
              </label>

              <label className={styles.field}>
                order
                <input
                  value={dialogState.draft.order}
                  onChange={(event) =>
                    onUpdateDraft('order', event.target.value)
                  }
                  placeholder={
                    themeLayoutBuilderContent.dialog.orderPlaceholder
                  }
                />
              </label>

              {dialogState.draft.layoutMode !== 'absolute' ? (
                <>
                  <label className={styles.field}>
                    width
                    <input
                      value={dialogState.draft.width}
                      onChange={(event) =>
                        onUpdateDraft('width', event.target.value)
                      }
                      placeholder="100% / 240"
                    />
                  </label>

                  <label className={styles.field}>
                    height
                    <input
                      value={dialogState.draft.height}
                      onChange={(event) =>
                        onUpdateDraft('height', event.target.value)
                      }
                      placeholder={
                        themeLayoutBuilderContent.dialog
                          .sizeOptionalPlaceholder
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    minWidth
                    <input
                      value={dialogState.draft.minWidth}
                      onChange={(event) =>
                        onUpdateDraft('minWidth', event.target.value)
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    minHeight
                    <input
                      value={dialogState.draft.minHeight}
                      onChange={(event) =>
                        onUpdateDraft('minHeight', event.target.value)
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    maxWidth
                    <input
                      value={dialogState.draft.maxWidth}
                      onChange={(event) =>
                        onUpdateDraft('maxWidth', event.target.value)
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    maxHeight
                    <input
                      value={dialogState.draft.maxHeight}
                      onChange={(event) =>
                        onUpdateDraft('maxHeight', event.target.value)
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    alignSelf
                    <select
                      value={dialogState.draft.alignSelf}
                      onChange={(event) =>
                        onUpdateDraft('alignSelf', event.target.value)
                      }
                    >
                      <option value="">
                        {themeLayoutBuilderContent.dialog.defaultOption}
                      </option>
                      {ALIGN_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    justifySelf
                    <select
                      value={dialogState.draft.justifySelf}
                      onChange={(event) =>
                        onUpdateDraft('justifySelf', event.target.value)
                      }
                    >
                      <option value="">
                        {themeLayoutBuilderContent.dialog.defaultOption}
                      </option>
                      {ALIGN_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}

              {dialogState.draft.layoutMode === 'grid' ? (
                <>
                  <label className={styles.field}>
                    gridColumn
                    <input
                      value={dialogState.draft.gridColumn}
                      onChange={(event) =>
                        onUpdateDraft('gridColumn', event.target.value)
                      }
                      placeholder={
                        themeLayoutBuilderContent.dialog
                          .gridColumnPlaceholder
                      }
                    />
                  </label>

                  <label className={styles.field}>
                    gridRow
                    <input
                      value={dialogState.draft.gridRow}
                      onChange={(event) =>
                        onUpdateDraft('gridRow', event.target.value)
                      }
                      placeholder={
                        themeLayoutBuilderContent.dialog.gridRowPlaceholder
                      }
                    />
                  </label>
                </>
              ) : null}
            </div>
          </section>

          <section className={styles.dialogSection}>
            <h4>
              {themeLayoutBuilderContent.dialog.absoluteSectionTitle}
            </h4>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                frame.unit
                <select
                  value={dialogState.draft.frameUnit}
                  onChange={(event) =>
                    onUpdateDraft(
                      'frameUnit',
                      event.target.value as NodeDraft['frameUnit'],
                    )
                  }
                  disabled={dialogState.draft.layoutMode !== 'absolute'}
                >
                  <option value="px">px</option>
                  <option value="%">%</option>
                </select>
              </label>

              <label className={styles.field}>
                zIndex
                <input
                  value={dialogState.draft.frameZIndex}
                  onChange={(event) =>
                    onUpdateDraft('frameZIndex', event.target.value)
                  }
                  disabled={
                    dialogState.draft.layoutMode !== 'absolute'
                  }
                />
              </label>

              <label className={styles.field}>
                x
                <input
                  value={dialogState.draft.frameX}
                  onChange={(event) =>
                    onUpdateDraft('frameX', event.target.value)
                  }
                  disabled={
                    dialogState.draft.layoutMode !== 'absolute'
                  }
                />
              </label>

              <label className={styles.field}>
                y
                <input
                  value={dialogState.draft.frameY}
                  onChange={(event) =>
                    onUpdateDraft('frameY', event.target.value)
                  }
                  disabled={
                    dialogState.draft.layoutMode !== 'absolute'
                  }
                />
              </label>

              <label className={styles.field}>
                left
                <input
                  value={dialogState.draft.frameLeft}
                  onChange={(event) =>
                    onUpdateDraft('frameLeft', event.target.value)
                  }
                  disabled={
                    dialogState.draft.layoutMode !== 'absolute'
                  }
                />
              </label>

              <label className={styles.field}>
                top
                <input
                  value={dialogState.draft.frameTop}
                  onChange={(event) =>
                    onUpdateDraft('frameTop', event.target.value)
                  }
                  disabled={
                    dialogState.draft.layoutMode !== 'absolute'
                  }
                />
              </label>

              <label className={styles.field}>
                right
                <input
                  value={dialogState.draft.frameRight}
                  onChange={(event) =>
                    onUpdateDraft('frameRight', event.target.value)
                  }
                  disabled={
                    dialogState.draft.layoutMode !== 'absolute'
                  }
                />
              </label>

              <label className={styles.field}>
                bottom
                <input
                  value={dialogState.draft.frameBottom}
                  onChange={(event) =>
                    onUpdateDraft('frameBottom', event.target.value)
                  }
                  disabled={
                    dialogState.draft.layoutMode !== 'absolute'
                  }
                />
              </label>

              <label className={styles.field}>
                frame.width
                <input
                  value={dialogState.draft.frameWidth}
                  onChange={(event) =>
                    onUpdateDraft('frameWidth', event.target.value)
                  }
                  disabled={
                    dialogState.draft.layoutMode !== 'absolute'
                  }
                />
              </label>

              <label className={styles.field}>
                frame.height
                <input
                  value={dialogState.draft.frameHeight}
                  onChange={(event) =>
                    onUpdateDraft('frameHeight', event.target.value)
                  }
                  disabled={
                    dialogState.draft.layoutMode !== 'absolute'
                  }
                />
              </label>
            </div>
          </section>
        </div>

        <section className={styles.dialogSection}>
          <h4>
            {themeLayoutBuilderContent.dialog.componentSectionTitle}
          </h4>
          <div className={styles.formGrid}>
            {dialogState.descriptor.props.map((prop) => {
              const isWide = prop.type === 'string[]';
              const value = dialogState.draft.props[prop.name];

              if (prop.type === 'boolean') {
                return (
                  <label
                    key={prop.name}
                    className={cx(
                      styles.checkboxField,
                      isWide && styles.fieldWide,
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) =>
                        onUpdateDraftProp(
                          prop.name,
                          event.target.checked,
                        )
                      }
                    />
                    <span>
                      {getPropDisplayName(prop)}{' '}
                      {prop.required
                        ? (
                          <span className={styles.required}>*</span>
                        )
                        : null}
                    </span>
                  </label>
                );
              }

              if (prop.enum?.length) {
                return (
                  <label key={prop.name} className={styles.field}>
                    {getPropDisplayName(prop)}{' '}
                    {prop.required
                      ? <span className={styles.required}>*</span>
                      : null}
                    <select
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) =>
                        onUpdateDraftProp(
                          prop.name,
                          event.target.value,
                        )
                      }
                    >
                      <option value="">
                        {themeLayoutBuilderContent.dialog.emptyOption}
                      </option>
                      {prop.enum.map((option) => (
                        <option key={option} value={option}>
                          {getOptionDisplayName(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }

              return (
                <label
                  key={prop.name}
                  className={cx(
                    styles.field,
                    isWide && styles.fieldWide,
                  )}
                >
                  {getPropDisplayName(prop)}{' '}
                  {prop.required
                    ? <span className={styles.required}>*</span>
                    : null}
                  {prop.type === 'string[]' ? (
                    <textarea
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) =>
                        onUpdateDraftProp(
                          prop.name,
                          event.target.value,
                        )
                      }
                      placeholder={
                        prop.description ??
                        themeLayoutBuilderContent.dialog.arrayPlaceholder
                      }
                    />
                  ) : (
                    <input
                      value={typeof value === 'string' ? value : ''}
                      onChange={(event) =>
                        onUpdateDraftProp(
                          prop.name,
                          event.target.value,
                        )
                      }
                      placeholder={prop.description ?? prop.type}
                    />
                  )}
                </label>
              );
            })}
          </div>
        </section>

        {dialogError
          ? <div className={styles.error}>{dialogError}</div>
          : null}

        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={onClose}
          >
            {themeLayoutBuilderContent.dialog.cancel}
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={onSave}
          >
            {themeLayoutBuilderContent.dialog.save}
          </button>
        </div>
      </div>
    </div>
  );
}
