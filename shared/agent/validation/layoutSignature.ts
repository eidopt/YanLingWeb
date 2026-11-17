import type { ThemeLayoutDocument, ThemeLayoutNode } from '../types';

/** 容器 alias 列表 — 与 applyEditorInstructions.helpers 同源。 */
const CONTAINER_ALIASES = new Set([
  'core.screen', 'core.panel', 'core.stack', 'core.row', 'core.grid',
  'core.html', 'core.navbar', 'core.list', 'core.list-item', 'core.dialog',
  'core.drawer', 'core.collapse', 'core.sidebar', 'core.form', 'core.toolbar',
  'core.splitter', 'core.timeline', 'core.tree',
]);

const LEAF_ALIASES = new Set([
  'core.text', 'core.button', 'core.image', 'core.progress', 'core.tag',
  'core.divider', 'core.spacer', 'core.input', 'core.tabs', 'core.search',
  'core.notice', 'core.widget', 'core.tabbar', 'core.statistic',
  'core.avatar', 'core.badge', 'core.breadcrumb', 'core.pagination',
  'core.empty', 'core.skeleton', 'core.select', 'core.checkbox',
  'core.radio', 'core.switch', 'core.rate', 'core.slider',
  'core.datepicker', 'core.timepicker', 'core.upload', 'core.toast',
  'core.alert', 'core.loading', 'core.video', 'core.audio', 'core.tooltip',
  'core.carousel', 'core.table',
]);

/**
 * 计算渲染树结构指纹。流程：
 * 1. 递归遍历 pages[].layout，将 alias 映射为简写 token
 * 2. 自动忽略 id / props / interactions / slot 等无关字段
 * 3. 容器节点用 () 包裹子树；叶子节点直接输出 token
 * 4. 返回形如 "screen(panel(text,button),tabs)" 的结构签名
 */
export function computeLayoutSignature(layout: ThemeLayoutNode): string {
  const aliasToken = shortAlias(layout.alias);
  const children = layout.children ?? [];
  if (children.length === 0) {
    return aliasToken;
  }
  const inner = children.map(computeLayoutSignature).join(',');
  return `${aliasToken}(${inner})`;
}

/**
 * 为文档所有页面计算结构指纹，每个页面一行。
 * 忽略 tabbar 导航（所有页面的 footer tabs 结构高度相似，会污染对比）。
 */
export function computeDocumentLayoutSignatures(document: ThemeLayoutDocument): string[] {
  return document.pages.map((page) => {
    const stripped = stripFooterTabs(page.layout);
    return computeLayoutSignature(stripped);
  });
}

/**
 * 计算整篇文档的组合结构指纹：所有页面按 defaultPageId 排序，拼接为多行。
 */
export function computeDocumentCombinedSignature(document: ThemeLayoutDocument): string {
  const pages = document.pages.sort((a, b) => {
    if (a.id === document.defaultPageId) return -1;
    if (b.id === document.defaultPageId) return 1;
    return 0;
  });
  return pages.map((p) => {
    const sig = computeLayoutSignature(p.layout);
    return sig;
  }).join('|');
}

/** 递归移除 footer slot 的 tabbar/tabs 节点 */
function stripFooterTabs(node: ThemeLayoutNode): ThemeLayoutNode {
  const children = (node.children ?? [])
    .filter((child) => child.slot !== 'footer' || !LEAF_ALIASES.has(child.alias))
    .map(stripFooterTabs);
  return { ...node, children: children.length > 0 ? children : undefined };
}

function shortAlias(alias: string): string {
  const parts = alias.split('.');
  return parts.length === 2 ? parts[1] : alias.replace(/[^a-z0-9]/g, '');
}

/**
 * 比较两个结构指纹的相似度（0-1）。1 = 完全相同。
 * 算法：把指纹拆成 alias token 序列，计算 Jaccard 相似度。
 */
export function structuralSimilarity(a: string, b: string): number {
  const tokensA = tokenizeSignature(a);
  const tokensB = tokenizeSignature(b);
  const intersection = [...tokensA].filter((t) => tokensB.has(t));
  const union = new Set([...tokensA, ...tokensB]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

function tokenizeSignature(sig: string): Set<string> {
  return new Set(sig.split(/[(),|]/).filter(Boolean));
}
