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
  output: { node: ThemeLayoutNode; depth: number; parentId?: string }[],
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

function buildNodeIndex(root: ThemeLayoutNode): string {
  const lines: string[] = [];
  let count = 0;
  const MAX_INDEX_LINES = 50;

  const collect = (node: ThemeLayoutNode, parentId?: string) => {
    if (count >= MAX_INDEX_LINES) {
      return;
    }
    const propSummary = Object.entries(node.props ?? {})
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`)
      .slice(0, 2)
      .join(', ');
    const parentInfo = parentId ? `, parent=${parentId.slice(0, 8)}` : '';
    lines.push(`  ${node.id.slice(0, 8)} | ${node.alias}${parentInfo} | ${propSummary || 'no text props'}`);
    count += 1;
    node.children?.forEach((c) => collect(c, node.id));
  };

  collect(root);
  if (count >= MAX_INDEX_LINES) {
    lines.push(`  ... ${count - MAX_INDEX_LINES} more nodes omitted`);
  }
  return lines.join('\n');
}

function buildSimpleSemanticLandmarks(root: ThemeLayoutNode): string {
  const landmarks: { role: string; nodeId: string; alias: string; label: string }[] = [];

  const walk = (node: ThemeLayoutNode, depth = 0, rootIndex = 0) => {
    // page_footer_nav: footer slot tabs or bottom nav aliases
    if (
      (node.alias === 'core.tabs' && node.slot === 'footer') ||
      (node.alias === 'svc-bottom-bar') ||
      (node.alias === 'com-bottom-tabs')
    ) {
      landmarks.push({ role: 'page_footer_nav', nodeId: node.id, alias: node.alias, label: String(node.props?.activeTab ?? 'footer tabs') });
    }

    // page_header + page_title + main_content: root screen
    if (node.alias === 'core.screen') {
      landmarks.push({ role: 'page_header', nodeId: node.id, alias: node.alias, label: String(node.props?.title ?? 'root screen') });
      landmarks.push({ role: 'page_title', nodeId: node.id, alias: node.alias, label: String(node.props?.title ?? 'root screen') });
      landmarks.push({ role: 'main_content', nodeId: node.id, alias: node.alias, label: String(node.props?.title ?? 'root screen') });
    }

    // main_content: top-level body containers (depth=1, non-footer, first 2)
    if (
      depth === 1 &&
      node.slot !== 'footer' &&
      ['core.panel', 'core.stack', 'core.row', 'core.grid'].includes(node.alias) &&
      rootIndex <= 1
    ) {
      landmarks.push({ role: 'main_content', nodeId: node.id, alias: node.alias, label: 'body container' });
    }

    // search_box
    if (node.alias === 'core.search') {
      landmarks.push({ role: 'search_box', nodeId: node.id, alias: node.alias, label: String(node.props?.placeholder ?? 'search') });
    }

    // primary_cta: primary variant buttons
    if (node.alias === 'core.button' && node.props?.variant === 'primary') {
      landmarks.push({ role: 'primary_cta', nodeId: node.id, alias: node.alias, label: String(node.props?.label ?? 'button') });
    }
    // primary_cta: any button (lower priority, shown for discoverability)
    if (node.alias === 'core.button' && node.props?.variant !== 'primary') {
      landmarks.push({ role: 'primary_cta', nodeId: node.id, alias: node.alias, label: String(node.props?.label ?? 'button') });
    }

    // notice_banner
    if (node.alias === 'core.notice') {
      landmarks.push({ role: 'notice_banner', nodeId: node.id, alias: node.alias, label: String(node.props?.text ?? 'notice') });
    }

    // section_header: nodes with both title and actionLabel
    if (node.props?.title && node.props?.actionLabel) {
      landmarks.push({ role: 'section_header', nodeId: node.id, alias: node.alias, label: String(node.props.title) });
    }

    node.children?.forEach((child, index) => {
      walk(child, depth + 1, depth === 0 ? index : rootIndex);
    });
  };

  walk(root);

  if (!landmarks.length) {
    return 'none detected';
  }

  // Deduplicate by role:nodeId, keeping the first (highest priority) entry
  const seen = new Set<string>();
  const unique = landmarks.filter((l) => {
    const key = `${l.role}:${l.nodeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique
    .map((l) => `- ${l.role} -> nodeId=${l.nodeId}, alias=${l.alias}, label=${l.label}`)
    .join('\n');
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
    '',
    'Node ID Quick Reference (use these exact IDs in tool calls):',
    buildNodeIndex(document.layout),
    '',
    'Semantic Landmarks (use these as fallback via semanticTarget):',
    buildSimpleSemanticLandmarks(document.layout),
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
  const nodes: { node: ThemeLayoutNode; depth: number; parentId?: string }[] = [];
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
