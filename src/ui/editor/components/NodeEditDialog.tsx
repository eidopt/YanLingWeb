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
import type { ReactNode } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dropdown,
  type DropdownOption,
  Heading,
  Input,
  Label,
  Stack,
  Text,
  TextArea,
} from 'ui/base';

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

interface FieldProps {
  children: ReactNode;
  label: ReactNode;
  required?: boolean;
  wide?: boolean;
}

function RequiredMark() {
  return <Box as="span" className={styles.required}>*</Box>;
}

function Field({
  children,
  label,
  required = false,
  wide = false,
}: FieldProps) {
  return (
    <Label className={cx(styles.field, wide && styles.fieldWide)}>
      <Text as="span" size="xs" variant="secondary" weight="bold">
        {label}{required ? <> <RequiredMark /></> : null}
      </Text>
      {children}
    </Label>
  );
}

interface TextInputFieldProps {
  disabled?: boolean;
  label: ReactNode;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: 'number' | 'text';
  value: string | number;
  wide?: boolean;
}

function TextInputField({
  disabled,
  label,
  onChange,
  placeholder,
  required,
  type = 'text',
  value,
  wide,
}: TextInputFieldProps) {
  return (
    <Field label={label} required={required} wide={wide}>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        size="sm"
        variant="filled"
      />
    </Field>
  );
}

interface TextAreaFieldProps {
  label: ReactNode;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
  wide?: boolean;
}

function TextAreaField({
  label,
  onChange,
  placeholder,
  required,
  value,
  wide,
}: TextAreaFieldProps) {
  return (
    <Field label={label} required={required} wide={wide}>
      <TextArea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        size="sm"
        variant="filled"
      />
    </Field>
  );
}

interface SelectFieldProps {
  disabled?: boolean;
  label: ReactNode;
  onChange: (value: string) => void;
  options: DropdownOption[];
  required?: boolean;
  value: string;
}

function SelectField({
  disabled,
  label,
  onChange,
  options,
  required,
  value,
}: SelectFieldProps) {
  return (
    <Field label={label} required={required}>
      <Dropdown
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        options={options}
        size="sm"
        variant="filled"
      />
    </Field>
  );
}

function toPropFieldValue(value: unknown) {
  return typeof value === 'string' ? value : '';
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

  const defaultOption = themeLayoutBuilderContent.dialog.defaultOption;
  const disabledAbsoluteFields =
    dialogState.draft.layoutMode !== 'absolute';
  const alignOptions = [
    { label: defaultOption, value: '' },
    ...ALIGN_OPTIONS.map((option) => ({ label: option, value: option })),
  ];

  return (
    <Box className={styles.overlay}>
      <Stack className={styles.dialog}>
        <Box className={styles.dialogHeader}>
          <Heading as="h3" size="xs" variant="primary" weight="bold">
            {themeLayoutBuilderContent.dialog.title}
          </Heading>
          <Button
            type="button"
            onClick={onClose}
            size="sm"
            variant="secondary"
          >
            {themeLayoutBuilderContent.dialog.close}
          </Button>
        </Box>

        <Box className={styles.dialogGrid}>
          <Box as="section" className={styles.dialogSection}>
            <Heading as="h4" size="xs" variant="primary" weight="bold">
              {themeLayoutBuilderContent.dialog.layoutSectionTitle}
            </Heading>
            <Box className={styles.formGrid}>
              <SelectField
                label={themeLayoutBuilderContent.dialog.parentLabel}
                required
                value={dialogState.draft.parentId}
                onChange={(value) => onUpdateDraft('parentId', value)}
                options={containerNodes.map(({ node, depth }) => ({
                  label: `${'— '.repeat(depth)}${node.id}`,
                  value: node.id,
                }))}
              />

              <SelectField
                label={themeLayoutBuilderContent.dialog.slotLabel}
                value={dialogState.draft.slot}
                onChange={(value) =>
                  onUpdateDraft('slot', value as NodeDraft['slot'])
                }
                disabled={dialogState.draft.parentId !== rootId}
                options={[
                  { label: 'body', value: 'body' },
                  { label: 'footer', value: 'footer' },
                ]}
              />

              <SelectField
                label="layout.mode"
                required
                value={dialogState.draft.layoutMode}
                onChange={(value) =>
                  onUpdateDraft('layoutMode', value as DraftLayoutMode)
                }
                options={[
                  { label: 'flow', value: 'flow' },
                  { label: 'grid', value: 'grid' },
                  { label: 'absolute', value: 'absolute' },
                ]}
              />

              <TextInputField
                label="order"
                value={dialogState.draft.order}
                onChange={(value) => onUpdateDraft('order', value)}
                placeholder={themeLayoutBuilderContent.dialog.orderPlaceholder}
              />

              {dialogState.draft.layoutMode !== 'absolute' ? (
                <>
                  <TextInputField
                    label="width"
                    value={dialogState.draft.width}
                    onChange={(value) => onUpdateDraft('width', value)}
                    placeholder="100% / 240"
                  />
                  <TextInputField
                    label="height"
                    value={dialogState.draft.height}
                    onChange={(value) => onUpdateDraft('height', value)}
                    placeholder={
                      themeLayoutBuilderContent.dialog.sizeOptionalPlaceholder
                    }
                  />
                  <TextInputField
                    label="minWidth"
                    value={dialogState.draft.minWidth}
                    onChange={(value) => onUpdateDraft('minWidth', value)}
                  />
                  <TextInputField
                    label="minHeight"
                    value={dialogState.draft.minHeight}
                    onChange={(value) => onUpdateDraft('minHeight', value)}
                  />
                  <TextInputField
                    label="maxWidth"
                    value={dialogState.draft.maxWidth}
                    onChange={(value) => onUpdateDraft('maxWidth', value)}
                  />
                  <TextInputField
                    label="maxHeight"
                    value={dialogState.draft.maxHeight}
                    onChange={(value) => onUpdateDraft('maxHeight', value)}
                  />
                  <SelectField
                    label="alignSelf"
                    value={dialogState.draft.alignSelf}
                    onChange={(value) => onUpdateDraft('alignSelf', value)}
                    options={alignOptions}
                  />
                  <SelectField
                    label="justifySelf"
                    value={dialogState.draft.justifySelf}
                    onChange={(value) => onUpdateDraft('justifySelf', value)}
                    options={alignOptions}
                  />
                </>
              ) : null}

              {dialogState.draft.layoutMode === 'grid' ? (
                <>
                  <TextInputField
                    label="gridColumn"
                    value={dialogState.draft.gridColumn}
                    onChange={(value) => onUpdateDraft('gridColumn', value)}
                    placeholder={
                      themeLayoutBuilderContent.dialog.gridColumnPlaceholder
                    }
                  />
                  <TextInputField
                    label="gridRow"
                    value={dialogState.draft.gridRow}
                    onChange={(value) => onUpdateDraft('gridRow', value)}
                    placeholder={
                      themeLayoutBuilderContent.dialog.gridRowPlaceholder
                    }
                  />
                </>
              ) : null}
            </Box>
          </Box>

          <Box as="section" className={styles.dialogSection}>
            <Heading as="h4" size="xs" variant="primary" weight="bold">
              {themeLayoutBuilderContent.dialog.absoluteSectionTitle}
            </Heading>
            <Box className={styles.formGrid}>
              <SelectField
                label="frame.unit"
                value={dialogState.draft.frameUnit}
                onChange={(value) =>
                  onUpdateDraft('frameUnit', value as NodeDraft['frameUnit'])
                }
                disabled={disabledAbsoluteFields}
                options={[
                  { label: 'px', value: 'px' },
                  { label: '%', value: '%' },
                ]}
              />
              {[
                ['zIndex', 'frameZIndex'],
                ['x', 'frameX'],
                ['y', 'frameY'],
                ['left', 'frameLeft'],
                ['top', 'frameTop'],
                ['right', 'frameRight'],
                ['bottom', 'frameBottom'],
                ['frame.width', 'frameWidth'],
                ['frame.height', 'frameHeight'],
              ].map(([label, key]) => (
                <TextInputField
                  key={key}
                  label={label}
                  value={dialogState.draft[key as keyof NodeDraft] as string}
                  onChange={(value) =>
                    onUpdateDraft(key as keyof NodeDraft, value)
                  }
                  disabled={disabledAbsoluteFields}
                />
              ))}
            </Box>
          </Box>
        </Box>

        <Box as="section" className={styles.dialogSection}>
          <Heading as="h4" size="xs" variant="primary" weight="bold">
            {themeLayoutBuilderContent.dialog.componentSectionTitle}
          </Heading>
          <Box className={styles.formGrid}>
            {dialogState.descriptor.props.map((prop) => {
              const isWide = prop.type === 'string[]';
              const value = dialogState.draft.props[prop.name];
              const label = getPropDisplayName(prop);

              if (prop.type === 'boolean') {
                return (
                  <Checkbox
                    key={prop.name}
                    checked={Boolean(value)}
                    label={(
                      <>
                        {label}{prop.required ? <> <RequiredMark /></> : null}
                      </>
                    )}
                    onCheckedChange={(checked) =>
                      onUpdateDraftProp(prop.name, checked)
                    }
                  />
                );
              }

              if (prop.enum?.length) {
                return (
                  <SelectField
                    key={prop.name}
                    label={label}
                    required={prop.required}
                    value={toPropFieldValue(value)}
                    onChange={(nextValue) =>
                      onUpdateDraftProp(prop.name, nextValue)
                    }
                    options={[
                      {
                        label: themeLayoutBuilderContent.dialog.emptyOption,
                        value: '',
                      },
                      ...prop.enum.map((option) => ({
                        label: getOptionDisplayName(option),
                        value: option,
                      })),
                    ]}
                  />
                );
              }

              return prop.type === 'string[]' ? (
                <TextAreaField
                  key={prop.name}
                  label={label}
                  required={prop.required}
                  wide={isWide}
                  value={toPropFieldValue(value)}
                  onChange={(nextValue) =>
                    onUpdateDraftProp(prop.name, nextValue)
                  }
                  placeholder={
                    prop.description ??
                    themeLayoutBuilderContent.dialog.arrayPlaceholder
                  }
                />
              ) : (
                <TextInputField
                  key={prop.name}
                  label={label}
                  required={prop.required}
                  value={toPropFieldValue(value)}
                  onChange={(nextValue) =>
                    onUpdateDraftProp(prop.name, nextValue)
                  }
                  placeholder={prop.description ?? prop.type}
                />
              );
            })}
          </Box>
        </Box>

        {dialogError ? (
          <Box className={styles.error}>
            <Text size="sm" variant="danger" weight="bold">{dialogError}</Text>
          </Box>
        ) : null}

        <Box className={styles.dialogActions}>
          <Button
            type="button"
            onClick={onClose}
            size="sm"
            variant="secondary"
          >
            {themeLayoutBuilderContent.dialog.cancel}
          </Button>
          <Button
            type="button"
            onClick={onSave}
            size="sm"
            variant="primary"
          >
            {themeLayoutBuilderContent.dialog.save}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
