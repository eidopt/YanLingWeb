import { compileNode } from './compileNode';
import type { ThemeLayoutNode, ThemeLayoutNodeAction, ThemeLayoutPage } from 'ui/layout/types';

export interface CompiledPage {
  fileName: string;
  componentName: string;
  content: string;
  needsAsyncDataBoundary: boolean;
  needsAsyncDataHelpers: boolean;
  needsHtmlBlock: boolean;
  needsInteractiveAlert: boolean;
  needsInteractiveCarousel: boolean;
  needsInteractiveDialog: boolean;
  needsInteractiveDrawer: boolean;
  needsInteractiveForm: boolean;
  needsInteractivePagination: boolean;
  needsInteractiveRate: boolean;
  needsInteractiveSwitch: boolean;
  needsInteractiveTabs: boolean;
  needsUnsupportedNode: boolean;
  needsStaticWidget: boolean;
}

interface VisibilityTriggerSummary {
  controlledNodeIds: Set<string>;
  initialVisibleNodes: Record<string, boolean>;
  hasVisibilityActions: boolean;
  usesToggleVisibility: boolean;
}

export interface CompilePageOptions {
  dataSourceIds?: ReadonlySet<string>;
}

const VISIBILITY_TARGET_ALIASES = new Set(['core.dialog', 'core.drawer']);

function collectNodesById(root: ThemeLayoutNode): Map<string, ThemeLayoutNode> {
  const nodesById = new Map<string, ThemeLayoutNode>();
  const visit = (node: ThemeLayoutNode) => {
    nodesById.set(node.id, node);
    node.children?.forEach(visit);
  };
  visit(root);
  return nodesById;
}

function collectAction(action: ThemeLayoutNodeAction | undefined, summary: VisibilityTriggerSummary): void {
  if (!action) {
    return;
  }
  if (action.type === 'setVisibility') {
    summary.hasVisibilityActions = true;
    return;
  }
  if (action.type === 'toggleVisibility') {
    summary.hasVisibilityActions = true;
    summary.usesToggleVisibility = true;
  }
}

function summarizeVisibilityTriggers(root: ThemeLayoutNode): VisibilityTriggerSummary {
  const nodesById = collectNodesById(root);
  const summary: VisibilityTriggerSummary = {
    controlledNodeIds: new Set<string>(),
    initialVisibleNodes: {},
    hasVisibilityActions: false,
    usesToggleVisibility: false,
  };

  const visit = (node: ThemeLayoutNode) => {
    const interactions = node.interactions;
    const actions = [interactions?.onClick, interactions?.onActionClick, interactions?.onStatusClick];
    actions.forEach((action) => {
      collectAction(action, summary);
      if (action?.type !== 'setVisibility' && action?.type !== 'toggleVisibility') {
        return;
      }
      const target = nodesById.get(action.targetNodeId);
      if (!target || !VISIBILITY_TARGET_ALIASES.has(target.alias)) {
        return;
      }
      summary.controlledNodeIds.add(target.id);
      summary.initialVisibleNodes[target.id] = Boolean(target.props?.visible);
    });
    node.children?.forEach(visit);
  };

  visit(root);
  return summary;
}

function formatInitialVisibleNodes(summary: VisibilityTriggerSummary): string {
  return JSON.stringify(summary.initialVisibleNodes, null, 2);
}

function buildVisibilityStateCode(summary: VisibilityTriggerSummary): string {
  if (!summary.hasVisibilityActions) {
    return '';
  }
  const toggleCode = summary.usesToggleVisibility
    ? `
  const toggleNodeVisibility = useCallback((nodeId: string) => {
    setVisibleNodes((current) => ({ ...current, [nodeId]: !(current[nodeId] ?? false) }));
  }, []);
`
    : '';
  return `
  const [visibleNodes, setVisibleNodes] = useState<Record<string, boolean>>(initialVisibleNodes);
  const setNodeVisibility = useCallback((nodeId: string, visible: boolean) => {
    setVisibleNodes((current) => ({ ...current, [nodeId]: visible }));
  }, []);
${toggleCode}`;
}

export function compilePage(
  page: ThemeLayoutPage,
  componentName: string,
  fileName: string,
  options: CompilePageOptions = {},
): CompiledPage {
  const visibilityTriggers = summarizeVisibilityTriggers(page.layout);
  const node = compileNode(page.layout, 2, {
    controlledVisibilityNodeIds: visibilityTriggers.controlledNodeIds,
    dataSourceIds: options.dataSourceIds,
  });
  const imports = [
    visibilityTriggers.hasVisibilityActions ? "import { useCallback, useState } from 'react';" : null,
    "import type { PageProps } from '../types';",
    node.needsAsyncDataBoundary ? "import { AsyncDataBoundary } from '../components/AsyncDataBoundary';" : null,
    node.needsAsyncDataHelpers ? "import { asRecordArray, readDisplayValue } from '../data/dataSources';" : null,
    node.needsHtmlBlock ? "import { HtmlBlock } from '../components/HtmlBlock';" : null,
    node.needsInteractiveAlert ? "import { InteractiveAlert } from '../components/InteractiveAlert';" : null,
    node.needsInteractiveCarousel ? "import { InteractiveCarousel } from '../components/InteractiveCarousel';" : null,
    node.needsInteractiveDialog ? "import { InteractiveDialog } from '../components/InteractiveDialog';" : null,
    node.needsInteractiveDrawer ? "import { InteractiveDrawer } from '../components/InteractiveDrawer';" : null,
    node.needsInteractiveForm ? "import { InteractiveForm } from '../components/InteractiveForm';" : null,
    node.needsInteractivePagination
      ? "import { InteractivePagination } from '../components/InteractivePagination';"
      : null,
    node.needsInteractiveRate ? "import { InteractiveRate } from '../components/InteractiveRate';" : null,
    node.needsInteractiveSwitch ? "import { InteractiveSwitch } from '../components/InteractiveSwitch';" : null,
    node.needsInteractiveTabs ? "import { InteractiveTabs } from '../components/InteractiveTabs';" : null,
    node.needsUnsupportedNode ? "import { UnsupportedNode } from '../components/UnsupportedNode';" : null,
    node.needsStaticWidget ? "import { StaticWidget } from '../components/StaticWidget';" : null,
  ]
    .filter(Boolean)
    .join('\n');
  const visibilityConstants = visibilityTriggers.hasVisibilityActions
    ? `
const initialVisibleNodes: Record<string, boolean> = ${formatInitialVisibleNodes(visibilityTriggers)};
`
    : '';
  const visibilityStateCode = buildVisibilityStateCode(visibilityTriggers);

  return {
    fileName,
    componentName,
    needsAsyncDataBoundary: node.needsAsyncDataBoundary,
    needsAsyncDataHelpers: node.needsAsyncDataHelpers,
    needsHtmlBlock: node.needsHtmlBlock,
    needsInteractiveAlert: node.needsInteractiveAlert,
    needsInteractiveCarousel: node.needsInteractiveCarousel,
    needsInteractiveDialog: node.needsInteractiveDialog,
    needsInteractiveDrawer: node.needsInteractiveDrawer,
    needsInteractiveForm: node.needsInteractiveForm,
    needsInteractivePagination: node.needsInteractivePagination,
    needsInteractiveRate: node.needsInteractiveRate,
    needsInteractiveSwitch: node.needsInteractiveSwitch,
    needsInteractiveTabs: node.needsInteractiveTabs,
    needsUnsupportedNode: node.needsUnsupportedNode,
    needsStaticWidget: node.needsStaticWidget,
    content: `${imports}
${visibilityConstants}

export function ${componentName}({ onNavigate }: PageProps) {
${visibilityStateCode}
  return (
${node.code}
  );
}
`,
  };
}
