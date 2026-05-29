import { isAllowedTemplateImageSrc } from '../../theme-layout/visualAssets';
import type {
  RenderSmokeResult,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNavigateAction,
  ThemeLayoutNode,
  ThemeLayoutNodeAction,
  ThemeLayoutTabInteraction,
  ThemeLayoutWidgetPolicy,
  ThemeLibraryDependency,
  ValidationIssue,
  ValidationResult,
} from '../types';
import {
  DISALLOWED_WIDGET_PROP_NAMES,
  formatAllowedWidgetLibraries,
  getAllowedWidgetLibraryByName,
  getWidgetLibraryPolicyKeys,
  getWidgetRendererCapability,
  isAllowedWidgetDependency,
  isSupportedWidgetCapability,
  isWidgetRendererCapabilityAllowedByPolicy,
  isWidgetRuntimePolicyEnabled,
  resolveSafeWidgetRenderer,
  SUPPORTED_WIDGET_CAPABILITIES,
  SUPPORTED_WIDGET_RENDERERS,
} from './widgetSafety';

export interface ThemeLayoutValidatorOptions {
  failOnUnknownProps?: boolean;
  componentTemplates?: Record<string, unknown>;
  requireValidImageUrls?: boolean;
  requireLocalizedPropLabels?: boolean;
  requireChineseVisibleText?: boolean;
}

const CORE_ALIASES = new Set([
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
  // Navigation
  'core.navbar',
  'core.tabbar',
  'core.breadcrumb',
  'core.pagination',
  // Data display
  'core.avatar',
  'core.badge',
  'core.list',
  'core.list-item',
  'core.statistic',
  'core.collapse',
  'core.carousel',
  'core.empty',
  'core.skeleton',
  // Data input
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
  // Feedback
  'core.dialog',
  'core.toast',
  'core.alert',
  'core.loading',
  'core.drawer',
  // Media
  'core.video',
  'core.audio',
  // Layout & Navigation
  'core.sidebar',
  'core.toolbar',
  'core.splitter',
  // Professional
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
const DATA_SELECTOR_PATTERN = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

function issue(severity: ValidationIssue['severity'], path: string, code: string, message: string): ValidationIssue {
  return { severity, path, code, message };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

function isSafePublicJsonEndpoint(value: string): boolean {
  if (value.startsWith('/')) {
    return !value.startsWith('//');
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validateDataSelector(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'string' || !DATA_SELECTOR_PATTERN.test(value)) {
    errors.push(issue('error', path, 'invalid_data_selector', 'Data selector must be a dotted property path'));
  }
}

function hasCjkText(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function hasDisallowedLatinText(value: string): boolean {
  const normalized = value
    .replace(
      /\b(AI|API|URL|URI|ID|VIP|H5|SaaS|CRM|ERP|IoT|OK|PPSU|SPF|DNA|SLA|SKU|QDII|ETF|MOBA|FPS|MMORPG|Python|JavaScript|Java|React|Node|Word|Excel|PPT)\b/gi,
      '',
    )
    .replace(/Wi-?Fi/gi, '');
  if (hasCjkText(normalized)) {
    return (normalized.match(/[A-Za-z]{3,}/g) ?? []).length >= 3;
  }
  return /[A-Za-z]{3,}/.test(normalized);
}

function isValidGeneratedImageUrl(value: string): boolean {
  return isAllowedTemplateImageSrc(value);
}

function collectAliases(document: ThemeLayoutDocument, componentTemplates?: Record<string, unknown>): Set<string> {
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

function validateDependencies(
  dependencies: ThemeLibraryDependency[] | undefined,
  widgetPolicy: ThemeLayoutWidgetPolicy | undefined,
  errors: ValidationIssue[],
): Set<string> {
  const dependencyNames = new Set<string>();
  if (dependencies === undefined) {
    return dependencyNames;
  }

  if (!Array.isArray(dependencies)) {
    errors.push(issue('error', 'dependencies', 'invalid_dependencies', 'dependencies must be an array'));
    return dependencyNames;
  }

  dependencies.forEach((dependency, index) => {
    const path = `dependencies[${index}]`;
    if (!isPlainObject(dependency)) {
      errors.push(issue('error', path, 'invalid_dependency', 'Dependency must be an object'));
      return;
    }
    if (!isNonEmptyString(dependency.name)) {
      errors.push(issue('error', `${path}.name`, 'missing_dependency_name', 'Dependency name is required'));
    } else if (dependencyNames.has(dependency.name)) {
      errors.push(
        issue('error', `${path}.name`, 'duplicate_dependency_name', `Duplicate dependency: ${dependency.name}`),
      );
    } else {
      dependencyNames.add(dependency.name);
    }
    if (
      !isNonEmptyString(dependency.name) ||
      !isNonEmptyString(dependency.url) ||
      !isAllowedWidgetDependency(dependency.name, dependency.url, widgetPolicy)
    ) {
      errors.push(
        issue(
          'error',
          `${path}.url`,
          'blocked_dependency_url',
          'Widget dependencies must use approved esm.sh packages allowed by widgetPolicy: ' +
            formatAllowedWidgetLibraries(),
        ),
      );
      return;
    }

    const library = getAllowedWidgetLibraryByName(dependency.name);
    if (library) {
      getWidgetLibraryPolicyKeys(library).forEach((key) => dependencyNames.add(key));
    }
  });

  return dependencyNames;
}

function validateDataSources(dataSources: unknown, errors: ValidationIssue[]): Set<string> {
  const dataSourceIds = new Set<string>();
  if (dataSources === undefined) {
    return dataSourceIds;
  }
  if (!Array.isArray(dataSources)) {
    errors.push(issue('error', 'dataSources', 'invalid_data_sources', 'dataSources must be an array'));
    return dataSourceIds;
  }

  dataSources.forEach((dataSource, index) => {
    const path = `dataSources[${index}]`;
    if (!isPlainObject(dataSource)) {
      errors.push(issue('error', path, 'invalid_data_source', 'Data source must be an object'));
      return;
    }

    const sourceId = dataSource.id;
    const sourceKind = dataSource.kind;

    if (!isNonEmptyString(sourceId)) {
      errors.push(issue('error', `${path}.id`, 'missing_data_source_id', 'Data source id is required'));
    } else if (dataSourceIds.has(sourceId)) {
      errors.push(issue('error', `${path}.id`, 'duplicate_data_source_id', `Duplicate data source: ${sourceId}`));
    } else {
      dataSourceIds.add(sourceId);
    }

    if (sourceKind !== 'staticJson' && sourceKind !== 'publicJsonEndpoint') {
      errors.push(
        issue(
          'error',
          `${path}.kind`,
          'invalid_data_source_kind',
          'Data source kind must be staticJson or publicJsonEndpoint',
        ),
      );
      return;
    }

    validateDataSelector(dataSource.select, `${path}.select`, errors);

    if (sourceKind === 'staticJson') {
      if (!('data' in dataSource)) {
        errors.push(issue('error', `${path}.data`, 'missing_static_json_data', 'staticJson data is required'));
      } else if (!isJsonSerializable(dataSource.data)) {
        errors.push(
          issue('error', `${path}.data`, 'invalid_static_json_data', 'staticJson data must be JSON serializable'),
        );
      }
    }

    if (sourceKind === 'publicJsonEndpoint') {
      if (!isNonEmptyString(dataSource.url) || !isSafePublicJsonEndpoint(dataSource.url)) {
        errors.push(
          issue(
            'error',
            `${path}.url`,
            'invalid_public_json_endpoint',
            'publicJsonEndpoint url must be a safe relative path or HTTPS URL without credentials',
          ),
        );
      }
    }

    if ('fallback' in dataSource && !isJsonSerializable(dataSource.fallback)) {
      errors.push(
        issue(
          'error',
          `${path}.fallback`,
          'invalid_data_source_fallback',
          'Data source fallback must be JSON serializable',
        ),
      );
    }
  });

  return dataSourceIds;
}

function validateWidgetPolicy(policy: ThemeLayoutWidgetPolicy | undefined, errors: ValidationIssue[]): void {
  if (policy === undefined) {
    return;
  }

  if (!isPlainObject(policy)) {
    errors.push(issue('error', 'widgetPolicy', 'invalid_widget_policy', 'widgetPolicy must be an object'));
    return;
  }

  if (policy.enabled !== undefined && typeof policy.enabled !== 'boolean') {
    errors.push(
      issue('error', 'widgetPolicy.enabled', 'invalid_widget_policy_enabled', 'widgetPolicy.enabled must be a boolean'),
    );
  }

  if (policy.allowedLibraries !== undefined) {
    if (!Array.isArray(policy.allowedLibraries)) {
      errors.push(
        issue(
          'error',
          'widgetPolicy.allowedLibraries',
          'invalid_widget_policy_libraries',
          'widgetPolicy.allowedLibraries must be an array',
        ),
      );
    } else {
      policy.allowedLibraries.forEach((library, index) => {
        if (!isNonEmptyString(library) || !getAllowedWidgetLibraryByName(library)) {
          errors.push(
            issue(
              'error',
              `widgetPolicy.allowedLibraries[${index}]`,
              'invalid_widget_policy_library',
              `widgetPolicy.allowedLibraries must reference approved libraries: ${formatAllowedWidgetLibraries()}`,
            ),
          );
        }
      });
    }
  }

  if (policy.allowedRenderers !== undefined) {
    if (!Array.isArray(policy.allowedRenderers)) {
      errors.push(
        issue(
          'error',
          'widgetPolicy.allowedRenderers',
          'invalid_widget_policy_renderers',
          'widgetPolicy.allowedRenderers must be an array',
        ),
      );
    } else {
      policy.allowedRenderers.forEach((renderer, index) => {
        if (!isNonEmptyString(renderer) || !SUPPORTED_WIDGET_RENDERERS.has(renderer.trim().toLowerCase())) {
          errors.push(
            issue(
              'error',
              `widgetPolicy.allowedRenderers[${index}]`,
              'invalid_widget_policy_renderer',
              `widgetPolicy.allowedRenderers must be one of: ${[...SUPPORTED_WIDGET_RENDERERS].join(', ')}`,
            ),
          );
        }
      });
    }
  }

  if (policy.allowedCapabilities !== undefined) {
    if (!Array.isArray(policy.allowedCapabilities)) {
      errors.push(
        issue(
          'error',
          'widgetPolicy.allowedCapabilities',
          'invalid_widget_policy_capabilities',
          'widgetPolicy.allowedCapabilities must be an array',
        ),
      );
    } else {
      policy.allowedCapabilities.forEach((capability, index) => {
        if (!isNonEmptyString(capability) || !isSupportedWidgetCapability(capability)) {
          errors.push(
            issue(
              'error',
              `widgetPolicy.allowedCapabilities[${index}]`,
              'invalid_widget_policy_capability',
              `widgetPolicy.allowedCapabilities must be one of: ${[...SUPPORTED_WIDGET_CAPABILITIES].join(', ')}`,
            ),
          );
        }
      });
    }
  }
}

function validateWidgetProps(
  alias: string,
  propsValue: unknown,
  path: string,
  dependencyNames: Set<string>,
  widgetPolicy: ThemeLayoutWidgetPolicy | undefined,
  errors: ValidationIssue[],
): void {
  if (alias !== 'core.widget') {
    return;
  }

  if (!isWidgetRuntimePolicyEnabled(widgetPolicy)) {
    errors.push(
      issue(
        'error',
        path,
        'widget_disabled_by_policy',
        'core.widget is disabled by layoutDocument.widgetPolicy.enabled=false',
      ),
    );
  }

  const props = isPlainObject(propsValue) ? propsValue : {};
  Object.keys(props).forEach((propName) => {
    if (DISALLOWED_WIDGET_PROP_NAMES.has(propName)) {
      errors.push(
        issue(
          'error',
          `${path}.props.${propName}`,
          'custom_widget_script_blocked',
          `core.widget does not allow custom script prop "${propName}"`,
        ),
      );
    }
  });

  if (!isNonEmptyString(props.library)) {
    errors.push(
      issue('error', `${path}.props.library`, 'missing_widget_library', 'core.widget requires a library name'),
    );
    return;
  }

  const library = getAllowedWidgetLibraryByName(props.library);
  const libraryKeys = library ? getWidgetLibraryPolicyKeys(library) : [props.library];
  if (!libraryKeys.some((key) => dependencyNames.has(key))) {
    errors.push(
      issue(
        'error',
        `${path}.props.library`,
        'missing_widget_dependency',
        `core.widget library "${props.library}" must be declared in layoutDocument.dependencies`,
      ),
    );
  }

  const renderer = typeof props.renderer === 'string' ? props.renderer : undefined;
  const resolvedRenderer = resolveSafeWidgetRenderer(props.library, renderer, widgetPolicy);
  if (!resolvedRenderer) {
    const requestedRenderer = renderer?.trim().toLowerCase();
    const requestedCapability = requestedRenderer ? getWidgetRendererCapability(requestedRenderer) : null;
    if (
      requestedRenderer &&
      requestedCapability &&
      !isWidgetRendererCapabilityAllowedByPolicy(requestedRenderer, widgetPolicy)
    ) {
      errors.push(
        issue(
          'error',
          `${path}.props.renderer`,
          'widget_capability_blocked',
          [
            `core.widget renderer "${requestedRenderer}" requires capability "${requestedCapability}"`,
            'not allowed by widgetPolicy.allowedCapabilities',
          ].join(' '),
        ),
      );
    } else {
      errors.push(
        issue(
          'error',
          `${path}.props.renderer`,
          'unsupported_widget_renderer',
          `core.widget renderer must be one of: ${[...SUPPORTED_WIDGET_RENDERERS].join(', ')}`,
        ),
      );
    }
  }
}

function validateWidgetNode(
  node: ThemeLayoutNode,
  path: string,
  dependencyNames: Set<string>,
  widgetPolicy: ThemeLayoutWidgetPolicy | undefined,
  errors: ValidationIssue[],
): void {
  validateWidgetProps(node.alias, node.props, path, dependencyNames, widgetPolicy, errors);
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

function validateTemplateNodeWidgets(
  value: unknown,
  path: string,
  dependencyNames: Set<string>,
  widgetPolicy: ThemeLayoutWidgetPolicy | undefined,
  errors: ValidationIssue[],
): void {
  if (!isPlainObject(value)) {
    return;
  }

  const alias = typeof value.alias === 'string' ? value.alias : '';
  validateWidgetProps(alias, value.props, path, dependencyNames, widgetPolicy, errors);

  const children = Array.isArray(value.children) ? value.children : [];
  children.forEach((child, index) => {
    validateTemplateNodeWidgets(child, `${path}.children[${index}]`, dependencyNames, widgetPolicy, errors);
  });
}

function validateComponentTemplateWidgets(
  componentTemplates: Record<string, unknown> | undefined,
  dependencyNames: Set<string>,
  widgetPolicy: ThemeLayoutWidgetPolicy | undefined,
  errors: ValidationIssue[],
): void {
  if (!componentTemplates) {
    return;
  }

  Object.entries(componentTemplates).forEach(([alias, template]) => {
    if (!isPlainObject(template)) {
      return;
    }
    validateTemplateNodeWidgets(
      template.root,
      `componentTemplates.${alias}.root`,
      dependencyNames,
      widgetPolicy,
      errors,
    );
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

function validateComponentDescriptors(
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

function validateNode(
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

function collectNodesById(pages: ThemeLayoutDocument['pages']): Map<string, ThemeLayoutNode> {
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

export function validateThemeLayoutDocument(
  document: ThemeLayoutDocument,
  options: ThemeLayoutValidatorOptions = {},
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const failOnUnknownProps = options.failOnUnknownProps ?? true;
  const effectiveOptions = { ...options, failOnUnknownProps };
  const pages = Array.isArray(document.pages) ? document.pages : [];

  if (typeof document.version !== 'number') {
    errors.push(issue('error', 'version', 'invalid_version', 'version must be a number'));
  }
  if (document.schemaVersion !== undefined && typeof document.schemaVersion !== 'number') {
    errors.push(issue('error', 'schemaVersion', 'invalid_schema_version', 'schemaVersion must be a number'));
  }
  ['themeId', 'themeName', 'description'].forEach((field) => {
    if (!isNonEmptyString(document[field as keyof ThemeLayoutDocument])) {
      errors.push(issue('error', field, 'missing_string', `${field} must be a non-empty string`));
    }
  });
  if (!Array.isArray(document.components) || document.components.length === 0) {
    errors.push(issue('error', 'components', 'missing_components', 'components must be a non-empty array'));
  }
  if (!Array.isArray(document.pages) || document.pages.length === 0) {
    errors.push(issue('error', 'pages', 'missing_pages', 'pages must be a non-empty array'));
  }

  const pageIds = new Set(pages.map((page) => page.id));
  const nodesById = collectNodesById(pages);
  if (!pageIds.has(document.defaultPageId)) {
    errors.push(
      issue('error', 'defaultPageId', 'invalid_default_page', 'defaultPageId must point to an existing page'),
    );
  }
  const defaultPage = pages.find((page) => page.id === document.defaultPageId);
  const documentLayout = (document as Partial<ThemeLayoutDocument>).layout;
  if (defaultPage && documentLayout?.id !== defaultPage.layout.id) {
    errors.push(
      issue('error', 'layout', 'layout_default_mismatch', 'document.layout must match the default page root'),
    );
  }

  const aliases = collectAliases(document, options.componentTemplates);
  validateWidgetPolicy(document.widgetPolicy, errors);
  const dependencyNames = validateDependencies(document.dependencies, document.widgetPolicy, errors);
  const dataSourceIds = validateDataSources(document.dataSources, errors);
  validateComponentDescriptors(
    document,
    options.componentTemplates ?? document.componentTemplates,
    errors,
    effectiveOptions,
  );
  validateComponentTemplateWidgets(
    options.componentTemplates ?? document.componentTemplates,
    dependencyNames,
    document.widgetPolicy,
    errors,
  );
  const seenIds = new Set<string>();
  pages.forEach((page, pageIndex) => {
    const pageLayout = (page as { layout?: ThemeLayoutNode }).layout;
    if (!isNonEmptyString(page.id)) {
      errors.push(issue('error', `pages[${pageIndex}].id`, 'missing_page_id', 'Page id is required'));
    }
    if (pageLayout?.alias !== 'core.screen') {
      errors.push(
        issue('error', `pages[${pageIndex}].layout.alias`, 'invalid_root_alias', 'Page root must be core.screen'),
      );
    }
    if (pageLayout) {
      validateNode(
        document,
        pageLayout,
        `pages[${pageIndex}].layout`,
        aliases,
        pageIds,
        nodesById,
        dataSourceIds,
        dependencyNames,
        document.widgetPolicy,
        seenIds,
        errors,
        warnings,
        effectiveOptions,
      );
    }
  });

  const score = errors.length === 0 ? 1 : 0;
  return { valid: errors.length === 0, errors, warnings, score };
}

function countVisibleText(node: ThemeLayoutNode): number {
  const props = node.props ?? {};
  const ownText = ['title', 'text', 'label', 'placeholder', 'activeTab', 'body'].some(
    (key) => typeof props[key] === 'string' && props[key].trim().length > 0,
  )
    ? 1
    : 0;
  return ownText + (node.children ?? []).reduce((total, child) => total + countVisibleText(child), 0);
}

export function renderSmokeThemeLayoutDocument(document: ThemeLayoutDocument): RenderSmokeResult {
  const validation = validateThemeLayoutDocument(document);
  const visibleTextCount = document.pages.reduce((total, page) => total + countVisibleText(page.layout), 0);
  const errors = validation.errors
    .filter((item) => item.code === 'unknown_alias' || item.code === 'invalid_root_alias')
    .map((item) => item.message);
  if (visibleTextCount === 0) {
    errors.push('No visible text nodes found');
  }
  return {
    passed: errors.length === 0,
    score: errors.length === 0 ? 1 : 0,
    errors,
    visibleTextCount,
  };
}
