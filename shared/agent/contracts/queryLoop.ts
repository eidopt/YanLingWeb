import type { AIProvider, ProviderMessage, ProviderRequest, ProviderTool, StreamEventDone } from './provider';

export interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  output: string;
  action?: 'done';
}

export interface ToolSpec {
  name: string;
  supportsParallel?: boolean;
}

export interface QueryLoopConfig {
  provider: AIProvider;
  model: string;
  tools: ProviderTool[];
  toolSpecs: Map<string, ToolSpec>;
  toolExecutor: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  onTextDelta: (text: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolEvent: (event: { name: string; status: 'start' | 'done' | 'error'; detail?: string }) => void;
  onContextCompacted?: () => void;
  onError?: (msg: string) => void;
  onUsage?: (usage: NonNullable<StreamEventDone['usage']>, request: ProviderRequest) => void | Promise<void>;
  requestCache?: ProviderRequest['cache'];
  maxIterations?: number;
  isCancelled: () => boolean;
}

export interface QueryResult {
  messages: ProviderMessage[];
  finalText: string;
  iterations: number;
  stopReason: 'completed' | 'max_iterations' | 'error' | 'cancelled';
  error?: string;
  responseId?: string;
}
