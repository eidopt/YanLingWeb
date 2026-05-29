import type { ThemeLayoutDocument, ThemeLayoutNode } from '../types';

export interface EditorSemanticTargetLandmark {
  role: string;
  nodeId: string;
  alias: string;
  label: string;
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

function labelFromProp(value: unknown, fallback: string): string {
  return stringifyPropValue(value) || fallback;
}

function findNode(root: ThemeLayoutNode, nodeId: string): ThemeLayoutNode | null {
  if (root.id === nodeId) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findNode(child, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

function pushLandmark(
  landmarks: EditorSemanticTargetLandmark[],
  role: string,
  node: ThemeLayoutNode,
  label: string,
): void {
  landmarks.push({
    role,
    nodeId: node.id,
    alias: node.alias,
    label,
  });
}

function isBodyContainer(node: ThemeLayoutNode): boolean {
  return ['core.panel', 'core.stack', 'core.row', 'core.grid'].includes(node.alias);
}

function isHeadingText(node: ThemeLayoutNode): boolean {
  if (node.alias !== 'core.text') {
    return false;
  }
  const variant = node.props?.variant;
  return ['display', 'heading', 'title', 'subheading'].includes(typeof variant === 'string' ? variant : '');
}

function walkLandmarks(
  node: ThemeLayoutNode,
  landmarks: EditorSemanticTargetLandmark[],
  depth = 0,
  rootIndex = 0,
): void {
  const props = node.props ?? {};

  if (
    (node.alias === 'core.tabs' && node.slot === 'footer') ||
    node.alias === 'svc-bottom-bar' ||
    node.alias === 'com-bottom-tabs'
  ) {
    pushLandmark(landmarks, 'page_footer_nav', node, labelFromProp(props.activeTab, 'footer tabs'));
  }

  if (node.alias === 'core.screen') {
    const title = labelFromProp(props.title, 'root screen');
    pushLandmark(landmarks, 'page_header', node, title);
    pushLandmark(landmarks, 'main_content', node, title);
  }

  if (isHeadingText(node)) {
    pushLandmark(landmarks, 'page_title', node, labelFromProp(props.text, 'page title'));
    pushLandmark(landmarks, 'section_header', node, labelFromProp(props.text, 'section header'));
  }

  if (depth === 1 && node.slot !== 'footer' && isBodyContainer(node) && rootIndex <= 1) {
    pushLandmark(landmarks, 'main_content', node, 'body container');
  }

  if (node.alias === 'core.search') {
    pushLandmark(landmarks, 'search_box', node, labelFromProp(props.placeholder, 'search'));
  }

  if (node.alias === 'core.button' && props.variant === 'primary') {
    pushLandmark(landmarks, 'primary_cta', node, labelFromProp(props.label, 'button'));
  }

  if (node.alias === 'core.button' && props.variant !== 'primary') {
    pushLandmark(landmarks, 'primary_cta', node, labelFromProp(props.label, 'button'));
  }

  if (props.title && props.actionLabel) {
    pushLandmark(landmarks, 'section_header', node, labelFromProp(props.title, 'section header'));
  }

  node.children?.forEach((child, index) => {
    walkLandmarks(child, landmarks, depth + 1, depth === 0 ? index : rootIndex);
  });
}

function dedupeLandmarks(landmarks: EditorSemanticTargetLandmark[]): EditorSemanticTargetLandmark[] {
  const seen = new Set<string>();
  return landmarks.filter((landmark) => {
    const key = `${landmark.role}:${landmark.nodeId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeSemanticTarget(target: string): string {
  const normalized = target
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    bottom_nav: 'page_footer_nav',
    bottom_tabs: 'page_footer_nav',
    footer: 'page_footer_nav',
    footer_nav: 'page_footer_nav',
    footer_tabs: 'page_footer_nav',
    header: 'page_header',
    main: 'main_content',
    primary_button: 'primary_cta',
    search: 'search_box',
    selected: 'selected_node',
    title: 'page_title',
  };
  return aliases[normalized] ?? normalized;
}

export function listEditorSemanticTargetLandmarks(root: ThemeLayoutNode): EditorSemanticTargetLandmark[] {
  const landmarks: EditorSemanticTargetLandmark[] = [];
  walkLandmarks(root, landmarks);

  if (!landmarks.some((landmark) => landmark.role === 'page_title') && root.alias === 'core.screen') {
    pushLandmark(landmarks, 'page_title', root, labelFromProp(root.props?.title, 'root screen'));
  }

  return dedupeLandmarks(landmarks);
}

export function formatEditorSemanticTargetLandmarks(root: ThemeLayoutNode): string {
  const landmarks = listEditorSemanticTargetLandmarks(root);
  if (!landmarks.length) {
    return 'none detected';
  }
  return landmarks
    .map(
      (landmark) => `- ${landmark.role} -> nodeId=${landmark.nodeId}, alias=${landmark.alias}, label=${landmark.label}`,
    )
    .join('\n');
}

export function resolveEditorSemanticTarget(
  document: ThemeLayoutDocument,
  target: string,
  selectedNodeId?: string | null,
): { nodeId: string } | null {
  const role = normalizeSemanticTarget(target);

  if (role === 'selected_node' && selectedNodeId && findNode(document.layout, selectedNodeId)) {
    return { nodeId: selectedNodeId };
  }

  const landmark = listEditorSemanticTargetLandmarks(document.layout).find((item) => item.role === role);
  return landmark ? { nodeId: landmark.nodeId } : null;
}
