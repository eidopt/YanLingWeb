import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_TEMPLATE_DIR = 'templates_json';
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

const CONTAINER_ALIASES = new Set([
  'core.screen',
  'core.panel',
  'core.stack',
  'core.row',
  'core.grid',
  'core.html',
]);

const LAYOUT_MODES = new Set(['flow', 'grid', 'absolute']);
const PLATFORM_CATEGORIES = new Set([
  'mini-program',
  'mobile-app',
  'tablet-app',
  'web',
]);
const FUNCTIONAL_CATEGORIES = new Set([
  'commerce',
  'social',
  'content',
  'service',
  'education',
  'health',
  'finance',
  'marketing',
  'utility',
  'dashboard',
  'profile',
]);
const REQUIRED_TEMPLATE_FIELDS = [
  'templateId',
  'name',
  'tagline',
  'description',
  'accent',
  'category',
  'platformCategories',
  'functionalCategories',
  'traits',
  'cssVars',
  'componentTemplates',
  'layoutDocument',
];

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCategoryKey(value) {
  return isNonEmptyString(value)
    && /^[a-z0-9][a-z0-9._-]*$/i.test(value)
    && !/[\u4e00-\u9fff]/.test(value);
}

function hasCjkText(value) {
  return /[\u3400-\u9fff]/.test(value);
}

function hasDisallowedLatinText(value) {
  const normalized = value
    .replace(/\b(AI|API|URL|URI|ID|VIP|H5|SaaS|CRM|ERP|IoT|OK)\b/gi, '')
    .replace(/Wi-?Fi/gi, '');
  return /[A-Za-z]{3,}/.test(normalized);
}

function isValidTemplateImageUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatPath(filePath) {
  return path.relative(process.cwd(), filePath) || filePath;
}

function logPathForTemplate(filePath) {
  return path.join(
    path.dirname(filePath),
    `${path.basename(filePath, '.json')}.validation.log`,
  );
}

function addIssue(issues, filePath, level, pathName, message) {
  issues.push({
    file: formatPath(filePath),
    level,
    path: pathName,
    message,
  });
}

function collectJsonFiles(inputs) {
  const targets = inputs.length ? inputs : [DEFAULT_TEMPLATE_DIR];
  const files = [];

  for (const target of targets) {
    const fullPath = path.resolve(process.cwd(), target);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Path does not exist: ${target}`);
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(fullPath).sort()) {
        if (entry.endsWith('.json')) {
          files.push(path.join(fullPath, entry));
        }
      }
      continue;
    }

    if (fullPath.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return [...new Set(files)].sort();
}

function readTemplate(filePath, issues) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    addIssue(
      issues,
      filePath,
      'error',
      '$',
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function validateCssVars(cssVars, filePath, issues) {
  if (!isRecord(cssVars)) {
    addIssue(issues, filePath, 'error', 'cssVars', 'cssVars must be an object.');
    return;
  }

  for (const [key, value] of Object.entries(cssVars)) {
    if (!key.startsWith('--')) {
      addIssue(
        issues,
        filePath,
        'error',
        `cssVars.${key}`,
        'CSS variable names must start with "--".',
      );
    }
    if (typeof value !== 'string') {
      addIssue(
        issues,
        filePath,
        'error',
        `cssVars.${key}`,
        'CSS variable values must be strings.',
      );
    }
  }
}

function validateCategoryArray(
  value,
  allowedValues,
  filePath,
  issues,
  pathName,
  options = {},
) {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(
      issues,
      filePath,
      'error',
      pathName,
      `${pathName} must be a non-empty string array.`,
    );
    return;
  }

  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) {
      addIssue(
        issues,
        filePath,
        'error',
        `${pathName}[${index}]`,
        'Category value must be a non-empty string.',
      );
      return;
    }
    if (!isCategoryKey(item)) {
      addIssue(
        issues,
        filePath,
        'error',
        `${pathName}[${index}]`,
        'Category values must be English slug keys.',
      );
      return;
    }
    if (options.strict !== false && !allowedValues.has(item)) {
      addIssue(
        issues,
        filePath,
        'error',
        `${pathName}[${index}]`,
        `Unknown category "${item}".`,
      );
    }
  });
}

function validateComponents(document, componentTemplates, filePath, issues) {
  const descriptorAliases = new Set();
  const components = Array.isArray(document.components) ? document.components : [];

  if (!components.length) {
    addIssue(
      issues,
      filePath,
      'error',
      'layoutDocument.components',
      'components must be a non-empty array.',
    );
  }

  components.forEach((component, index) => {
    const pathName = `layoutDocument.components[${index}]`;
    if (!isRecord(component)) {
      addIssue(issues, filePath, 'error', pathName, 'Component descriptor must be an object.');
      return;
    }

    if (!isNonEmptyString(component.alias)) {
      addIssue(issues, filePath, 'error', `${pathName}.alias`, 'Component alias is required.');
      return;
    }

    if (descriptorAliases.has(component.alias)) {
      addIssue(
        issues,
        filePath,
        'error',
        `${pathName}.alias`,
        `Duplicate component alias: ${component.alias}`,
      );
    }
    descriptorAliases.add(component.alias);

    if (component.alias.startsWith('core.') && !CORE_ALIASES.has(component.alias)) {
      addIssue(
        issues,
        filePath,
        'error',
        `${pathName}.alias`,
        `Unknown built-in core alias: ${component.alias}`,
      );
    }

    if (!component.alias.startsWith('core.') && !componentTemplates[component.alias]) {
      addIssue(
        issues,
        filePath,
        'error',
        `${pathName}.alias`,
        `Custom alias "${component.alias}" must have a matching componentTemplates entry.`,
      );
    }

    const props = Array.isArray(component.props) ? component.props : [];
    props.forEach((prop, propIndex) => {
      if (!isRecord(prop)) {
        addIssue(
          issues,
          filePath,
          'error',
          `${pathName}.props[${propIndex}]`,
          'Prop descriptor must be an object.',
        );
        return;
      }
      if (!hasCjkText(prop.label ?? '')) {
        addIssue(
          issues,
          filePath,
          'error',
          `${pathName}.props[${propIndex}].label`,
          `Editable prop "${prop.name ?? propIndex}" must define a Chinese label.`,
        );
      }
    });
  });

  for (const alias of Object.keys(componentTemplates)) {
    if (alias.startsWith('core.')) {
      addIssue(
        issues,
        filePath,
        'error',
        `componentTemplates.${alias}`,
        'componentTemplates keys must be custom aliases, not core.* aliases.',
      );
    }
    if (!descriptorAliases.has(alias)) {
      addIssue(
        issues,
        filePath,
        'error',
        `componentTemplates.${alias}`,
        `Custom alias "${alias}" must be declared in layoutDocument.components.`,
      );
    }
  }

  return descriptorAliases;
}

function validateTemplateNode(node, filePath, issues, pathName) {
  if (!isRecord(node)) {
    addIssue(issues, filePath, 'error', pathName, 'Template node must be an object.');
    return;
  }

  if (!isNonEmptyString(node.alias)) {
    addIssue(issues, filePath, 'error', `${pathName}.alias`, 'Template node alias is required.');
  } else if (!node.alias.startsWith('core.')) {
    addIssue(
      issues,
      filePath,
      'error',
      `${pathName}.alias`,
      'componentTemplates may only expand to core.* aliases.',
    );
  } else if (!CORE_ALIASES.has(node.alias)) {
    addIssue(
      issues,
      filePath,
      'error',
      `${pathName}.alias`,
      `Unknown built-in core alias: ${node.alias}`,
    );
  }

  if (node.alias === 'core.text' && isRecord(node.props) && 'content' in node.props) {
    addIssue(
      issues,
      filePath,
      'error',
      `${pathName}.props.content`,
      'core.text uses props.text; props.content will not render.',
    );
  }

  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length && !CONTAINER_ALIASES.has(node.alias)) {
    addIssue(
      issues,
      filePath,
      'error',
      `${pathName}.children`,
      `${node.alias} cannot contain children.`,
    );
  }
  children.forEach((child, index) => {
    validateTemplateNode(child, filePath, issues, `${pathName}.children[${index}]`);
  });
}

function validateComponentTemplates(componentTemplates, filePath, issues) {
  for (const [alias, template] of Object.entries(componentTemplates)) {
    const pathName = `componentTemplates.${alias}`;
    if (!isRecord(template)) {
      addIssue(issues, filePath, 'error', pathName, 'Component template must be an object.');
      continue;
    }
    if (!isRecord(template.root)) {
      addIssue(issues, filePath, 'error', `${pathName}.root`, 'Component template root is required.');
      continue;
    }
    validateTemplateNode(template.root, filePath, issues, `${pathName}.root`);
  }
}

function countVisibleText(node) {
  if (!isRecord(node)) {
    return 0;
  }
  const props = isRecord(node.props) ? node.props : {};
  const hasOwnText = ['title', 'text', 'label', 'placeholder', 'activeTab', 'body']
    .some((key) => isNonEmptyString(props[key]));
  return (hasOwnText ? 1 : 0)
    + (Array.isArray(node.children)
      ? node.children.reduce((total, child) => total + countVisibleText(child), 0)
      : 0);
}

function validateLayoutNode(node, context) {
  const { aliases, componentTemplates, seenIds, filePath, issues, pageIds, pathName } = context;
  if (!isRecord(node)) {
    addIssue(issues, filePath, 'error', pathName, 'Layout node must be an object.');
    return;
  }

  if (!isNonEmptyString(node.id)) {
    addIssue(issues, filePath, 'error', `${pathName}.id`, 'Node id is required.');
  } else if (seenIds.has(node.id)) {
    addIssue(issues, filePath, 'error', `${pathName}.id`, `Duplicate node id: ${node.id}`);
  } else {
    seenIds.add(node.id);
  }

  if (!isNonEmptyString(node.alias)) {
    addIssue(issues, filePath, 'error', `${pathName}.alias`, 'Node alias is required.');
  } else if (node.alias.startsWith('core.') && !CORE_ALIASES.has(node.alias)) {
    addIssue(
      issues,
      filePath,
      'error',
      `${pathName}.alias`,
      `Unknown built-in core alias: ${node.alias}`,
    );
  } else if (!node.alias.startsWith('core.') && !componentTemplates[node.alias]) {
    addIssue(
      issues,
      filePath,
      'error',
      `${pathName}.alias`,
      `Custom alias "${node.alias}" has no componentTemplates entry.`,
    );
  } else if (!aliases.has(node.alias)) {
    addIssue(
      issues,
      filePath,
      'error',
      `${pathName}.alias`,
      `Alias "${node.alias}" is not declared in layoutDocument.components.`,
    );
  }

  if (!isRecord(node.layout) || !LAYOUT_MODES.has(node.layout.mode)) {
    addIssue(
      issues,
      filePath,
      'error',
      `${pathName}.layout.mode`,
      'Layout mode must be flow, grid, or absolute.',
    );
  }

  if (node.alias === 'core.text' && isRecord(node.props) && 'content' in node.props) {
    addIssue(
      issues,
      filePath,
      'error',
      `${pathName}.props.content`,
      'core.text uses props.text; props.content will not render.',
    );
  }
  if (node.alias === 'core.button' && isRecord(node.props) && 'text' in node.props) {
    addIssue(
      issues,
      filePath,
      'error',
      `${pathName}.props.text`,
      'core.button uses props.label; props.text is normalized to label by backend validation.',
    );
  }
  if (node.alias === 'core.image' && isRecord(node.props)) {
    const src = node.props.src;
    if (typeof src === 'string' && src.trim() && !isValidTemplateImageUrl(src.trim())) {
      addIssue(
        issues,
        filePath,
        'error',
        `${pathName}.props.src`,
        'core.image props.src must be a valid HTTPS URL; omit src to render the placeholder.',
      );
    }
  }

  if (isRecord(node.props)) {
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
      const value = node.props[propName];
      if (typeof value !== 'string' || !value.trim()) {
        return;
      }
      if (hasDisallowedLatinText(value)) {
        addIssue(
          issues,
          filePath,
          'error',
          `${pathName}.props.${propName}`,
          `Visible text should use Simplified Chinese, got "${value}".`,
        );
      }
    });
  }

  const interactions = isRecord(node.interactions) ? node.interactions : {};
  for (const [key, value] of Object.entries(interactions)) {
    const actions = key === 'onTabClick' && isRecord(value) && value.type !== 'navigate'
      ? Object.values(value)
      : [value];
    actions.forEach((action, index) => {
      if (!isRecord(action) || action.type !== 'navigate') {
        return;
      }
      if (!pageIds.has(action.targetPageId)) {
        addIssue(
          issues,
          filePath,
          'error',
          `${pathName}.interactions.${key}${actions.length > 1 ? `[${index}]` : ''}.targetPageId`,
          `Unknown target page: ${action.targetPageId}`,
        );
      }
    });
  }

  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length && !CONTAINER_ALIASES.has(node.alias)) {
    addIssue(
      issues,
      filePath,
      'error',
      `${pathName}.children`,
      `${node.alias} cannot contain children.`,
    );
  }

  children.forEach((child, index) => {
    validateLayoutNode(child, {
      ...context,
      pathName: `${pathName}.children[${index}]`,
    });
  });
}

function validateLayoutDocument(document, componentTemplates, filePath, issues) {
  if (!isRecord(document)) {
    addIssue(issues, filePath, 'error', 'layoutDocument', 'layoutDocument must be an object.');
    return;
  }

  for (const field of ['themeId', 'themeName', 'description']) {
    if (!isNonEmptyString(document[field])) {
      addIssue(
        issues,
        filePath,
        'error',
        `layoutDocument.${field}`,
        `${field} must be a non-empty string.`,
      );
    }
  }

  const aliases = validateComponents(document, componentTemplates, filePath, issues) ?? new Set();
  validateComponentTemplates(componentTemplates, filePath, issues);

  const pages = Array.isArray(document.pages) ? document.pages : [];
  if (!pages.length) {
    addIssue(issues, filePath, 'error', 'layoutDocument.pages', 'pages must be a non-empty array.');
  }

  const pageIds = new Set();
  pages.forEach((page, index) => {
    if (!isRecord(page)) {
      addIssue(issues, filePath, 'error', `layoutDocument.pages[${index}]`, 'Page must be an object.');
      return;
    }
    if (!isNonEmptyString(page.id)) {
      addIssue(issues, filePath, 'error', `layoutDocument.pages[${index}].id`, 'Page id is required.');
    } else if (pageIds.has(page.id)) {
      addIssue(issues, filePath, 'error', `layoutDocument.pages[${index}].id`, `Duplicate page id: ${page.id}`);
    } else {
      pageIds.add(page.id);
    }
  });

  if (!isNonEmptyString(document.defaultPageId) || !pageIds.has(document.defaultPageId)) {
    addIssue(
      issues,
      filePath,
      'error',
      'layoutDocument.defaultPageId',
      'defaultPageId must point to an existing page.',
    );
  }

  const defaultPage = pages.find((page) => isRecord(page) && page.id === document.defaultPageId);
  if (!isRecord(document.layout)) {
    addIssue(
      issues,
      filePath,
      'error',
      'layoutDocument.layout',
      'layout must be present and match the default page root.',
    );
  } else if (isRecord(defaultPage?.layout) && JSON.stringify(document.layout) !== JSON.stringify(defaultPage.layout)) {
    addIssue(
      issues,
      filePath,
      'error',
      'layoutDocument.layout',
      'layout must match the default page root.',
    );
  }

  const seenIds = new Set();
  pages.forEach((page, pageIndex) => {
    if (!isRecord(page) || !isRecord(page.layout)) {
      return;
    }
    if (page.layout.alias !== 'core.screen') {
      addIssue(
        issues,
        filePath,
        'error',
        `layoutDocument.pages[${pageIndex}].layout.alias`,
        'Page root must be core.screen.',
      );
    }
    validateLayoutNode(page.layout, {
      aliases,
      componentTemplates,
      seenIds,
      filePath,
      issues,
      pageIds,
      pathName: `layoutDocument.pages[${pageIndex}].layout`,
    });
  });

  const visibleTextCount = pages.reduce(
    (total, page) => total + countVisibleText(isRecord(page) ? page.layout : null),
    0,
  );
  if (visibleTextCount === 0) {
    addIssue(
      issues,
      filePath,
      'error',
      'layoutDocument.pages',
      'No visible text nodes found.',
    );
  }
}

function validateTemplate(template, filePath, issues) {
  if (!isRecord(template)) {
    addIssue(issues, filePath, 'error', '$', 'Template must be an object.');
    return;
  }

  for (const field of REQUIRED_TEMPLATE_FIELDS) {
    if (!(field in template)) {
      addIssue(issues, filePath, 'error', field, `Missing required field: ${field}`);
    }
  }

  for (const field of ['templateId', 'name', 'tagline', 'description', 'accent', 'category']) {
    if (!isNonEmptyString(template[field])) {
      addIssue(issues, filePath, 'error', field, `${field} must be a non-empty string.`);
    }
  }
  if (isNonEmptyString(template.category) && !isCategoryKey(template.category)) {
    addIssue(
      issues,
      filePath,
      'error',
      'category',
      'category must be an English slug key; put Chinese in categoryLabel.',
    );
  }

  if (!Array.isArray(template.traits) || !template.traits.every((item) => typeof item === 'string')) {
    addIssue(issues, filePath, 'error', 'traits', 'traits must be string[].');
  }
  validateCategoryArray(
    template.platformCategories,
    PLATFORM_CATEGORIES,
    filePath,
    issues,
    'platformCategories',
  );
  validateCategoryArray(
    template.functionalCategories,
    FUNCTIONAL_CATEGORIES,
    filePath,
    issues,
    'functionalCategories',
    { strict: false },
  );
  if (
    Array.isArray(template.functionalCategories)
    && template.functionalCategories.length
    && template.category !== template.functionalCategories[0]
  ) {
    addIssue(
      issues,
      filePath,
      'error',
      'category',
      'category must match functionalCategories[0] for backwards compatibility.',
    );
  }
  if ('tags' in template && (!Array.isArray(template.tags) || !template.tags.every((item) => typeof item === 'string'))) {
    addIssue(issues, filePath, 'error', 'tags', 'tags must be string[] when present.');
  }
  if (!isNonEmptyString(template.categoryLabel)) {
    addIssue(
      issues,
      filePath,
      'error',
      'categoryLabel',
      'categoryLabel is required so frontend can display Chinese while category stays English.',
    );
  }
  if (!isRecord(template.functionalCategoryLabels)) {
    addIssue(
      issues,
      filePath,
      'error',
      'functionalCategoryLabels',
      'functionalCategoryLabels must map English functional category keys to Chinese labels.',
    );
  } else if (Array.isArray(template.functionalCategories)) {
    template.functionalCategories.forEach((key) => {
      if (isCategoryKey(key) && !isNonEmptyString(template.functionalCategoryLabels[key])) {
        addIssue(
          issues,
          filePath,
          'error',
          `functionalCategoryLabels.${key}`,
          'Missing Chinese display label for functional category key.',
        );
      }
    });
  }

  const componentTemplates = isRecord(template.componentTemplates)
    ? template.componentTemplates
    : {};
  if (!isRecord(template.componentTemplates)) {
    addIssue(
      issues,
      filePath,
      'error',
      'componentTemplates',
      'componentTemplates must be an object.',
    );
  }

  validateCssVars(template.cssVars, filePath, issues);
  validateLayoutDocument(template.layoutDocument, componentTemplates, filePath, issues);
}

function validateTemplateFile(filePath) {
  const issues = [];
  const template = readTemplate(filePath, issues);
  if (template) {
    validateTemplate(template, filePath, issues);
  }

  const errors = issues.filter((issue) => issue.level === 'error');
  return {
    filePath,
    template,
    issues,
    valid: errors.length === 0,
  };
}

function writeValidationLog(filePath, issues) {
  const lines = [
    `Template JSON validation failed for ${formatPath(filePath)}`,
    `Generated at ${new Date().toISOString()}`,
    '',
    'Errors:',
    ...issues.map((issue) => `- ${issue.path}: ${issue.message}`),
    '',
  ];
  fs.writeFileSync(logPathForTemplate(filePath), lines.join('\n'), 'utf8');
}

function removeValidationLog(filePath) {
  const target = logPathForTemplate(filePath);
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
  }
}

function main() {
  const files = collectJsonFiles(process.argv.slice(2));

  if (!files.length) {
    console.log('No template JSON files found.');
    return;
  }

  const results = files.map(validateTemplateFile);
  const validResults = results.filter((result) => result.valid);
  const invalidResults = results.filter((result) => !result.valid);

  for (const result of validResults) {
    removeValidationLog(result.filePath);
  }
  for (const result of invalidResults) {
    writeValidationLog(result.filePath, result.issues);
  }

  for (const result of invalidResults) {
    for (const issue of result.issues) {
      console.error(`${issue.file}:${issue.path}: ${issue.level}: ${issue.message}`);
    }
  }

  console.log(
    `Template JSON validation complete: ${validResults.length} valid, ${invalidResults.length} invalid.`,
  );

  if (invalidResults.length) {
    console.error(
      `Validation logs were written next to invalid JSON files as *.validation.log.`,
    );
    process.exitCode = 1;
  }
}

main();
