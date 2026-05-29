import type {
  RenderSmokeResult,
  ThemeLayoutDocument,
  ThemeLayoutNode,
  ValidationIssue,
  ValidationResult,
} from '../types';
import {
  collectAliases,
  collectNodesById,
  validateComponentDescriptors,
  validateNode,
} from './themeLayoutValidator.rules';
import { isNonEmptyString, issue, type ThemeLayoutValidatorOptions } from './themeLayoutValidator.shared';
import {
  validateComponentTemplateWidgets,
  validateDataSources,
  validateDependencies,
  validateWidgetPolicy,
} from './themeLayoutValidator.widget';

export type { ThemeLayoutValidatorOptions } from './themeLayoutValidator.shared';

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
