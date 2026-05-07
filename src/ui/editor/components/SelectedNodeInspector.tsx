'use client';

import type {
  ThemeComponentDescriptor,
  ThemeLayoutNode,
} from '../../layout/types';
import {
  getComponentDisplayName,
  getOptionDisplayName,
  getPropDisplayName,
} from '../displayText';
import styles from '../ThemeLayoutBuilder.module.css';
import {
  selectedNodeInspectorContent,
} from './SelectedNodeInspector.content';
import { cx } from 'base/classname';

interface SelectedNodeInspectorProps {
  selectedNode: ThemeLayoutNode;
  selectedDescriptor: ThemeComponentDescriptor | null;
  onPropChange: (name: string, value: string | boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

function toFieldValue(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return '';
}

export function SelectedNodeInspector({
  selectedNode,
  selectedDescriptor,
  onPropChange,
  onEdit,
  onDelete,
  canDelete,
}: SelectedNodeInspectorProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h3>
            {getComponentDisplayName(
              selectedNode.alias,
              selectedDescriptor?.name,
            )}
          </h3>
          <p>{selectedNodeInspectorContent.description}</p>
        </div>
      </div>

      <article className={styles.inspectorCard}>
        {selectedDescriptor ? (
          <section className={styles.dialogSection}>
            <div className={styles.formGrid}>
              {selectedDescriptor.props.map((prop) => {
                const isWide = prop.type === 'string[]';
                const value = selectedNode.props?.[prop.name];

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
                          onPropChange(prop.name, event.target.checked)
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
                        ? (
                          <span className={styles.required}>*</span>
                        )
                        : null}
                      <select
                        value={toFieldValue(value)}
                        onChange={(event) =>
                          onPropChange(prop.name, event.target.value)
                        }
                      >
                        <option value="">
                          {selectedNodeInspectorContent.emptyOption}
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
                      ? (
                        <span className={styles.required}>*</span>
                      )
                      : null}
                    {prop.type === 'string[]' ? (
                      <textarea
                        value={toFieldValue(value)}
                        onChange={(event) =>
                          onPropChange(prop.name, event.target.value)
                        }
                        placeholder={
                          prop.description ??
                          selectedNodeInspectorContent.arrayPlaceholder
                        }
                      />
                    ) : (
                      <input
                        type={
                          prop.type === 'number' ? 'number' : 'text'
                        }
                        value={toFieldValue(value)}
                        onChange={(event) =>
                          onPropChange(prop.name, event.target.value)
                        }
                        placeholder={prop.description ?? prop.type}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className={styles.treeActions}>
          <button
            type="button"
            className={styles.miniButton}
            onClick={onEdit}
          >
            {selectedNodeInspectorContent.editButton}
          </button>
          {canDelete ? (
            <button
              type="button"
              className={styles.dangerButton}
              onClick={onDelete}
            >
              {selectedNodeInspectorContent.deleteButton}
            </button>
          ) : null}
        </div>
      </article>
    </div>
  );
}
