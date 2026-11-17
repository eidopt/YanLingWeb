import type {
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from "../../layout/types";

type SemanticTargetConfidence = "high" | "medium" | "low";

interface SemanticTargetDefinition {
  role: string;
  label: string;
  keywords: readonly string[];
  description: string;
}

interface TraversedNode {
  node: ThemeLayoutNode;
  depth: number;
  parentId?: string;
  rootIndex: number;
}

interface ScoredSemanticTargetCandidate {
  role: SemanticTargetRole;
  nodeId: string;
  alias: string;
  label: string;
  confidence: SemanticTargetConfidence;
  reason: string;
  score: number;
}

export interface SemanticTargetCandidate {
  role: SemanticTargetRole;
  nodeId: string;
  alias: string;
  label: string;
  confidence: SemanticTargetConfidence;
  reason: string;
}

export interface ResolveSemanticTargetOptions {
  target?: string;
  text?: string;
  selectedNodeId?: string | null;
}

export const SEMANTIC_TARGET_DEFINITIONS = [
  {
    role: "page_footer_nav",
    label: "页面底栏 / 底部导航",
    keywords: [
      "页面底栏",
      "底栏",
      "底部栏",
      "底部导航",
      "底部标签栏",
      "底部 tab",
      "底部tab",
      "页脚导航",
      "footer",
      "footer tabs",
      "bottom tabs",
      "bottom nav",
      "tabbar",
      "tab bar",
    ],
    description: "页面底部的 tabs/tabbar/navigation/footer 组件。",
  },
  {
    role: "page_header",
    label: "页面顶部栏 / 标题栏",
    keywords: [
      "页面顶部",
      "顶部栏",
      "顶栏",
      "标题栏",
      "导航栏",
      "页面头部",
      "头部",
      "header",
      "top bar",
      "navbar",
      "navigation bar",
    ],
    description: "页面顶部状态栏、标题栏或根 screen 的头部属性。",
  },
  {
    role: "page_title",
    label: "页面标题",
    keywords: [
      "页面标题",
      "标题",
      "主标题",
      "大标题",
      "title",
      "page title",
      "screen title",
    ],
    description: "当前页面的 screen.title 或最主要标题节点。",
  },
  {
    role: "primary_cta",
    label: "主按钮 / CTA",
    keywords: [
      "主按钮",
      "主要按钮",
      "行动按钮",
      "cta",
      "primary cta",
      "primary button",
      "立即按钮",
      "预约按钮",
      "提交按钮",
    ],
    description: "页面中最主要的按钮或行动入口。",
  },
  {
    role: "search_box",
    label: "搜索框",
    keywords: [
      "搜索框",
      "搜索栏",
      "搜索",
      "搜索入口",
      "search",
      "search box",
      "search bar",
    ],
    description: "页面中的搜索输入或搜索栏组件。",
  },
  {
    role: "main_content",
    label: "主内容区",
    keywords: [
      "主内容",
      "内容区",
      "主体内容",
      "页面主体",
      "中间内容",
      "main content",
      "body",
      "content area",
    ],
    description: "页面主体区域，通常是根 screen 或主要 body 容器。",
  },
  {
    role: "section_header",
    label: "区块标题",
    keywords: [
      "区块标题",
      "模块标题",
      "分区标题",
      "栏目标题",
      "section header",
      "section title",
    ],
    description: "列表、卡片区或内容分区的标题组件。",
  },
  {
    role: "selected_node",
    label: "当前选中组件",
    keywords: [
      "当前组件",
      "选中组件",
      "当前选中",
      "这个组件",
      "这个",
      "这里",
      "selected",
      "selected node",
      "current node",
    ],
    description: "编辑器里当前选中的节点。",
  },
] as const satisfies readonly SemanticTargetDefinition[];

export type SemanticTargetRole =
  (typeof SEMANTIC_TARGET_DEFINITIONS)[number]["role"];

type ActiveSemanticTargetDefinition =
  Omit<SemanticTargetDefinition, "role"> & { role: SemanticTargetRole };

export interface SemanticTargetDefinitionConfig {
  role: SemanticTargetRole;
  label?: string;
  keywords?: readonly string[];
  description?: string;
}

export const SEMANTIC_TARGET_ROLE_VALUES: SemanticTargetRole[] =
  SEMANTIC_TARGET_DEFINITIONS.map((definition) => definition.role);

let activeSemanticTargetDefinitions: readonly ActiveSemanticTargetDefinition[] =
  SEMANTIC_TARGET_DEFINITIONS;

const ROLE_ORDER = new Map(
  SEMANTIC_TARGET_ROLE_VALUES.map((role, index) => [role, index]),
);

const FOOTER_NAV_ALIASES = new Set([
  "core.tabs",
  "svc-bottom-bar",
  "com-bottom-tabs",
]);

const CONTAINER_ALIASES = new Set([
  'core.screen',
  'core.panel',
  'core.stack',
  'core.row',
  'core.grid',
  'core.html',
  'core.navbar',
  'core.list',
  'core.list-item',
  'core.dialog',
  'core.drawer',
  'core.collapse',
  'core.sidebar',
  'core.form',
  'core.toolbar',
  'core.splitter',
  'core.timeline',
  'core.tree',
]);

const BUTTON_ALIASES = new Set([
  "core.button",
  "svc-button",
  "com-button",
]);

function normalizeSemanticText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function includesKeyword(text: string, keyword: string) {
  return normalizeSemanticText(text).includes(normalizeSemanticText(keyword));
}

function isSemanticRole(value: string): value is SemanticTargetRole {
  return SEMANTIC_TARGET_ROLE_VALUES.includes(value as SemanticTargetRole);
}

function getSemanticTargetDefinitions(): readonly ActiveSemanticTargetDefinition[] {
  return activeSemanticTargetDefinitions;
}

function nonEmptyTrimmed(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

export function configureSemanticTargetDefinitions(
  definitions: readonly SemanticTargetDefinitionConfig[] | undefined,
) {
  if (!definitions?.length) {
    activeSemanticTargetDefinitions = SEMANTIC_TARGET_DEFINITIONS;
    return;
  }

  const incomingByRole = new Map(
    definitions
      .filter((definition) => isSemanticRole(definition.role))
      .map((definition) => [definition.role, definition]),
  );

  activeSemanticTargetDefinitions = SEMANTIC_TARGET_DEFINITIONS.map((fallback) => {
    const incoming = incomingByRole.get(fallback.role);
    if (!incoming) {
      return fallback;
    }

    const keywords = incoming.keywords
      ?.map((keyword) => keyword.trim())
      .filter(Boolean);

    return {
      role: fallback.role,
      label: nonEmptyTrimmed(incoming.label) ?? fallback.label,
      keywords: keywords?.length ? keywords : fallback.keywords,
      description: nonEmptyTrimmed(incoming.description) ?? fallback.description,
    };
  });
}

function flattenNodes(
  node: ThemeLayoutNode,
  nodes: TraversedNode[],
  depth = 0,
  parentId?: string,
  rootIndex = 0,
) {
  nodes.push({ node, depth, parentId, rootIndex });
  node.children?.forEach((child, index) => {
    const childRootIndex = depth === 0 ? index : rootIndex;
    flattenNodes(child, nodes, depth + 1, node.id, childRootIndex);
  });
}

function getStringProp(node: ThemeLayoutNode, name: string) {
  const value = node.props?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function propText(node: ThemeLayoutNode) {
  return [
    node.id,
    node.alias,
    node.slot ?? "",
    getStringProp(node, "title"),
    getStringProp(node, "label"),
    getStringProp(node, "text"),
    getStringProp(node, "placeholder"),
    getStringProp(node, "activeTab"),
    getStringProp(node, "actionLabel"),
    getStringProp(node, "headerActionLabel"),
  ].filter(Boolean).join(" ");
}

function nodeLabel(node: ThemeLayoutNode) {
  return (
    getStringProp(node, "title") ||
    getStringProp(node, "label") ||
    getStringProp(node, "text") ||
    getStringProp(node, "placeholder") ||
    getStringProp(node, "activeTab") ||
    node.id
  );
}

function confidenceFromScore(score: number): SemanticTargetConfidence {
  if (score >= 80) {
    return "high";
  }
  if (score >= 55) {
    return "medium";
  }
  return "low";
}

function candidate(
  role: SemanticTargetRole,
  node: ThemeLayoutNode,
  score: number,
  reason: string,
): ScoredSemanticTargetCandidate {
  return {
    role,
    nodeId: node.id,
    alias: node.alias,
    label: nodeLabel(node),
    confidence: confidenceFromScore(score),
    reason,
    score,
  };
}

function isFooterNavNode(node: ThemeLayoutNode) {
  const text = propText(node);
  return (
    node.slot === "footer" &&
    (
      FOOTER_NAV_ALIASES.has(node.alias) ||
      includesKeyword(text, "bottom") ||
      includesKeyword(text, "footer") ||
      includesKeyword(text, "tabs") ||
      Boolean(node.props?.activeTab)
    )
  );
}

function isSearchNode(node: ThemeLayoutNode) {
  return node.alias === "core.search" || includesKeyword(propText(node), "search");
}

function isButtonNode(node: ThemeLayoutNode) {
  return BUTTON_ALIASES.has(node.alias) || includesKeyword(node.alias, "button");
}

function isSectionHeaderNode(node: ThemeLayoutNode) {
  return (
    includesKeyword(node.alias, "section-header") ||
    (
      Boolean(getStringProp(node, "title")) &&
      Boolean(getStringProp(node, "actionLabel"))
    )
  );
}

function scoreNodeForRole(item: TraversedNode): ScoredSemanticTargetCandidate[] {
  const { node, depth, rootIndex } = item;
  const results: ScoredSemanticTargetCandidate[] = [];

  if (isFooterNavNode(node)) {
    results.push(candidate(
      "page_footer_nav",
      node,
      FOOTER_NAV_ALIASES.has(node.alias) ? 100 : 88,
      "slot=footer 且具备底部导航特征",
    ));
  }

  if (node.alias === "core.screen") {
    results.push(candidate("page_header", node, 90, "根 screen 承载页面头部属性"));
    results.push(candidate("page_title", node, 95, "根 screen 承载页面标题"));
    results.push(candidate("main_content", node, 86, "根 screen 是页面主体容器"));
  }

  if (
    depth === 1 &&
    node.slot !== "footer" &&
    CONTAINER_ALIASES.has(node.alias) &&
    rootIndex <= 1
  ) {
    results.push(candidate("main_content", node, 58, "靠前的 body 容器"));
  }

  if (isSearchNode(node)) {
    results.push(candidate(
      "search_box",
      node,
      node.alias === "core.search" ? 100 : 72,
      "搜索组件或搜索相关属性",
    ));
  }

  if (isButtonNode(node)) {
    const variant = getStringProp(node, "variant");
    const score = variant === "primary" ? 95 : 74;
    results.push(candidate("primary_cta", node, score, "按钮组件"));
  } else if (getStringProp(node, "actionLabel")) {
    results.push(candidate("primary_cta", node, 56, "包含 actionLabel 行动入口"));
  }

  if (isSectionHeaderNode(node)) {
    results.push(candidate("section_header", node, 88, "区块标题组件"));
  }

  if (
    node.alias !== "core.screen" &&
    getStringProp(node, "title") &&
    !isSectionHeaderNode(node)
  ) {
    results.push(candidate("page_title", node, 54, "包含 title 属性"));
  }

  return results;
}

function dedupeCandidates(
  candidates: ScoredSemanticTargetCandidate[],
): ScoredSemanticTargetCandidate[] {
  const bestByKey = new Map<string, ScoredSemanticTargetCandidate>();
  candidates.forEach((item) => {
    const key = `${item.role}:${item.nodeId}`;
    const previous = bestByKey.get(key);
    if (!previous || item.score > previous.score) {
      bestByKey.set(key, item);
    }
  });

  return [...bestByKey.values()].sort((a, b) => {
    const roleDelta =
      (ROLE_ORDER.get(a.role) ?? 0) - (ROLE_ORDER.get(b.role) ?? 0);
    if (roleDelta !== 0) {
      return roleDelta;
    }
    return b.score - a.score;
  });
}

export function getSemanticTargetDefinition(role: SemanticTargetRole) {
  return getSemanticTargetDefinitions().find(
    (definition) => definition.role === role,
  );
}

function findScoredSemanticTargetCandidates(
  document: ThemeLayoutDocument,
  selectedNodeId?: string | null,
) {
  const nodes: TraversedNode[] = [];
  flattenNodes(document.layout, nodes);

  const candidates = nodes.flatMap(scoreNodeForRole);
  if (selectedNodeId) {
    const selectedNode = nodes.find((item) => item.node.id === selectedNodeId)?.node;
    if (selectedNode) {
      candidates.push(candidate(
        "selected_node",
        selectedNode,
        100,
        "编辑器当前选中节点",
      ));
    }
  }

  return dedupeCandidates(candidates);
}

export function inferSemanticRole(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const trimmed = value.trim();
  if (isSemanticRole(trimmed)) {
    return trimmed;
  }

  return getSemanticTargetDefinitions().find((definition) => (
    includesKeyword(trimmed, definition.role) ||
    definition.keywords.some((keyword) => includesKeyword(trimmed, keyword))
  ))?.role ?? null;
}

export function findSemanticTargetCandidates(
  document: ThemeLayoutDocument,
  selectedNodeId?: string | null,
): SemanticTargetCandidate[] {
  return findScoredSemanticTargetCandidates(document, selectedNodeId)
    .map(({ score: _score, ...item }) => item);
}

export function formatSemanticTargetContext(
  document: ThemeLayoutDocument,
  selectedNodeId?: string | null,
) {
  const glossary = getSemanticTargetDefinitions().map((definition) => (
    `- ${definition.role}: ${definition.label}; keywords=${definition.keywords.join(", ")}`
  ));
  const candidates = findSemanticTargetCandidates(document, selectedNodeId);
  const landmarks = candidates.length
    ? candidates.map((item) => (
        `- ${item.role} -> nodeId=${item.nodeId}, alias=${item.alias}, `
        + `label=${item.label}, confidence=${item.confidence}, reason=${item.reason}`
      ))
    : ["- none detected"];

  return [
    "Global semantic target glossary:",
    ...glossary,
    "",
    "Detected semantic landmarks in current canvas:",
    ...landmarks,
  ].join("\n");
}

export function resolveSemanticTargetNodeId(
  document: ThemeLayoutDocument,
  options: ResolveSemanticTargetOptions,
) {
  const role =
    inferSemanticRole(options.target) ??
    inferSemanticRole(options.text);
  if (!role) {
    return null;
  }

  const candidates = findScoredSemanticTargetCandidates(
    document,
    options.selectedNodeId,
  ).filter((item) => item.role === role);
  if (!candidates.length) {
    return null;
  }

  const best = candidates[0];
  const isClearlyAhead =
    candidates.length > 1 &&
    best.score >= 80 &&
    best.score - candidates[1].score >= 20;
  if (
    candidates.length === 1 ||
    best.nodeId === options.selectedNodeId ||
    isClearlyAhead
  ) {
    const { score: _score, ...resolved } = best;
    return resolved;
  }

  return null;
}
