import type {
  AgentClarification,
  AgentClarificationOption,
  AgentPageContext,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '@shared/agent/types';

export interface EditorClarificationInput {
  prompt: string;
  document: ThemeLayoutDocument;
  pages?: AgentPageContext[];
  selectedNode?: ThemeLayoutNode | null;
  selectedDescriptor?: ThemeComponentDescriptor | null;
  clarificationChoice?: unknown;
}

interface NodeCandidate {
  node: ThemeLayoutNode;
  depth: number;
  parentId?: string;
}

const MAX_OPTIONS = 4;
const CUSTOM_CLARIFICATION = {
  allowCustom: true,
  customLabel: '其他：我来补充',
  customPlaceholder: '可以直接写清楚页面、区域、组件类型、文案或 nodeId，例如：在首页 home-product-panel 下面新增一个搜索入口。',
} satisfies Pick<
  AgentClarification,
  'allowCustom' | 'customLabel' | 'customPlaceholder'
>;

function collectNodes(
  node: ThemeLayoutNode,
  output: NodeCandidate[],
  depth = 0,
  parentId?: string,
): void {
  output.push({ node, depth, parentId });
  node.children?.forEach((child) => {
    collectNodes(child, output, depth + 1, node.id);
  });
}

function propText(node: ThemeLayoutNode): string {
  const props = node.props ?? {};
  const values = [
    props.label,
    props.text,
    props.title,
    props.placeholder,
    props.activeTab,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return values[0] ?? node.id;
}

function nodeLabel(candidate: NodeCandidate): string {
  const text = propText(candidate.node);
  return `${text} (${candidate.node.alias})`;
}

function nodeDescription(candidate: NodeCandidate): string {
  return [
    `nodeId: ${candidate.node.id}`,
    candidate.parentId ? `parent: ${candidate.parentId}` : '',
  ].filter(Boolean).join(' · ');
}

function pageLabel(page: AgentPageContext): string {
  return `${page.name} (${page.pageId})`;
}

function hasAny(prompt: string, terms: readonly string[]): boolean {
  return terms.some((term) => prompt.includes(term));
}

function isConfirmed(choice: unknown): boolean {
  return Boolean(choice && typeof choice === 'object');
}

function scoreCandidate(candidate: NodeCandidate, prompt: string): number {
  const { node } = candidate;
  const searchable = [
    node.id,
    node.alias,
    propText(node),
    ...Object.entries(node.props ?? {}).map(([key, value]) => `${key} ${String(value)}`),
  ].join(' ').toLowerCase();
  let score = Math.max(0, 8 - candidate.depth);

  if (hasAny(prompt, ['按钮', '主按钮', 'button']) && node.alias === 'core.button') score += 40;
  if (hasAny(prompt, ['搜索', '搜']) && node.alias === 'core.search') score += 40;
  if (hasAny(prompt, ['底部', '导航', 'tab', '切换']) && node.alias === 'core.tabs') score += 40;
  if (hasAny(prompt, ['公告', '提示', '提醒']) && node.alias === 'core.notice') score += 40;
  if (hasAny(prompt, ['标签', '标记']) && node.alias === 'core.tag') score += 40;
  if (hasAny(prompt, ['标题', '文案', '文字']) && node.alias === 'core.text') score += 24;
  if (hasAny(prompt, ['卡片', '面板', '区域']) && node.alias === 'core.panel') score += 20;
  if (hasAny(prompt, ['入口', '动作']) && ['core.button', 'core.search', 'core.tabs'].includes(node.alias)) score += 22;
  if (node.slot === 'footer') score += 8;

  prompt
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`|/\\_-]+/)
    .filter((token) => token.length >= 2)
    .forEach((token) => {
      if (searchable.includes(token)) score += 16;
    });

  return score;
}

function uniqueNodeCandidates(candidates: NodeCandidate[]): NodeCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.node.id)) return false;
    seen.add(candidate.node.id);
    return true;
  });
}

function buildNodeOptions(candidates: NodeCandidate[]): AgentClarificationOption[] {
  return uniqueNodeCandidates(candidates).slice(0, MAX_OPTIONS).map((candidate) => ({
    id: candidate.node.id,
    label: nodeLabel(candidate),
    description: nodeDescription(candidate),
    value: `User selected node ${candidate.node.id} (${candidate.node.alias}) as the exact edit target.`,
    target: {
      nodeId: candidate.node.id,
      alias: candidate.node.alias,
    },
  }));
}

function buildPageOptions(pages: AgentPageContext[]): AgentClarificationOption[] {
  return pages.slice(0, MAX_OPTIONS).map((page) => ({
    id: page.pageId,
    label: pageLabel(page),
    description: [
      page.isActive ? 'current page' : '',
      `root: ${page.rootNodeId}`,
    ].filter(Boolean).join(' · '),
    value: `User selected page ${page.pageId} (${page.name}) as the exact edit target.`,
    target: { pageId: page.pageId },
  }));
}

export function buildEditorClarification(
  input: EditorClarificationInput,
): AgentClarification | null {
  const prompt = input.prompt.trim().toLowerCase();
  if (!prompt || input.selectedNode || isConfirmed(input.clarificationChoice)) {
    return null;
  }

  const asksAboutPage = hasAny(prompt, ['页面', '页', 'page', 'screen']);
  const vagueTarget = hasAny(prompt, [
    '这个',
    '那个',
    '这里',
    '那里',
    '这块',
    '那块',
    '相关',
    '合适',
    '不太',
    '不对',
    '调整',
    '优化',
    '顺一下',
    '入口',
    '按钮',
    '文案',
    '标题',
    '卡片',
    '区域',
  ]);

  if (asksAboutPage && input.pages && input.pages.length > 1) {
    const options = buildPageOptions(input.pages);
    if (options.length > 1 && vagueTarget) {
      return {
        reason: 'page_target_unclear',
        question: '你想优先调整哪个页面？',
        options,
        ...CUSTOM_CLARIFICATION,
      };
    }
  }

  const nodes: NodeCandidate[] = [];
  collectNodes(input.document.layout, nodes);
  const candidates = nodes
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, prompt) }))
    .filter((item) => item.score >= 22)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.candidate);
  const options = buildNodeOptions(candidates);

  if (vagueTarget && options.length > 1) {
    return {
      reason: 'node_target_unclear',
      question: '你想修改哪一处？',
      options,
      ...CUSTOM_CLARIFICATION,
    };
  }

  return null;
}
