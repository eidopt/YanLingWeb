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
import {
  Box,
  Button,
  Checkbox,
  Dropdown,
  Heading,
  Input,
  Label,
  Stack,
  Text,
  TextArea,
} from 'ui/system';

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
    <Stack className={styles.panel}>
      <Box className={styles.panelHeader}>
        <Stack gap="xs">
          <Heading as="h3" size="xs" variant="primary" weight="bold">
            {getComponentDisplayName(
              selectedNode.alias,
              selectedDescriptor?.name,
            )}
          </Heading>
          <Text size="sm" variant="muted">{selectedNodeInspectorContent.description}</Text>
        </Stack>
      </Box>

      <Box as="article" className={styles.inspectorCard}>
        {selectedDescriptor ? (
          <Box as="section" className={styles.dialogSection}>
            <Box className={styles.formGrid}>
              {selectedDescriptor.props.map((prop) => {
                const isWide = prop.type === 'string[]';
                const value = selectedNode.props?.[prop.name];

                if (prop.type === 'boolean') {
                  return (
                    <Checkbox
                      key={prop.name}
                      checked={Boolean(value)}
                      label={(
                        <>
                        {getPropDisplayName(prop)}{' '}
                        {prop.required
                          ? (
                            <Box as="span" className={styles.required}>*</Box>
                          )
                          : null}
                        </>
                      )}
                      onCheckedChange={(checked) =>
                        onPropChange(prop.name, checked)
                      }
                    />
                  );
                }

                if (prop.enum?.length) {
                  return (
                    <Label key={prop.name} className={styles.field}>
                      <Text as="span" size="xs" variant="secondary" weight="bold">
                        {getPropDisplayName(prop)}{' '}
                      {prop.required
                          ? (
                          <Box as="span" className={styles.required}>*</Box>
                        )
                        : null}
                      </Text>
                      <Dropdown
                        value={toFieldValue(value)}
                        onValueChange={(nextValue) =>
                          onPropChange(prop.name, nextValue)
                        }
                        options={[
                          {
                            label: selectedNodeInspectorContent.emptyOption,
                            value: '',
                          },
                          ...prop.enum.map((option) => ({
                            label: getOptionDisplayName(option),
                            value: option,
                          })),
                        ]}
                        size="sm"
                        variant="filled"
                      />
                    </Label>
                  );
                }

                return (
                  <Label
                    key={prop.name}
                    className={`${styles.field} ${isWide ? styles.fieldWide : ''}`}
                  >
                    <Text as="span" size="xs" variant="secondary" weight="bold">
                      {getPropDisplayName(prop)}{' '}
                    {prop.required
                      ? (
                        <Box as="span" className={styles.required}>*</Box>
                      )
                      : null}
                    </Text>
                    {prop.type === 'string[]' ? (
                      <TextArea
                        value={toFieldValue(value)}
                        onChange={(event) =>
                          onPropChange(prop.name, event.target.value)
                        }
                        placeholder={
                          prop.description ??
                          selectedNodeInspectorContent.arrayPlaceholder
                        }
                        size="sm"
                        variant="filled"
                      />
                    ) : (
                      <Input
                        type={
                          prop.type === 'number' ? 'number' : 'text'
                        }
                        value={toFieldValue(value)}
                        onChange={(event) =>
                          onPropChange(prop.name, event.target.value)
                        }
                        placeholder={prop.description ?? prop.type}
                        size="sm"
                        variant="filled"
                      />
                    )}
                  </Label>
                );
              })}
            </Box>
          </Box>
        ) : null}

        <Box className={styles.treeActions}>
          <Button
            type="button"
            onClick={onEdit}
            size="sm"
            variant="secondary"
          >
            {selectedNodeInspectorContent.editButton}
          </Button>
          {canDelete ? (
            <Button
              type="button"
              onClick={onDelete}
              size="sm"
              variant="danger-soft"
            >
              {selectedNodeInspectorContent.deleteButton}
            </Button>
          ) : null}
        </Box>
      </Box>
    </Stack>
  );
}
