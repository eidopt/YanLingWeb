import type { AgentEvent, AgentToolCall } from '@shared/agent/contracts/agent';

export class AgentEventRecorder {
  private eventSeq = 0;
  private toolSeq = 0;
  readonly events: AgentEvent[] = [];
  readonly toolCalls: AgentToolCall[] = [];

  event(type: AgentEvent['type'], data?: unknown): AgentEvent {
    const item: AgentEvent = {
      seq: ++this.eventSeq,
      timestamp: new Date().toISOString(),
      type,
      data,
    };
    this.events.push(item);
    return item;
  }

  toolCall(name: string, args: Record<string, unknown>): AgentToolCall {
    const item: AgentToolCall = {
      seq: ++this.toolSeq,
      timestamp: new Date().toISOString(),
      name,
      arguments: structuredClone(args),
    };
    this.toolCalls.push(item);
    return item;
  }
}
