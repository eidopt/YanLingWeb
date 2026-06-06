export type AgentMode = 'template_generation' | 'editor_edit';
export type AgentRunStatus = 'passed' | 'failed' | 'errored';

export interface LayoutNodeLayout {
  mode: 'flow' | 'grid' | 'absolute';
  flowRow?: number;
  order?: number;
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  gridColumn?: string;
  gridRow?: string;
  alignSelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch';
  justifySelf?: 'auto' | 'start' | 'center' | 'end' | 'stretch';
}

export interface LayoutNodeFrame {
  position: 'absolute';
  x?: number;
  y?: number;
  left?: number | string;
  top?: number | string;
  right?: number | string;
  bottom?: number | string;
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  zIndex?: number;
  unit?: 'px' | '%';
}

export interface LayoutPropDescriptor {
  name: string;
  type: string;
  label?: string;
  required?: boolean;
  description?: string;
  enum?: string[];
}

export interface ThemeComponentDescriptor {
  alias: string;
  name: string;
  kind: 'layout' | 'component';
  description: string;
  props: LayoutPropDescriptor[];
}

export interface ThemeLayoutNavigateAction {
  type: 'navigate';
  targetPageId: string;
}

export interface ThemeLayoutSetVisibilityAction {
  type: 'setVisibility';
  targetNodeId: string;
  visible: boolean;
}

export interface ThemeLayoutToggleVisibilityAction {
  type: 'toggleVisibility';
  targetNodeId: string;
}

export type ThemeLayoutNodeAction =
  | ThemeLayoutNavigateAction
  | ThemeLayoutSetVisibilityAction
  | ThemeLayoutToggleVisibilityAction;

export type ThemeLayoutTabInteraction = ThemeLayoutNavigateAction | Record<string, ThemeLayoutNavigateAction>;

export interface ThemeLayoutNodeInteractions {
  onClick?: ThemeLayoutNodeAction;
  onActionClick?: ThemeLayoutNodeAction;
  onStatusClick?: ThemeLayoutNodeAction;
  onTabClick?: ThemeLayoutTabInteraction;
}

export interface ThemeLayoutNodeSemanticMeta {
  pageKey?: string;
  regionKey?: string;
  slotKey?: string;
  patternKey?: string;
  aiRole?: string;
  /** Explicit pageKind annotation (takes priority over inference) */
  pageKind?: string;
}

export interface ThemeLayoutNode {
  id: string;
  alias: string;
  slot?: 'body' | 'footer';
  layout: LayoutNodeLayout;
  frame?: LayoutNodeFrame;
  props?: Record<string, unknown>;
  interactions?: ThemeLayoutNodeInteractions;
  meta?: ThemeLayoutNodeSemanticMeta;
  children?: ThemeLayoutNode[];
}

export interface ThemeLayoutPage {
  id: string;
  name: string;
  description?: string;
  layout: ThemeLayoutNode;
}

export interface ThemeLibraryDependency {
  name: string;
  url: string;
}

export interface ThemeLayoutStyleManifest {
  cssVars?: Record<string, string>;
}

export interface ThemeLayoutWidgetPolicy {
  enabled?: boolean;
  allowedLibraries?: string[];
  allowedRenderers?: string[];
  allowedCapabilities?: ('chart' | 'animation' | 'diagram')[];
}

export interface ThemeLayoutDataSource {
  id: string;
  kind: 'staticJson' | 'publicJsonEndpoint';
  description?: string;
  url?: string;
  data?: unknown;
  select?: string;
  fallback?: unknown;
}

export interface ThemeLayoutDocument {
  version: number;
  schemaVersion?: number;
  themeId: string;
  themeName: string;
  pageName?: string;
  description: string;
  components: ThemeComponentDescriptor[];
  defaultPageId: string;
  pages: ThemeLayoutPage[];
  layout: ThemeLayoutNode;
  dependencies?: ThemeLibraryDependency[];
  widgetPolicy?: ThemeLayoutWidgetPolicy;
  dataSources?: ThemeLayoutDataSource[];
  componentTemplates?: Record<string, unknown>;
  cssVars?: Record<string, string>;
  cssAnimations?: Record<string, string> | null;
  style?: ThemeLayoutStyleManifest;
}

export interface AgentPageContext {
  pageId: string;
  name: string;
  rootNodeId: string;
  isActive?: boolean;
  nodeCount?: number;
  bodyNodeCount?: number;
  footerNodeCount?: number;
  isBlank?: boolean;
}

export interface AgentConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentClarificationOption {
  id: string;
  label: string;
  description?: string;
  value: string;
  target?: {
    nodeId?: string;
    pageId?: string;
    alias?: string;
  };
}

export interface AgentClarification {
  reason: string;
  question: string;
  options: AgentClarificationOption[];
  allowCustom?: boolean;
  customLabel?: string;
  customPlaceholder?: string;
}

export interface AgentRunInput {
  mode: AgentMode;
  prompt: string;
  model?: string;
  templateId?: string;
  scenarioId?: string;
  document?: ThemeLayoutDocument;
  pages?: AgentPageContext[];
  selectedNodeId?: string | null;
  conversation?: AgentConversationMessage[];
}

export interface AgentEvent {
  seq: number;
  timestamp: string;
  type:
    | 'intent_plan'
    | 'text'
    | 'tool_start'
    | 'tool_done'
    | 'tool_error'
    | 'edit_applied'
    | 'template_saved'
    | 'clarification'
    | 'error'
    | 'done';
  data?: unknown;
}

export interface AgentToolCall {
  seq: number;
  timestamp: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  score: number;
}

export type SemanticAssertionType =
  | 'node_exists'
  | 'node_not_exists'
  | 'node_alias_equals'
  | 'node_prop_equals'
  | 'node_prop_contains'
  | 'node_prop_not_contains'
  | 'page_exists'
  | 'page_not_exists'
  | 'page_count_equals'
  | 'page_count_delta'
  | 'page_name_contains'
  | 'navigation_targets_include'
  | 'navigation_targets_exact'
  | 'document_contains_text'
  | 'document_not_contains_text'
  | 'component_count_delta'
  | 'new_page_has_min_nodes'
  | 'all_pages_have_screen_root'
  | 'generated_app_has_min_pages'
  | 'generated_app_has_required_sections';

export interface SemanticAssertion {
  type: SemanticAssertionType;
  nodeId?: string;
  alias?: string;
  prop?: string;
  value?: unknown;
  pageId?: string;
  pageName?: string;
  count?: number;
  delta?: number;
  minNodes?: number;
  minPages?: number;
  sections?: string[];
  labels?: string[];
  targetPageIds?: string[];
}

export interface SemanticScenarioExpected {
  mustHave?: SemanticAssertion[];
  mustNotChange?: SemanticAssertion[];
  allowedChanges?: { path: string }[];
  maxUnrelatedChangeScore?: number;
}

export interface SemanticAssertionResult {
  assertion: SemanticAssertion;
  passed: boolean;
  message: string;
}

export interface SemanticEvaluationResult {
  passed: boolean;
  taskScore: number;
  failures: SemanticAssertionResult[];
  results: SemanticAssertionResult[];
}

export interface TemplateDiffChange {
  path: string;
  before?: unknown;
  after?: unknown;
  type: 'added' | 'removed' | 'changed';
}

export interface UnrelatedDiffResult {
  passed: boolean;
  score: number;
  maxScore: number;
  changes: TemplateDiffChange[];
  unrelatedChanges: TemplateDiffChange[];
}

export interface RenderSmokeResult {
  passed: boolean;
  score: number;
  errors: string[];
  visibleTextCount: number;
}

export interface AgentRunResult {
  scenarioId?: string;
  mode: AgentMode;
  prompt: string;
  status: AgentRunStatus;
  events: AgentEvent[];
  toolCalls: AgentToolCall[];
  initialDocument?: ThemeLayoutDocument;
  finalDocument?: ThemeLayoutDocument;
  validation: ValidationResult;
  semantic: SemanticEvaluationResult;
  unrelatedDiff: UnrelatedDiffResult;
  render: RenderSmokeResult;
  durationMs: number;
  error?: string;
  clarification?: AgentClarification;
  clarificationChoice?: AgentClarificationOption;
  conversationBatchId?: string;
  providerMessages?: unknown[];
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
  };
  cacheDiagnostics?: {
    prefixHash: string;
    toolHash: string;
    firstDynamicMessageIndex: number;
    prefixMessageCount: number;
    prefixTokenEstimate?: number;
    providerLogMessageCount?: number;
    toolCount: number;
  };
}

export interface AgentEvalScenario {
  id: string;
  group: string;
  mode: AgentMode;
  prompt: string;
  startDocument?: string;
  selectedNodeId?: string | null;
  expected: SemanticScenarioExpected;
  mock?: {
    operations?: unknown[];
    templateDomain?: string;
  };
}
