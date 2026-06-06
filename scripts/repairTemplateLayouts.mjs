import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const templatesDir = path.resolve(process.cwd(), 'templates_json');
const skipFiles = new Set(['importSkipList.json', 'templatesIndex.json']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getLayoutDocument(document) {
  if (isObject(document.layoutDocument)) return document.layoutDocument;
  if (Array.isArray(document.pages)) return document;
  return null;
}

function getPageId(page, index) {
  if (typeof page.id === 'string' && page.id) return page.id;
  return index === 0 ? 'home' : `page-${index}`;
}

function makeFooter(pageNames, activeTab, tabInteractions, existingFooter) {
  return {
    ...(isObject(existingFooter) ? existingFooter : {}),
    id:
      typeof existingFooter?.id === 'string' && existingFooter.id
        ? existingFooter.id
        : `footer-${activeTab}`,
    alias: 'core.tabs',
    slot: 'footer',
    layout: {
      ...(isObject(existingFooter?.layout) ? existingFooter.layout : {}),
      mode: 'flow',
      order: 999,
      width: '100%',
    },
    props: {
      ...(isObject(existingFooter?.props) ? existingFooter.props : {}),
      tabs: pageNames,
      activeTab,
    },
    interactions: {
      ...(isObject(existingFooter?.interactions) ? existingFooter.interactions : {}),
      onTabClick: tabInteractions,
    },
  };
}

function normalizeRowChildren(node) {
  if (!Array.isArray(node.children)) return 0;

  let changes = 0;
  for (const child of node.children) {
    if (!isObject(child.layout) || child.layout.mode === 'absolute') continue;

    if (child.layout.width === '100%' || child.layout.width === 100) {
      delete child.layout.width;
      changes += 1;
    }

    if (child.alias === 'core.text' && child.layout.minWidth == null) {
      child.layout.minWidth = 0;
      changes += 1;
    }
  }

  node.props = isObject(node.props) ? node.props : {};
  if (node.children.length > 2 && node.props.wrap == null) {
    node.props.wrap = true;
    changes += 1;
  }

  return changes;
}

function walk(node, visitor, parent = null) {
  if (!isObject(node)) return 0;

  let changes = visitor(node, parent) || 0;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      changes += walk(child, visitor, node);
    }
  }
  return changes;
}

function normalizeScreen(page, pageIndex, pages, homeProps) {
  const screen = page.layout;
  if (!isObject(screen)) return 0;

  let changes = 0;
  screen.props = isObject(screen.props) ? screen.props : {};
  if (screen.props.surface == null && homeProps?.surface != null) {
    screen.props.surface = homeProps.surface;
    changes += 1;
  }
  if (screen.props.chrome == null && homeProps?.chrome != null) {
    screen.props.chrome = homeProps.chrome;
    changes += 1;
  }

  const children = Array.isArray(screen.children) ? screen.children : [];
  if (!Array.isArray(screen.children)) {
    screen.children = children;
    changes += 1;
  }

  for (const child of children) {
    if (child?.slot === 'footer') continue;
    if (!isObject(child.layout) || child.layout.mode === 'absolute') continue;
    if (child.layout.width == null) {
      child.layout.width = '100%';
      changes += 1;
    }
  }

  changes += walk(screen, (node, parent) => {
    if (parent?.alias === 'core.row') {
      return 0;
    }

    if (node.alias === 'core.row') {
      return normalizeRowChildren(node);
    }

    return 0;
  });

  const pageNames = pages.map((candidate, index) => candidate.name || getPageId(candidate, index));
  const tabInteractions = {};
  pages.forEach((candidate, index) => {
    const name = pageNames[index];
    tabInteractions[name] = { type: 'navigate', targetPageId: getPageId(candidate, index) };
  });

  const activeTab = page.name || pageNames[pageIndex];
  const existingFooter = children.find((child) => child?.alias === 'core.tabs' && child?.slot === 'footer');
  const footer = makeFooter(pageNames, activeTab, tabInteractions, existingFooter);
  const nonFooterChildren = children.filter((child) => !(child?.alias === 'core.tabs' && child?.slot === 'footer'));
  screen.children = [...nonFooterChildren, footer];
  if (existingFooter == null || existingFooter !== footer || nonFooterChildren.length !== children.length - 1) {
    changes += 1;
  }

  return changes;
}

async function repairFile(fileName) {
  const filePath = path.join(templatesDir, fileName);
  const raw = await readFile(filePath, 'utf8');
  const document = JSON.parse(raw);
  const layoutDocument = getLayoutDocument(document);
  if (!layoutDocument || !Array.isArray(layoutDocument.pages) || layoutDocument.pages.length === 0) {
    return { fileName, changed: false, changes: 0 };
  }

  let changes = 0;
  const pages = layoutDocument.pages;
  const homeProps = pages[0]?.layout?.props;

  pages.forEach((page, index) => {
    changes += normalizeScreen(page, index, pages, homeProps);
  });

  const defaultPage =
    pages.find((page, index) => getPageId(page, index) === layoutDocument.defaultPageId) ?? pages[0];
  if (defaultPage?.layout) {
    layoutDocument.layout = clone(defaultPage.layout);
    changes += 1;
  }

  const nextRaw = `${JSON.stringify(document, null, 2)}\n`;
  if (nextRaw !== raw) {
    await writeFile(filePath, nextRaw, 'utf8');
    return { fileName, changed: true, changes };
  }

  return { fileName, changed: false, changes: 0 };
}

const entries = await readdir(templatesDir, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !skipFiles.has(entry.name))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

let changedFiles = 0;
let totalChanges = 0;

for (const fileName of files) {
  const result = await repairFile(fileName);
  if (result.changed) {
    changedFiles += 1;
    totalChanges += result.changes;
  }
}

console.log(`Checked ${files.length} template JSON files.`);
console.log(`Updated ${changedFiles} files with ${totalChanges} structural fixes.`);
