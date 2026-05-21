import type {
  RenderSmokeResult,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNavigateAction,
  ThemeLayoutNode,
  ThemeLayoutTabInteraction,
  ValidationIssue,
  ValidationResult,
} from '../types';

export interface ThemeLayoutValidatorOptions {
  failOnUnknownProps?: boolean;
  componentTemplates?: Record<string, unknown>;
}

const CORE_ALIASES = new Set([
  'core.screen',
  'core.panel',
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

const CONTAINER_ALIASES = new Set(['core.screen', 'core.panel', 'core.stack', 'core.row', 'core.grid']);
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
  const prop = descriptor.props.find((item) => item.name === propName);
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

function validateNode(
  document: ThemeLayoutDocument,
  node: ThemeLayoutNode,
  path: string,
  aliases: Set<string>,
  pageIds: Set<string>,
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

  if (!node.layout || !LAYOUT_MODES.has(node.layout.mode)) {
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
      const propIssue = validatePropValue(descriptor, propName, value, `${path}.props.${propName}`);
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
  if (defaultPage && document.layout?.id !== defaultPage.layout.id) {
    errors.push(issue(
      'error',
      'layout',
      'layout_default_mismatch',
      'document.layout must match the default page root',
    ));
  }

  const aliases = collectAliases(document, options.componentTemplates);
  const seenIds = new Set<string>();
  pages.forEach((page, pageIndex) => {
    if (!isNonEmptyString(page.id)) {
      errors.push(issue('error', `pages[${pageIndex}].id`, 'missing_page_id', 'Page id is required'));
    }
    if (!page.layout || page.layout.alias !== 'core.screen') {
      errors.push(issue(
        'error',
        `pages[${pageIndex}].layout.alias`,
        'invalid_root_alias',
        'Page root must be core.screen',
      ));
    }
    if (page.layout) {
      validateNode(
        document,
        page.layout,
        `pages[${pageIndex}].layout`,
        aliases,
        pageIds,
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
