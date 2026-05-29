import type {
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNavigateAction,
  ThemeLayoutNode,
  ThemeLayoutNodeAction,
  ThemeLayoutTabInteraction,
  ThemeLayoutWidgetPolicy,
  ValidationIssue,
} from '../types';
import {
  hasCjkText,
  hasDisallowedLatinText,
  isNonEmptyString,
  isPlainObject,
  issue,
  isValidGeneratedImageUrl,
  type ThemeLayoutValidatorOptions,
  validateDataSelector,
} from './themeLayoutValidator.shared';
import { validateWidgetNode } from './themeLayoutValidator.widget';

export const CORE_ALIASES = new Set([
  'core.screen',
  'core.panel',
  'core.progress',
  'core.stack',
  'core.row',
  'core.grid',
  'core.text',
  'core.button',
  'core.search',
  'core.tabs',
  'core.tag',
  'core.notice',
  'core.image',
  'core.html',
  'core.widget',
  'core.divider',
  'core.spacer',
  'core.input',
  'core.navbar',
  'core.tabbar',
  'core.breadcrumb',
  'core.pagination',
  'core.avatar',
  'core.badge',
  'core.list',
  'core.list-item',
  'core.statistic',
  'core.collapse',
  'core.carousel',
  'core.empty',
  'core.skeleton',
  'core.select',
  'core.checkbox',
  'core.radio',
  'core.switch',
  'core.rate',
  'core.slider',
  'core.datepicker',
  'core.timepicker',
  'core.form',
  'core.upload',
  'core.dialog',
  'core.toast',
  'core.alert',
  'core.loading',
  'core.drawer',
  'core.video',
  'core.audio',
  'core.sidebar',
  'core.toolbar',
  'core.splitter',
  'core.timeline',
  'core.tooltip',
  'core.tree',
  'core.table',
]);
const CORE_IMAGE_PROP_TYPES = new Map([
  ['assetId', 'string'],
  ['src', 'string'],
  ['alt', 'string'],
  ['title', 'string'],
  ['iconColor', 'string'],
  ['objectFit', 'string'],
]);
const CORE_SCREEN_PROP_TYPES = new Map([
  ['surface', 'string'],
  ['chrome', 'string'],
]);
const CORE_UNIVERSAL_PROP_TYPES = new Map([
  ['style', 'object'],
  ['dataBinding', 'object'],
]);
const CORE_PROP_ALIASES = new Map([
  ['core.button:text', 'label'],
  ['core.notice:variant', 'tone'],
]);

const CONTAINER_ALIASES = new Set([
  'core.screen',
  'core.panel',
  'core.stack',
  'core.row',
  'core.grid',
  'core.html',
  'core.navbar',
  'core.list',
  'core.list-item',
  'core.dialog',
  'core.drawer',
  'core.collapse',
  'core.sidebar',
  'core.form',
  'core.toolbar',
  'core.splitter',
  'core.timeline',
  'core.tree',
]);
const LAYOUT_MODES = new Set(['flow', 'grid', 'absolute']);
const VISIBILITY_ACTION_TARGET_ALIASES = new Set(['core.dialog', 'core.drawer']);
const DATA_BINDING_TARGET_ALIASES = new Set(['core.list', 'core.table', 'core.widget']);

export function collectAliases(
  document: ThemeLayoutDocument,
  componentTemplates?: Record<string, unknown>,
): Set<string> {
  const aliases = new Set(CORE_ALIASES);
  const components = Array.isArray(document.components) ? document.components : [];
  components.forEach((component) => aliases.add(component.alias));
  Object.keys(componentTemplates ?? document.componentTemplates ?? {}).forEach((alias) => aliases.add(alias));
  return aliases;
}

function descriptorForAlias(document: ThemeLayoutDocument, alias: string): ThemeComponentDescriptor | undefined {
  const components = Array.isArray(document.components) ? document.components : [];
  return components.find((component) => component.alias === alias);
}

function validatePropValue(
  descriptor: ThemeComponentDescriptor,
  propName: string,
  value: unknown,
  path: string,
): ValidationIssue | null {
  const fallbackType =
    CORE_UNIVERSAL_PROP_TYPES.get(propName) ??
    (descriptor.alias === 'core.screen' ? CORE_SCREEN_PROP_TYPES.get(propName) : undefined) ??
    (descriptor.alias === 'core.image' ? CORE_IMAGE_PROP_TYPES.get(propName) : undefined);
  const prop =
    descriptor.props.find((item) => item.name === propName) ??
    (fallbackType ? { name: propName, type: fallbackType } : undefined);
  if (!prop) {
    return issue('error', path, 'unknown_prop', `Unknown prop "${propName}" for ${descriptor.alias}`);
  }
  if (prop.enum?.length && !prop.enum.includes(String(value))) {
    return issue('error', path, 'invalid_enum', `Prop "${propName}" must be one of ${prop.enum.join(', ')}`);
  }
  if (prop.type === 'number' && !Number.isFinite(typeof value === 'number' ? value : Number(value))) {
    return issue('error', path, 'invalid_number', `Prop "${propName}" must be a number`);
  }
  if (prop.type === 'boolean' && typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
    return issue('error', path, 'invalid_boolean', `Prop "${propName}" must be boolean`);
  }
  if (prop.type === 'object' && !isPlainObject(value)) {
    return issue('error', path, 'invalid_object', `Prop "${propName}" must be an object`);
  }
  if (prop.type === 'array' && !Array.isArray(value)) {
    return issue('error', path, 'invalid_array', `Prop "${propName}" must be an array`);
  }
  if (prop.type === 'string[]' && (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))) {
    return issue('error', path, 'invalid_string_array', `Prop "${propName}" must be string[]`);
  }
  return null;
}

function validateNavigateAction(
  action: ThemeLayoutNavigateAction | undefined,
  pageIds: Set<string>,
  path: string,
  errors: ValidationIssue[],
): void {
  if (!action) {
    return;
  }
  if (!pageIds.has(action.targetPageId)) {
    errors.push(issue('error', path, 'invalid_navigation_target', `Unknown target page: ${action.targetPageId}`));
  }
}

function validateNodeAction(
  action: ThemeLayoutNodeAction | undefined,
  pageIds: Set<string>,
  nodesById: Map<string, ThemeLayoutNode>,
  path: string,
  errors: ValidationIssue[],
): void {
  if (!action) {
    return;
  }

  if (action.type === 'navigate') {
    validateNavigateAction(action, pageIds, path, errors);
    return;
  }

  const target = nodesById.get(action.targetNodeId);
  if (!target) {
    errors.push(issue('error', path, 'invalid_visibility_target', `Unknown target node: ${action.targetNodeId}`));
    return;
  }
  if (!VISIBILITY_ACTION_TARGET_ALIASES.has(target.alias)) {
    errors.push(
      issue(
        'error',
        path,
        'unsupported_visibility_target',
        `Visibility actions can only target dialog or drawer nodes: ${action.targetNodeId}`,
      ),
    );
  }
}

function isNavigateAction(value: ThemeLayoutTabInteraction): value is ThemeLayoutNavigateAction {
  return 'type' in value && value.type === 'navigate' && typeof value.targetPageId === 'string';
}

function validateTabInteraction(
  interaction: ThemeLayoutTabInteraction | undefined,
  pageIds: Set<string>,
  path: string,
  errors: ValidationIssue[],
): void {
  if (!interaction) {
    return;
  }
  if (isNavigateAction(interaction)) {
    validateNavigateAction(interaction, pageIds, path, errors);
    return;
  }
  Object.entries(interaction).forEach(([label, action]) => {
    validateNavigateAction(action, pageIds, `${path}.${label}`, errors);
  });
}

function validateNodeDataBinding(
  node: ThemeLayoutNode,
  path: string,
  dataSourceIds: Set<string>,
  errors: ValidationIssue[],
): void {
  const binding = node.props?.dataBinding;
  if (binding === undefined) {
    return;
  }
  if (!isPlainObject(binding)) {
    errors.push(issue('error', `${path}.props.dataBinding`, 'invalid_data_binding', 'dataBinding must be an object'));
    return;
  }
  if (!DATA_BINDING_TARGET_ALIASES.has(node.alias)) {
    errors.push(
      issue(
        'error',
        `${path}.props.dataBinding`,
        'unsupported_data_binding_alias',
        `dataBinding is supported only on ${[...DATA_BINDING_TARGET_ALIASES].join(', ')}`,
      ),
    );
  }
  const sourceId = binding.sourceId;
  if (!isNonEmptyString(sourceId)) {
    errors.push(
      issue(
        'error',
        `${path}.props.dataBinding.sourceId`,
        'missing_data_binding_source',
        'dataBinding.sourceId is required',
      ),
    );
  } else if (!dataSourceIds.has(sourceId)) {
    errors.push(
      issue(
        'error',
        `${path}.props.dataBinding.sourceId`,
        'unknown_data_binding_source',
        `Unknown data source: ${sourceId}`,
      ),
    );
  }
  validateDataSelector(binding.select, `${path}.props.dataBinding.select`, errors);
  ['loadingText', 'errorText', 'emptyText'].forEach((field) => {
    const value = binding[field];
    if (value !== undefined && typeof value !== 'string') {
      errors.push(
        issue('error', `${path}.props.dataBinding.${field}`, 'invalid_data_binding_text', `${field} must be a string`),
      );
    }
  });
}

function validateComponentTemplateNode(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (!isPlainObject(value)) {
    errors.push(issue('error', path, 'invalid_component_template_node', 'Component template node must be an object'));
    return;
  }

  const alias = value.alias;
  if (!isNonEmptyString(alias)) {
    errors.push(issue('error', `${path}.alias`, 'missing_template_node_alias', 'Template node alias is required'));
  } else if (!CORE_ALIASES.has(alias)) {
    errors.push(
      issue(
        'error',
        `${path}.alias`,
        'custom_component_template_alias',
        `componentTemplates may only expand to core.* aliases: ${alias}`,
      ),
    );
  }

  if ('children' in value && !Array.isArray(value.children)) {
    errors.push(issue('error', `${path}.children`, 'invalid_template_node_children', 'children must be an array'));
    return;
  }

  const children = Array.isArray(value.children) ? value.children : [];
  children.forEach((child, index) => {
    validateComponentTemplateNode(child, `${path}.children[${index}]`, errors);
  });
}

function validateComponentTemplates(
  componentTemplates: Record<string, unknown> | undefined,
  descriptorAliases: Set<string>,
  errors: ValidationIssue[],
): void {
  Object.entries(componentTemplates ?? {}).forEach(([alias, template]) => {
    if (alias.startsWith('core.')) {
      errors.push(
        issue(
          'error',
          `componentTemplates.${alias}`,
          'core_component_template_alias',
          'componentTemplates keys must be custom aliases, not core.* aliases.',
        ),
      );
    }
    if (!descriptorAliases.has(alias)) {
      errors.push(
        issue(
          'error',
          `componentTemplates.${alias}`,
          'missing_component_descriptor',
          `componentTemplates alias "${alias}" must be declared in layoutDocument.components.`,
        ),
      );
    }
    if (!isPlainObject(template)) {
      errors.push(
        issue('error', `componentTemplates.${alias}`, 'invalid_component_template', 'Template must be an object'),
      );
      return;
    }
    validateComponentTemplateNode(template.root, `componentTemplates.${alias}.root`, errors);
  });
}

export function validateComponentDescriptors(
  document: ThemeLayoutDocument,
  componentTemplates: Record<string, unknown> | undefined,
  errors: ValidationIssue[],
  options: ThemeLayoutValidatorOptions,
): void {
  if (!Array.isArray(document.components)) {
    return;
  }

  const aliases = new Set<string>();
  document.components.forEach((component, index) => {
    const path = `components[${index}]`;
    if (!isPlainObject(component)) {
      errors.push(issue('error', path, 'invalid_component_descriptor', 'Component descriptor must be an object'));
      return;
    }
    if (!isNonEmptyString(component.alias)) {
      errors.push(issue('error', `${path}.alias`, 'missing_component_alias', 'Component alias is required'));
      return;
    }
    if (aliases.has(component.alias)) {
      errors.push(
        issue('error', `${path}.alias`, 'duplicate_component_alias', `Duplicate component alias: ${component.alias}`),
      );
    }
    aliases.add(component.alias);

    if (component.alias.startsWith('core.') && !CORE_ALIASES.has(component.alias)) {
      errors.push(issue('error', `${path}.alias`, 'unknown_core_alias', `Unknown core alias: ${component.alias}`));
    }
    if (!component.alias.startsWith('core.') && !componentTemplates?.[component.alias]) {
      errors.push(
        issue(
          'error',
          `${path}.alias`,
          'missing_component_template',
          `Custom alias "${component.alias}" must have a matching componentTemplates entry.`,
        ),
      );
    }
    if (options.requireLocalizedPropLabels) {
      if (!Array.isArray(component.props)) {
        errors.push(issue('error', `${path}.props`, 'invalid_component_props', 'Component props must be an array'));
        return;
      }
      component.props.forEach((prop, propIndex) => {
        if (!isPlainObject(prop)) {
          errors.push(
            issue(
              'error',
              `${path}.props[${propIndex}]`,
              'invalid_prop_descriptor',
              'Prop descriptor must be an object',
            ),
          );
          return;
        }
        if (!hasCjkText(prop.label ?? '')) {
          errors.push(
            issue(
              'error',
              `${path}.props[${propIndex}].label`,
              'missing_localized_prop_label',
              `Editable prop "${prop.name}" must define a Chinese label`,
            ),
          );
        }
      });
    }
  });

  validateComponentTemplates(componentTemplates, aliases, errors);
}

export function validateNode(
  document: ThemeLayoutDocument,
  node: ThemeLayoutNode,
  path: string,
  aliases: Set<string>,
  pageIds: Set<string>,
  nodesById: Map<string, ThemeLayoutNode>,
  dataSourceIds: Set<string>,
  dependencyNames: Set<string>,
  widgetPolicy: ThemeLayoutWidgetPolicy | undefined,
  seenIds: Set<string>,
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  options: ThemeLayoutValidatorOptions,
): void {
  if (!isNonEmptyString(node.id)) {
    errors.push(issue('error', `${path}.id`, 'missing_node_id', 'Node id is required'));
  } else if (seenIds.has(node.id)) {
    errors.push(issue('error', `${path}.id`, 'duplicate_node_id', `Duplicate node id: ${node.id}`));
  } else {
    seenIds.add(node.id);
  }

  if (!isNonEmptyString(node.alias)) {
    errors.push(issue('error', `${path}.alias`, 'missing_alias', 'Node alias is required'));
  } else if (!aliases.has(node.alias)) {
    errors.push(issue('error', `${path}.alias`, 'unknown_alias', `Unknown alias: ${node.alias}`));
  }

  const nodeLayout = (node as Partial<ThemeLayoutNode>).layout;
  if (!nodeLayout || !LAYOUT_MODES.has(nodeLayout.mode)) {
    errors.push(
      issue('error', `${path}.layout.mode`, 'invalid_layout_mode', 'Layout mode must be flow, grid, or absolute'),
    );
  }

  if (node.children?.length && !CONTAINER_ALIASES.has(node.alias)) {
    errors.push(issue('error', `${path}.children`, 'leaf_has_children', `${node.alias} cannot contain children`));
  }

  const descriptor = descriptorForAlias(document, node.alias);
  if (descriptor && node.props) {
    Object.entries(node.props).forEach(([propName, value]) => {
      const effectivePropName = CORE_PROP_ALIASES.get(`${descriptor.alias}:${propName}`) ?? propName;
      const propIssue = validatePropValue(descriptor, effectivePropName, value, `${path}.props.${propName}`);
      if (!propIssue) {
        return;
      }
      if (propIssue.code === 'unknown_prop' && !options.failOnUnknownProps) {
        warnings.push({ ...propIssue, severity: 'warning' });
        return;
      }
      errors.push(propIssue);
    });
  }

  if (options.requireValidImageUrls && node.alias === 'core.image') {
    const src = node.props?.src;
    if (typeof src === 'string' && src.trim() && !isValidGeneratedImageUrl(src.trim())) {
      errors.push(
        issue(
          'error',
          `${path}.props.src`,
          'invalid_generated_image_url',
          'Generated core.image props.src must be a valid HTTPS URL or /template-assets/... path; ' +
            'omit src to render the placeholder.',
        ),
      );
    }
  }

  if (options.requireChineseVisibleText && node.props) {
    [
      'title',
      'text',
      'label',
      'placeholder',
      'body',
      'caption',
      'subtitle',
      'overline',
      'badgeLabel',
      'actionLabel',
      'statusLabel',
    ].forEach((propName) => {
      const value = node.props?.[propName];
      if (typeof value !== 'string' || !value.trim()) {
        return;
      }
      if (hasDisallowedLatinText(value)) {
        errors.push(
          issue(
            'error',
            `${path}.props.${propName}`,
            'mixed_visible_language',
            `Generated visible text should be Simplified Chinese, got "${value}"`,
          ),
        );
      }
    });
  }

  validateWidgetNode(node, path, dependencyNames, widgetPolicy, errors);
  validateNodeDataBinding(node, path, dataSourceIds, errors);
  validateNodeAction(node.interactions?.onClick, pageIds, nodesById, `${path}.interactions.onClick`, errors);
  validateNodeAction(
    node.interactions?.onActionClick,
    pageIds,
    nodesById,
    `${path}.interactions.onActionClick`,
    errors,
  );
  validateNodeAction(
    node.interactions?.onStatusClick,
    pageIds,
    nodesById,
    `${path}.interactions.onStatusClick`,
    errors,
  );
  validateTabInteraction(node.interactions?.onTabClick, pageIds, `${path}.interactions.onTabClick`, errors);

  node.children?.forEach((child, index) => {
    validateNode(
      document,
      child,
      `${path}.children[${index}]`,
      aliases,
      pageIds,
      nodesById,
      dataSourceIds,
      dependencyNames,
      widgetPolicy,
      seenIds,
      errors,
      warnings,
      options,
    );
  });
}

export function collectNodesById(pages: ThemeLayoutDocument['pages']): Map<string, ThemeLayoutNode> {
  const nodesById = new Map<string, ThemeLayoutNode>();
  const visit = (node: ThemeLayoutNode) => {
    if (isNonEmptyString(node.id) && !nodesById.has(node.id)) {
      nodesById.set(node.id, node);
    }
    node.children?.forEach(visit);
  };
  pages.forEach((page) => visit(page.layout));
  return nodesById;
}
