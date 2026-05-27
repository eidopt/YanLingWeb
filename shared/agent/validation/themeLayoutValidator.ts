import type {
  RenderSmokeResult,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNavigateAction,
  ThemeLayoutNode,
  ThemeLayoutTabInteraction,
  ThemeLibraryDependency,
  ValidationIssue,
  ValidationResult,
} from '../types';
import {
  DISALLOWED_WIDGET_PROP_NAMES,
  formatAllowedWidgetLibraries,
  isAllowedWidgetDependency,
  resolveSafeWidgetRenderer,
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
]);
const CORE_IMAGE_PROP_TYPES = new Map([
  ['src', 'string'],
  ['alt', 'string'],
  ['title', 'string'],
  ['iconColor', 'string'],
  ['objectFit', 'string'],
]);
const CORE_UNIVERSAL_PROP_TYPES = new Map([
  ['style', 'object'],
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
]);
const LAYOUT_MODES = new Set(['flow', 'grid', 'absolute']);

function issue(
  severity: ValidationIssue['severity'],
  path: string,
  code: string,
  message: string,
): ValidationIssue {
  return { severity, path, code, message };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasCjkText(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function hasDisallowedLatinText(value: string): boolean {
  const normalized = value
    .replace(/\b(AI|API|URL|URI|ID|VIP|H5|SaaS|CRM|ERP|IoT|OK)\b/gi, '')
    .replace(/Wi-?Fi/gi, '');
  return /[A-Za-z]{3,}/.test(normalized);
}

function isValidGeneratedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function collectAliases(
  document: ThemeLayoutDocument,
  componentTemplates?: Record<string, unknown>,
): Set<string> {
  const aliases = new Set(CORE_ALIASES);
  const components = Array.isArray(document.components) ? document.components : [];
  components.forEach((component) => aliases.add(component.alias));
  Object.keys(componentTemplates ?? document.componentTemplates ?? {}).forEach((alias) => aliases.add(alias));
  return aliases;
}

function descriptorForAlias(
  document: ThemeLayoutDocument,
  alias: string,
): ThemeComponentDescriptor | undefined {
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
    (descriptor.alias === 'core.image'
      ? CORE_IMAGE_PROP_TYPES.get(propName)
      : undefined);
  const prop = descriptor.props.find((item) => item.name === propName) ?? (
    fallbackType ? { name: propName, type: fallbackType } : undefined
  );
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
      errors.push(issue(
        'error',
        `${path}.name`,
        'duplicate_dependency_name',
        `Duplicate dependency: ${dependency.name}`,
      ));
    } else {
      dependencyNames.add(dependency.name);
    }
    if (
      !isNonEmptyString(dependency.name)
      || !isNonEmptyString(dependency.url)
      || !isAllowedWidgetDependency(dependency.name, dependency.url)
    ) {
      errors.push(issue(
        'error',
        `${path}.url`,
        'blocked_dependency_url',
        `Widget dependencies must use approved esm.sh packages: ${formatAllowedWidgetLibraries()}`,
      ));
    }
  });

  return dependencyNames;
}

function validateWidgetProps(
  alias: string,
  propsValue: unknown,
  path: string,
  dependencyNames: Set<string>,
  errors: ValidationIssue[],
): void {
  if (alias !== 'core.widget') {
    return;
  }

  const props = isPlainObject(propsValue) ? propsValue : {};
  Object.keys(props).forEach((propName) => {
    if (DISALLOWED_WIDGET_PROP_NAMES.has(propName)) {
      errors.push(issue(
        'error',
        `${path}.props.${propName}`,
        'custom_widget_script_blocked',
        `core.widget does not allow custom script prop "${propName}"`,
      ));
    }
  });

  if (!isNonEmptyString(props.library)) {
    errors.push(issue(
      'error',
      `${path}.props.library`,
      'missing_widget_library',
      'core.widget requires a library name',
    ));
    return;
  }

  if (!dependencyNames.has(props.library)) {
    errors.push(issue(
      'error',
      `${path}.props.library`,
      'missing_widget_dependency',
      `core.widget library "${props.library}" must be declared in layoutDocument.dependencies`,
    ));
  }

  const renderer = typeof props.renderer === 'string' ? props.renderer : undefined;
  if (!resolveSafeWidgetRenderer(props.library, renderer)) {
    errors.push(issue(
      'error',
      `${path}.props.renderer`,
      'unsupported_widget_renderer',
      `core.widget renderer must be one of: ${[...SUPPORTED_WIDGET_RENDERERS].join(', ')}`,
    ));
  }
}

function validateWidgetNode(
  node: ThemeLayoutNode,
  path: string,
  dependencyNames: Set<string>,
  errors: ValidationIssue[],
): void {
  validateWidgetProps(node.alias, node.props, path, dependencyNames, errors);
}

function validateTemplateNodeWidgets(
  value: unknown,
  path: string,
  dependencyNames: Set<string>,
  errors: ValidationIssue[],
): void {
  if (!isPlainObject(value)) {
    return;
  }

  const alias = typeof value.alias === 'string' ? value.alias : '';
  validateWidgetProps(alias, value.props, path, dependencyNames, errors);

  const children = Array.isArray(value.children) ? value.children : [];
  children.forEach((child, index) => {
    validateTemplateNodeWidgets(
      child,
      `${path}.children[${index}]`,
      dependencyNames,
      errors,
    );
  });
}

function validateComponentTemplateWidgets(
  componentTemplates: Record<string, unknown> | undefined,
  dependencyNames: Set<string>,
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
      errors,
    );
  });
}

function validateComponentTemplateNode(
  value: unknown,
  path: string,
  errors: ValidationIssue[],
): void {
  if (!isPlainObject(value)) {
    errors.push(issue('error', path, 'invalid_component_template_node', 'Component template node must be an object'));
    return;
  }

  const alias = value.alias;
  if (!isNonEmptyString(alias)) {
    errors.push(issue('error', `${path}.alias`, 'missing_template_node_alias', 'Template node alias is required'));
  } else if (!CORE_ALIASES.has(alias)) {
    errors.push(issue(
      'error',
      `${path}.alias`,
      'custom_component_template_alias',
      `componentTemplates may only expand to core.* aliases: ${alias}`,
    ));
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
      errors.push(issue(
        'error',
        `componentTemplates.${alias}`,
        'core_component_template_alias',
        'componentTemplates keys must be custom aliases, not core.* aliases.',
      ));
    }
    if (!descriptorAliases.has(alias)) {
      errors.push(issue(
        'error',
        `componentTemplates.${alias}`,
        'missing_component_descriptor',
        `componentTemplates alias "${alias}" must be declared in layoutDocument.components.`,
      ));
    }
    if (!isPlainObject(template)) {
      errors.push(issue(
        'error',
        `componentTemplates.${alias}`,
        'invalid_component_template',
        'Template must be an object',
      ));
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
      errors.push(issue(
        'error',
        `${path}.alias`,
        'duplicate_component_alias',
        `Duplicate component alias: ${component.alias}`,
      ));
    }
    aliases.add(component.alias);

    if (component.alias.startsWith('core.') && !CORE_ALIASES.has(component.alias)) {
      errors.push(issue('error', `${path}.alias`, 'unknown_core_alias', `Unknown core alias: ${component.alias}`));
    }
    if (!component.alias.startsWith('core.') && !componentTemplates?.[component.alias]) {
      errors.push(issue(
        'error',
        `${path}.alias`,
        'missing_component_template',
        `Custom alias "${component.alias}" must have a matching componentTemplates entry.`,
      ));
    }
    if (options.requireLocalizedPropLabels) {
      if (!Array.isArray(component.props)) {
        errors.push(issue('error', `${path}.props`, 'invalid_component_props', 'Component props must be an array'));
        return;
      }
      component.props.forEach((prop, propIndex) => {
        if (!isPlainObject(prop)) {
          errors.push(issue(
            'error',
            `${path}.props[${propIndex}]`,
            'invalid_prop_descriptor',
            'Prop descriptor must be an object',
          ));
          return;
        }
        if (!hasCjkText(prop.label ?? '')) {
          errors.push(issue(
            'error',
            `${path}.props[${propIndex}].label`,
            'missing_localized_prop_label',
            `Editable prop "${prop.name}" must define a Chinese label`,
          ));
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
  dependencyNames: Set<string>,
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
    errors.push(issue(
      'error',
      `${path}.layout.mode`,
      'invalid_layout_mode',
      'Layout mode must be flow, grid, or absolute',
    ));
  }

  if (node.children?.length && !CONTAINER_ALIASES.has(node.alias)) {
    errors.push(issue('error', `${path}.children`, 'leaf_has_children', `${node.alias} cannot contain children`));
  }

  const descriptor = descriptorForAlias(document, node.alias);
  if (descriptor && node.props) {
    Object.entries(node.props).forEach(([propName, value]) => {
      const effectivePropName =
        CORE_PROP_ALIASES.get(`${descriptor.alias}:${propName}`) ?? propName;
      const propIssue = validatePropValue(
        descriptor,
        effectivePropName,
        value,
        `${path}.props.${propName}`,
      );
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
      errors.push(issue(
        'error',
        `${path}.props.src`,
        'invalid_generated_image_url',
        'Generated core.image props.src must be a valid HTTPS URL; omit src to render the placeholder.',
      ));
    }
  }

  if (options.requireChineseVisibleText && node.props) {
    [
      'title',
      'text',
      'label',
      'placeholder',
      'activeTab',
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
          errors.push(issue(
            'error',
            `${path}.props.${propName}`,
            'mixed_visible_language',
            `Generated visible text should be Simplified Chinese, got "${value}"`,
          ));
        }
      });
  }

  validateWidgetNode(node, path, dependencyNames, errors);
  validateNavigateAction(node.interactions?.onClick, pageIds, `${path}.interactions.onClick`, errors);
  validateNavigateAction(node.interactions?.onActionClick, pageIds, `${path}.interactions.onActionClick`, errors);
  validateNavigateAction(node.interactions?.onStatusClick, pageIds, `${path}.interactions.onStatusClick`, errors);
  validateTabInteraction(node.interactions?.onTabClick, pageIds, `${path}.interactions.onTabClick`, errors);

  node.children?.forEach((child, index) => {
    validateNode(
      document,
      child,
      `${path}.children[${index}]`,
      aliases,
      pageIds,
      dependencyNames,
      seenIds,
      errors,
      warnings,
      options,
    );
  });
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
  if (
    document.schemaVersion !== undefined &&
    typeof document.schemaVersion !== 'number'
  ) {
    errors.push(issue(
      'error',
      'schemaVersion',
      'invalid_schema_version',
      'schemaVersion must be a number',
    ));
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
  if (!pageIds.has(document.defaultPageId)) {
    errors.push(issue(
      'error',
      'defaultPageId',
      'invalid_default_page',
      'defaultPageId must point to an existing page',
    ));
  }
  const defaultPage = pages.find((page) => page.id === document.defaultPageId);
  const documentLayout = (document as Partial<ThemeLayoutDocument>).layout;
  if (defaultPage && documentLayout?.id !== defaultPage.layout.id) {
    errors.push(issue(
      'error',
      'layout',
      'layout_default_mismatch',
      'document.layout must match the default page root',
    ));
  }

  const aliases = collectAliases(document, options.componentTemplates);
  const dependencyNames = validateDependencies(document.dependencies, errors);
  validateComponentDescriptors(
    document,
    options.componentTemplates ?? document.componentTemplates,
    errors,
    effectiveOptions,
  );
  validateComponentTemplateWidgets(
    options.componentTemplates ?? document.componentTemplates,
    dependencyNames,
    errors,
  );
  const seenIds = new Set<string>();
  pages.forEach((page, pageIndex) => {
    const pageLayout = (page as { layout?: ThemeLayoutNode }).layout;
    if (!isNonEmptyString(page.id)) {
      errors.push(issue('error', `pages[${pageIndex}].id`, 'missing_page_id', 'Page id is required'));
    }
    if (pageLayout?.alias !== 'core.screen') {
      errors.push(issue(
        'error',
        `pages[${pageIndex}].layout.alias`,
        'invalid_root_alias',
        'Page root must be core.screen',
      ));
    }
    if (pageLayout) {
      validateNode(
        document,
        pageLayout,
        `pages[${pageIndex}].layout`,
        aliases,
        pageIds,
        dependencyNames,
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
  const ownText = ['title', 'text', 'label', 'placeholder', 'activeTab', 'body']
    .some((key) => typeof props[key] === 'string' && props[key].trim().length > 0)
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
