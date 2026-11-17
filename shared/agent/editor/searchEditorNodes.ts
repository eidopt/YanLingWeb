import type { ThemeLayoutDocument, ThemeLayoutNode } from '../types';

export interface EditorNodeSearchHit {
  id: string;
  alias: string;
  text: string;
  parentId?: string;
  pageId?: string;
}

export interface EditorNodeSearchInput {
  text?: string;
  alias?: string;
  pageId?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 8;

interface CollectedNode {
  node: ThemeLayoutNode;
  parentId?: string;
  pageId?: string;
  depth: number;
}

function propText(node: ThemeLayoutNode): string {
  const props = node.props ?? {};
  return [props.text, props.label, props.title, props.placeholder, props.name, props.activeTab]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
}

function collect(
  node: ThemeLayoutNode,
  pageId: string | undefined,
  output: CollectedNode[],
  depth = 0,
  parentId?: string,
): void {
  output.push({ node, parentId, pageId, depth });
  node.children?.forEach((child) => collect(child, pageId, output, depth + 1, node.id));
}

function aliasMatches(nodeAlias: string, requested: string): boolean {
  const left = nodeAlias.toLowerCase();
  const right = requested.trim().toLowerCase();
  return left === right || left === `core.${right}` || left.endsWith(`.${right}`);
}

function scoreText(haystack: string, query: string): number {
  if (!query) {
    return 0;
  }
  let score = 0;
  if (haystack.includes(query)) {
    score += 50;
  }
  const compact = query.replace(/\s+/g, '');
  const seen = new Set<string>();
  for (let index = 0; index < compact.length - 1 && seen.size < 4; index += 1) {
    const slice = compact.slice(index, index + 2);
    if (/[^\u4e00-\u9fff]/.test(slice) || seen.has(slice)) {
      continue;
    }
    seen.add(slice);
    if (haystack.includes(slice)) {
      score += 12;
    }
  }
  for (const token of query.split(/[^\p{L}\p{N}]+/u)) {
    if (token.length >= 2 && haystack.includes(token)) {
      score += 8;
    }
  }
  return score;
}

export function searchEditorNodes(
  document: ThemeLayoutDocument,
  input: EditorNodeSearchInput,
): EditorNodeSearchHit[] {
  const text = input.text?.trim().toLowerCase() ?? '';
  const alias = input.alias?.trim() ?? '';
  if (!text && !alias) {
    return [];
  }

  const pages = input.pageId
    ? document.pages.filter((page) => page.id === input.pageId)
    : document.pages;
  const collected: CollectedNode[] = [];
  const seenRoots = new Set<ThemeLayoutNode>();
  const pushRoot = (root: ThemeLayoutNode | undefined, pageId: string | undefined) => {
    if (!root || seenRoots.has(root)) {
      return;
    }
    seenRoots.add(root);
    collect(root, pageId, collected);
  };

  if (!input.pageId || input.pageId === document.defaultPageId) {
    pushRoot(document.layout, document.defaultPageId);
  }
  for (const page of pages) {
    pushRoot(page.layout, page.id);
  }

  const limit = input.limit ?? DEFAULT_LIMIT;
  const ranked = collected
    .map((item) => {
      if (alias && !aliasMatches(item.node.alias, alias)) {
        return null;
      }
      const textValue = propText(item.node);
      const haystack = `${item.node.id} ${item.node.alias} ${textValue}`.toLowerCase();
      const textScore = scoreText(haystack, text);
      if (text && textScore === 0) {
        return null;
      }
      return {
        score: textScore + (alias ? 20 : 0) + Math.max(0, 6 - item.depth),
        hit: {
          id: item.node.id,
          alias: item.node.alias,
          text: textValue,
          ...(item.parentId ? { parentId: item.parentId } : {}),
          ...(item.pageId ? { pageId: item.pageId } : {}),
        } satisfies EditorNodeSearchHit,
      };
    })
    .filter((item): item is { score: number; hit: EditorNodeSearchHit } => Boolean(item))
    .sort((left, right) => right.score - left.score || left.hit.id.localeCompare(right.hit.id));

  const hits: EditorNodeSearchHit[] = [];
  const seen = new Set<string>();
  for (const item of ranked) {
    if (seen.has(item.hit.id)) {
      continue;
    }
    seen.add(item.hit.id);
    hits.push(item.hit);
    if (hits.length >= limit) {
      break;
    }
  }
  return hits;
}
