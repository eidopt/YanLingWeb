import { CONTAINER_ALIASES } from '../editor/applyEditorInstructions.helpers';
import { formatEditorSemanticTargetLandmarks } from '../editor/semanticTargetResolver';
import { buildTemplateProfile } from '../template/buildTemplateProfile';
import type { TemplateProfile } from '../template/templateProfile';
import type {
  AgentConversationMessage,
  AgentPageContext,
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '../types';

const MAX_NODE_SUMMARY_COUNT = 80;
const MAX_TRIMMED_CANDIDATE_COUNT = 36;
const MAX_CONVERSATION_CONTEXT_CHARS = 500_000;
const MAX_CONVERSATION_MESSAGE_CHARS = 40_000;
const MAX_TEMPLATE_CONFIG_JSON_CHARS = 16_000;

export interface AgentTemplateKnowledgeContext {
  profileGenerated?: TemplateProfile | Record<string, unknown> | null;
  profileOverride?: Record<string, unknown> | null;
  effectiveProfile?: TemplateProfile | Record<string, unknown> | null;
  assets?: Record<string, unknown> | null;
  permissions?: Record<string, unknown> | null;
  evaluation?: Record<string, unknown> | null;
}

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
  ]
    .filter(Boolean)
    .join(', ');
}

function appendNodeSummary(node: ThemeLayoutNode, lines: string[], depth = 0): void {
  if (lines.length >= MAX_NODE_SUMMARY_COUNT) {
    return;
  }
  const indent = '  '.repeat(depth);
  lines.push(`${indent}- ${node.id} | ${node.alias} | ${summarizeLayout(node)} | props: ${summarizeProps(node.props)}`);
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
  const rawTokens = value
    .toLowerCase()
    .split(/[\s,.;:!?()[\]{}"'`|/\\_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  const seen = new Set<string>(rawTokens);
  const cjkSegments = value.toLowerCase().match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const segment of cjkSegments) {
    for (let i = 0; i < segment.length - 1; i += 1) {
      seen.add(segment.slice(i, i + 2));
    }
  }
  return [...seen];
}

function nodeSearchText(node: ThemeLayoutNode): string {
  return [
    node.id,
    node.alias,
    ...Object.entries(node.props ?? {}).flatMap(([key, value]) => [key, stringifyPropValue(value)]),
  ]
    .join(' ')
    .toLowerCase();
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

export function summarizeCanvas(document: ThemeLayoutDocument): string {
  const lines: string[] = [];
  appendNodeSummary(document.layout, lines);
  if (lines.length >= MAX_NODE_SUMMARY_COUNT) {
    lines.push('- ... node summary truncated');
  }
  return lines.join('\n');
}

/** 从节点 props 推断可读的 displayName，方便 AI 识别节点用途 */
export function inferDisplayName(node: ThemeLayoutNode): string {
  const props = node.props ?? {};

  switch (node.alias) {
    case 'core.search':
      return '搜索框';
    case 'core.button': {
      const label = typeof props.label === 'string' ? props.label : '';
      return label ? `按钮:${label}` : '按钮';
    }
    case 'core.text': {
      const text = typeof props.text === 'string' ? props.text : '';
      return text ? `文字:${text.slice(0, 20)}` : '文字';
    }
    case 'core.notice': {
      const text = typeof props.text === 'string' ? props.text : '';
      return text ? `通知:${text.slice(0, 20)}` : '通知';
    }
    case 'core.panel': {
      const title = typeof props.title === 'string' ? props.title : '';
      return title ? `卡片:${title}` : '卡片';
    }
    case 'core.tabs':
      return node.slot === 'footer' ? '底部导航' : '标签栏';
    case 'core.tag': {
      const label = typeof props.label === 'string' ? props.label : '';
      return label ? `标签:${label}` : '标签';
    }
    case 'core.image':
      return '图片';
    case 'core.input': {
      const ph = typeof props.placeholder === 'string' ? props.placeholder : '';
      return ph ? `输入框:${ph.slice(0, 15)}` : '输入框';
    }
    case 'core.screen': {
      const title = typeof props.title === 'string' ? props.title : '';
      return title ? `页面:${title}` : '页面';
    }
    case 'core.divider':
      return '分隔线';
    case 'core.spacer':
      return '间距';
    case 'core.progress':
      return '进度条';
    default:
      return node.alias.replace('core.', '');
  }
}

/** 判断节点是否是容器（可接受子元素插入） */
export function isContainerNode(node: ThemeLayoutNode): boolean {
  return CONTAINER_ALIASES.has(node.alias);
}

/**
 * 构建节点候选集：完整 ID + displayName + 缩进层级 + 容器标记。
 * 替代原来的 buildNodeIndex（截断 ID 到 8 字符的平铺列表）。
 */
export function buildNodeCandidateSet(root: ThemeLayoutNode, allowedIds?: Set<string>): string {
  const lines: string[] = ['# Edit: pick targetId from below. Insert: pick [C] parentId from below.'];
  let totalCount = 0;
  let emittedCount = 0;
  const MAX_LINES = 80;

  const collect = (node: ThemeLayoutNode, depth: number) => {
    totalCount += 1;
    if ((!allowedIds || allowedIds.has(node.id)) && emittedCount < MAX_LINES) {
      const indent = '  '.repeat(depth);
      const containerMark = isContainerNode(node) ? '[C] ' : '    ';
      const displayName = inferDisplayName(node);

      // 关键消歧 props
      const keyProps: string[] = [];
      if (node.props?.variant && typeof node.props.variant === 'string') {
        keyProps.push(`variant=${node.props.variant}`);
      }
      if (node.props?.tone && typeof node.props.tone === 'string') {
        keyProps.push(`tone=${node.props.tone}`);
      }
      const propsHint = keyProps.length > 0 ? ` {${keyProps.join(', ')}}` : '';

      lines.push(`${indent}${containerMark}${node.id} (${node.alias}) — ${displayName}${propsHint}`);
      emittedCount += 1;
    }
    node.children?.forEach((child) => collect(child, depth + 1));
  };

  collect(root, 0);

  const omittedCount = totalCount - emittedCount;
  if (omittedCount > 0) {
    lines.push(`  ... ${omittedCount} more nodes omitted`);
  }
  return lines.join('\n');
}

export function summarizeComponents(components: ThemeComponentDescriptor[]): string {
  return components
    .map((component) => {
      const props = component.props
        .map((prop) => {
          const enumValues = prop.enum?.length ? `[${prop.enum.join('|')}]` : '';
          return `${prop.name}:${prop.type}${enumValues}`;
        })
        .join(', ');
      return `- ${component.alias} (${component.kind}) props: ${props || 'none'}`;
    })
    .join('\n');
}

export function summarizePages(pages: AgentPageContext[] | undefined): string {
  if (!pages?.length) {
    return 'none';
  }
  return pages
    .map((page) => {
      const activeMarker = page.isActive ? ' active' : '';
      const stats = [
        `root=${page.rootNodeId}`,
        typeof page.nodeCount === 'number' ? `nodes=${String(page.nodeCount)}` : '',
        page.isBlank ? 'blank' : '',
      ]
        .filter(Boolean)
        .join(', ');
      return `- ${page.pageId}${activeMarker} | ${page.name} | ${stats}`;
    })
    .join('\n');
}

function asTemplateProfile(value: unknown): TemplateProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Partial<TemplateProfile>;
  return Array.isArray(record.pages) &&
    Array.isArray(record.regions) &&
    Array.isArray(record.slots) &&
    Array.isArray(record.patterns)
    ? (record as TemplateProfile)
    : null;
}

function compactJson(value: unknown): string {
  if (value == null) {
    return 'none';
  }
  const serialized = JSON.stringify(value);
  if (serialized.length <= MAX_TEMPLATE_CONFIG_JSON_CHARS) {
    return serialized;
  }
  return `${serialized.slice(0, MAX_TEMPLATE_CONFIG_JSON_CHARS)}... [truncated]`;
}

function summarizeRecordKeys(label: string, value: Record<string, unknown> | null | undefined): string {
  if (!value) {
    return `- ${label}: none`;
  }
  const keys = Object.keys(value).slice(0, 24);
  return `- ${label}: keys=${keys.length ? keys.join(', ') : 'none'}`;
}

export function buildTemplateProfileSummary(profile: TemplateProfile): string {
  return [
    '## 模板语义索引（TemplateProfile 摘要）',
    '优先使用语义工具：editor_update_slot / editor_fill_pattern / ' +
      'editor_create_page_from_page_kind / editor_replace_section / editor_submit_page_spec',
    '',
    '### 可用页面类型（pageKind）',
    ...profile.pages.map((p) => `- ${p.pageKind}: pageId=${p.pageId}, name=${p.name}`),
    '',
    '### 可用区域（regionKey，replaceable=true）',
    ...profile.regions
      .filter((r) => r.replaceable)
      .map((r) => `- ${r.regionKey}: page=${r.pageKey}, nodeId=${r.nodeId}`),
    '',
    '### 可编辑槽位（slotKey，最多 30 个）',
    ...profile.slots.slice(0, 30).map((s) => `- ${s.slotKey}: ${s.component} props=[${s.editableProps.join(',')}]`),
    '',
    '### 可填充模式（patternKey）',
    ...profile.patterns.map(
      (p) => `- ${p.patternKey}: fields=[${p.fields.map((f) => f.fieldKey).join(',')}], maxItems=${p.maxItems ?? 50}`,
    ),
  ].join('\n');
}

function summarizeTemplateProfile(profile: TemplateProfile): string {
  const lines: string[] = [
    `- templateId=${profile.templateId}`,
    `- profileVersion=${profile.profileVersion}, templateVersion=${profile.templateVersion}`,
    `- devices=${profile.devices.join(', ') || 'none'}`,
    '- pages:',
    ...profile.pages
      .slice(0, 16)
      .map((page) => `  - ${page.pageKey} | pageId=${page.pageId} | kind=${page.pageKind} | name=${page.name}`),
    profile.pages.length > 16 ? `  - ... ${profile.pages.length - 16} more pages` : '',
    '- regions:',
    ...profile.regions.slice(0, 24).map((region) => {
      const replaceable = String(Boolean(region.replaceable));
      return `  - ${region.regionKey} | page=${region.pageKey} | nodeId=${region.nodeId} | replaceable=${replaceable}`;
    }),
    profile.regions.length > 24 ? `  - ... ${profile.regions.length - 24} more regions` : '',
    '- slots:',
    ...profile.slots.slice(0, 40).map((slot) => {
      const editableProps = slot.editableProps.join(',');
      return [
        `  - ${slot.slotKey}`,
        `page=${slot.pageKey}`,
        `nodeId=${slot.nodeId}`,
        `component=${slot.component}`,
        `props=${editableProps}`,
      ].join(' | ');
    }),
    profile.slots.length > 40 ? `  - ... ${profile.slots.length - 40} more slots` : '',
    '- patterns:',
    ...profile.patterns.slice(0, 16).map((pattern) => {
      const fields = pattern.fields.map((field) => field.fieldKey).join(',');
      return [
        `  - ${pattern.patternKey}`,
        `page=${pattern.pageKey}`,
        `root=${pattern.sourceRootNodeId}`,
        `fields=${fields}`,
      ].join(' | ');
    }),
    profile.patterns.length > 16 ? `  - ... ${profile.patterns.length - 16} more patterns` : '',
  ].filter(Boolean);

  if (profile.navigation) {
    lines.push(
      `- navigation=${profile.navigation.type}: ${
        profile.navigation.items.map((item) => `${item.key}:${item.label}`).join(', ') || 'none'
      }`,
    );
  }
  if (profile.constraints) {
    lines.push(`- constraints=${compactJson(profile.constraints)}`);
  }
  return lines.join('\n');
}

function hasNonEmptyRecordOrArray(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return false;
}

export function summarizeTemplateAgentKnowledge(knowledge: AgentTemplateKnowledgeContext | null | undefined): string {
  if (!knowledge) {
    return '';
  }
  const effectiveProfile = asTemplateProfile(knowledge.effectiveProfile);
  const optionalSections: [string, Record<string, unknown> | null | undefined][] = [
    ['profileOverride', knowledge.profileOverride],
    ['assets', knowledge.assets],
    ['permissions', knowledge.permissions],
    ['evaluation', knowledge.evaluation],
  ];
  const nonEmptySections = optionalSections.filter(([, value]) => hasNonEmptyRecordOrArray(value));

  const lines = [
    'Template semantic config from database:',
    effectiveProfile
      ? summarizeTemplateProfile(effectiveProfile)
      : `- effectiveProfile=${compactJson(knowledge.effectiveProfile)}`,
    ...nonEmptySections.map(([label, value]) => summarizeRecordKeys(label, value)),
  ];

  if (nonEmptySections.length > 0) {
    lines.push('', 'Template config JSON snippets:');
    for (const [label, value] of nonEmptySections) {
      lines.push(`${label}=${compactJson(value)}`);
    }
  }
  return lines.join('\n');
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

export function buildEditorStablePrefixContext(components: readonly ThemeComponentDescriptor[]): string {
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
    ? ['', 'Loaded dependencies:', ...document.dependencies.map((dep) => `  - ${dep.name}: ${dep.url}`)].join('\n')
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
    'Editable nodes (use exact full IDs in tool calls; [C] = container, can be parentId for insert):',
    buildNodeCandidateSet(document.layout),
    '',
    'Semantic Landmarks (use these as fallback via semanticTarget):',
    formatEditorSemanticTargetLandmarks(document.layout),
    depsSection,
    '',
    buildTemplateProfileSummary(buildTemplateProfile(document)),
  ]
    .filter(Boolean)
    .join('\n');
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
  const selectedNodeId = selectedNode?.id;

  let candidateSetText: string;
  if (nodes.length <= MAX_NODE_SUMMARY_COUNT) {
    candidateSetText = buildNodeCandidateSet(document.layout);
  } else {
    const promptTokens = normalizedSearchTokens(prompt);
    const parentById = new Map<string, string>();
    for (const item of nodes) {
      if (item.parentId) {
        parentById.set(item.node.id, item.parentId);
      }
    }
    const allowedIds = new Set<string>();
    const addWithAncestors = (nodeId: string): void => {
      let current: string | undefined = nodeId;
      while (current && !allowedIds.has(current)) {
        allowedIds.add(current);
        current = parentById.get(current);
      }
    };
    if (selectedNodeId) {
      addWithAncestors(selectedNodeId);
    }
    const topScored = nodes
      .map((item) => ({
        item,
        score: scoreNodeForPrompt(item, promptTokens, selectedNodeId),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_TRIMMED_CANDIDATE_COUNT);
    for (const { item } of topScored) {
      addWithAncestors(item.node.id);
    }
    candidateSetText = buildNodeCandidateSet(document.layout, allowedIds);
  }

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
    'Editable nodes (use exact full IDs in tool calls; [C] = container, can be parentId for insert):',
    candidateSetText,
    '',
    'Semantic Landmarks (use these as fallback via semanticTarget):',
    formatEditorSemanticTargetLandmarks(document.layout),
  ]
    .filter(Boolean)
    .join('\n');
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
  ]
    .filter(Boolean)
    .join('\n');
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
