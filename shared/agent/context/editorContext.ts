import type {
  AgentConversationMessage,
  AgentPageContext,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '../types';

const MAX_NODE_SUMMARY_COUNT = 80;
const MAX_TRIMMED_NODE_SUMMARY_COUNT = 28;
const MAX_CONVERSATION_CONTEXT_CHARS = 500_000;
const MAX_CONVERSATION_MESSAGE_CHARS = 40_000;

function stringifyPropValue(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stringifyPropValue).filter(Boolean).join(', ')}]`;
  }
  return '{...}';
}

function summarizeProps(props: Record<string, unknown> | undefined): string {
  const entries = Object.entries(props ?? {})
    .slice(0, 6)
    .map(([key, value]) => `${key}=${stringifyPropValue(value)}`)
    .filter(Boolean);
  return entries.length ? entries.join(', ') : 'none';
}

function summarizeLayout(node: ThemeLayoutNode): string {
  return [
    `mode=${node.layout.mode}`,
    node.layout.width ? `width=${String(node.layout.width)}` : '',
    typeof node.layout.flowRow === 'number' ? `row=${String(node.layout.flowRow)}` : '',
    typeof node.layout.order === 'number' ? `order=${String(node.layout.order)}` : '',
  ].filter(Boolean).join(', ');
}

function appendNodeSummary(node: ThemeLayoutNode, lines: string[], depth = 0): void {
  if (lines.length >= MAX_NODE_SUMMARY_COUNT) {
    return;
  }
  const indent = '  '.repeat(depth);
  lines.push(
    `${indent}- ${node.id} | ${node.alias} | ${summarizeLayout(node)} | props: ${summarizeProps(node.props)}`,
  );
  node.children?.forEach((child) => {
    appendNodeSummary(child, lines, depth + 1);
  });
}

function collectNodes(
  node: ThemeLayoutNode,
  output: Array<{ node: ThemeLayoutNode; depth: number; parentId?: string }>,
  depth = 0,
  parentId?: string,
): void {
  output.push({ node, depth, parentId });
  node.children?.forEach((child) => {
    collectNodes(child, output, depth + 1, node.id);
  });
}

function normalizedSearchTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`|/\\_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function nodeSearchText(node: ThemeLayoutNode): string {
  return [
    node.id,
    node.alias,
    ...Object.entries(node.props ?? {}).flatMap(([key, value]) => [
      key,
      stringifyPropValue(value),
    ]),
  ].join(' ').toLowerCase();
}

function scoreNodeForPrompt(
  item: { node: ThemeLayoutNode; depth: number; parentId?: string },
  promptTokens: readonly string[],
  selectedNodeId?: string,
): number {
  const { node } = item;
  let score = 0;
  const text = nodeSearchText(node);
  if (selectedNodeId && node.id === selectedNodeId) {
    score += 100;
  }
  if (node.slot === 'footer') {
    score += 6;
  }
  if (['core.button', 'core.search', 'core.tabs', 'core.notice', 'core.tag'].includes(node.alias)) {
    score += 8;
  }
  if (['core.panel', 'core.row', 'core.grid', 'core.stack'].includes(node.alias)) {
    score += 3;
  }
  promptTokens.forEach((token) => {
    if (text.includes(token)) {
      score += 12;
    }
  });
  score += Math.max(0, 8 - item.depth);
  return score;
}

function summarizeNodeLine(
  item: { node: ThemeLayoutNode; depth: number; parentId?: string },
): string {
  const { node, depth, parentId } = item;
  return [
    `- ${node.id}`,
    `alias=${node.alias}`,
    parentId ? `parent=${parentId}` : '',
    `depth=${String(depth)}`,
    `layout=(${summarizeLayout(node)})`,
    `props=(${summarizeProps(node.props)})`,
  ].filter(Boolean).join(' | ');
}

export function summarizeCanvas(document: ThemeLayoutDocument): string {
  const lines: string[] = [];
  appendNodeSummary(document.layout, lines);
  if (lines.length >= MAX_NODE_SUMMARY_COUNT) {
    lines.push('- ... node summary truncated');
  }
  return lines.join('\n');
}

export function summarizeComponents(components: ThemeComponentDescriptor[]): string {
  return components.map((component) => {
    const props = component.props.map((prop) => {
      const enumValues = prop.enum?.length ? `[${prop.enum.join('|')}]` : '';
      return `${prop.name}:${prop.type}${enumValues}`;
    }).join(', ');
    return `- ${component.alias} (${component.kind}) props: ${props || 'none'}`;
  }).join('\n');
}

export function summarizePages(pages: AgentPageContext[] | undefined): string {
  if (!pages?.length) {
    return 'none';
  }
  return pages.map((page) => {
    const activeMarker = page.isActive ? ' active' : '';
    const stats = [
      `root=${page.rootNodeId}`,
      typeof page.nodeCount === 'number' ? `nodes=${String(page.nodeCount)}` : '',
      page.isBlank ? 'blank' : '',
    ].filter(Boolean).join(', ');
    return `- ${page.pageId}${activeMarker} | ${page.name} | ${stats}`;
  }).join('\n');
}

export function buildEditorContext(
  document: ThemeLayoutDocument,
  pages: AgentPageContext[] | undefined,
  selectedNode: ThemeLayoutNode | null | undefined,
  selectedDescriptor: ThemeComponentDescriptor | null | undefined,
): string {
  return [
    buildEditorStablePrefixContext(document.components),
    '',
    buildEditorVolatileContext(document, pages, selectedNode, selectedDescriptor),
  ].join('\n');
}

export function buildEditorStablePrefixContext(
  components: readonly ThemeComponentDescriptor[],
): string {
  return [
    'Stable editor contract:',
    '- The component catalog below is stable prefix context. Use only these aliases.',
    '- Existing node ids and current page state are provided later in the turn.',
    '- Prefer exact prop updates over broad rewrites.',
    '',
    'Available component catalog:',
    summarizeComponents([...components]),
  ].join('\n');
}

export function buildEditorVolatileContext(
  document: ThemeLayoutDocument,
  pages: AgentPageContext[] | undefined,
  selectedNode: ThemeLayoutNode | null | undefined,
  selectedDescriptor: ThemeComponentDescriptor | null | undefined,
): string {
  const depsSection = document.dependencies?.length
    ? [
        '',
        'Loaded dependencies:',
        ...document.dependencies.map((dep) => `  - ${dep.name}: ${dep.url}`),
      ].join('\n')
    : '';

  return [
    'Current editor context:',
    `themeId: ${document.themeId}`,
    `themeName: ${document.themeName}`,
    `pageName: ${document.pageName ?? document.defaultPageId}`,
    '',
    'Known editor pages:',
    summarizePages(pages),
    '',
    'Selected node:',
    selectedNode
      ? [
          `id: ${selectedNode.id}`,
          `alias: ${selectedNode.alias}`,
          `name: ${selectedDescriptor?.name ?? selectedNode.alias}`,
          `props: ${summarizeProps(selectedNode.props)}`,
        ].join('\n')
      : 'none',
    '',
    'Current canvas outline:',
    summarizeCanvas(document),
    depsSection,
  ].filter(Boolean).join('\n');
}

export function buildEditorTrimmedVolatileContext(
  document: ThemeLayoutDocument,
  pages: AgentPageContext[] | undefined,
  selectedNode: ThemeLayoutNode | null | undefined,
  selectedDescriptor: ThemeComponentDescriptor | null | undefined,
  prompt: string,
): string {
  const nodes: Array<{ node: ThemeLayoutNode; depth: number; parentId?: string }> = [];
  collectNodes(document.layout, nodes);
  const promptTokens = normalizedSearchTokens(prompt);
  const selectedNodeId = selectedNode?.id;
  const selectedAndScored = nodes
    .map((item) => ({
      item,
      score: scoreNodeForPrompt(item, promptTokens, selectedNodeId),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_TRIMMED_NODE_SUMMARY_COUNT)
    .sort((a, b) => a.item.depth - b.item.depth || a.item.node.id.localeCompare(b.item.node.id));

  return [
    'Current editor context:',
    `themeId: ${document.themeId}`,
    `themeName: ${document.themeName}`,
    `pageName: ${document.pageName ?? document.defaultPageId}`,
    '',
    'Known editor pages:',
    summarizePages(pages),
    '',
    'Selected node:',
    selectedNode
      ? [
          `id: ${selectedNode.id}`,
          `alias: ${selectedNode.alias}`,
          `name: ${selectedDescriptor?.name ?? selectedNode.alias}`,
          `props: ${summarizeProps(selectedNode.props)}`,
        ].join('\n')
      : 'none',
    '',
    'Relevant editable nodes:',
    selectedAndScored.length
      ? selectedAndScored.map(({ item }) => summarizeNodeLine(item)).join('\n')
      : 'none',
    nodes.length > selectedAndScored.length
      ? `- ... ${String(nodes.length - selectedAndScored.length)} nodes omitted from volatile context`
      : '',
  ].filter(Boolean).join('\n');
}

export function buildEditorMinimalVolatileContext(
  document: ThemeLayoutDocument,
  pages: AgentPageContext[] | undefined,
  selectedNode: ThemeLayoutNode | null | undefined,
  selectedDescriptor: ThemeComponentDescriptor | null | undefined,
): string {
  return [
    'Current editor context:',
    `themeId: ${document.themeId}`,
    `pageName: ${document.pageName ?? document.defaultPageId}`,
    '',
    'Known editor pages:',
    summarizePages(pages),
    '',
    'Selected node:',
    selectedNode
      ? [
          `id: ${selectedNode.id}`,
          `alias: ${selectedNode.alias}`,
          `name: ${selectedDescriptor?.name ?? selectedNode.alias}`,
        ].join('\n')
      : 'none',
  ].filter(Boolean).join('\n');
}

function trimConversationContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_CONVERSATION_MESSAGE_CHARS) {
    return trimmed;
  }
  return `[Earlier content omitted]\n${trimmed.slice(-MAX_CONVERSATION_MESSAGE_CHARS)}`;
}

export function buildConversationContextMessages(
  conversation: readonly AgentConversationMessage[] | undefined,
): AgentConversationMessage[] {
  const normalized = (conversation ?? [])
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      content: trimConversationContent(message.content),
    }));
  const output: AgentConversationMessage[] = [];
  let totalChars = 0;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const message = normalized[index];
    const nextTotal = totalChars + message.content.length;
    if (nextTotal > MAX_CONVERSATION_CONTEXT_CHARS) {
      break;
    }
    output.unshift(message);
    totalChars = nextTotal;
  }
  return output;
}
