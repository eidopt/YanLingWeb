export const SSE_OUTPUT_FRAME_MS = 32;
export const SSE_OUTPUT_MIN_CHARS = 12;
export const SSE_OUTPUT_MAX_CHARS = 64;

export type SsePacedKind = 'text' | 'reasoning';

export interface SsePacedEvent {
  kind: SsePacedKind;
  messageId: string;
  text: string;
}

export interface SseControlEvent {
  kind: 'control';
  name: string;
  data: string;
  terminal?: boolean;
}

export type SseQueuedEvent = SsePacedEvent | SseControlEvent;

export interface SseOutputFrame {
  sessionId: string;
  kind: SsePacedKind | 'control';
  messageId?: string;
  text?: string;
  name?: string;
  data?: string;
  terminal?: boolean;
}

interface OutputBuffer {
  messageId: string;
  text: string;
  reasoning: string;
}

function releaseCount(length: number): number {
  if (length <= 0) {
    return 0;
  }
  const catchUp = Math.ceil(length / 6);
  return Math.min(length, Math.max(SSE_OUTPUT_MIN_CHARS, Math.min(SSE_OUTPUT_MAX_CHARS, catchUp)));
}

function takePrefix(value: string, count: number): { chunk: string; rest: string } {
  return {
    chunk: value.slice(0, count),
    rest: value.slice(count),
  };
}

/**
 * Coalesce bursty SSE text into capped frames.
 * Control events flush the backlog first so status never lands ahead of the text.
 */
export class SseOutputController {
  private sessionId = '';
  private buffer: OutputBuffer | null = null;

  start(sessionId: string): void {
    this.sessionId = sessionId;
    this.buffer = { messageId: '', text: '', reasoning: '' };
  }

  reset(): void {
    this.sessionId = '';
    this.buffer = null;
  }

  get activeSessionId(): string {
    return this.sessionId;
  }

  get pendingChars(): number {
    return (this.buffer?.text.length ?? 0) + (this.buffer?.reasoning.length ?? 0);
  }

  enqueue(sessionId: string, event: SseQueuedEvent): SseOutputFrame[] {
    if (!this.accepts(sessionId)) {
      return [];
    }
    if (event.kind === 'control') {
      return [
        ...this.drain(sessionId, Number.POSITIVE_INFINITY),
        {
          sessionId,
          kind: 'control',
          name: event.name,
          data: event.data,
          terminal: event.terminal,
        },
      ];
    }

    const buffer = this.ensureBuffer(event.messageId);
    if (event.kind === 'text') {
      buffer.text += event.text;
    } else {
      buffer.reasoning += event.text;
    }
    return [];
  }

  tick(sessionId: string): SseOutputFrame[] {
    if (!this.accepts(sessionId)) {
      return [];
    }
    return this.drain(sessionId, releaseCount(this.pendingChars));
  }

  flush(sessionId: string): SseOutputFrame[] {
    if (!this.accepts(sessionId)) {
      return [];
    }
    return this.drain(sessionId, Number.POSITIVE_INFINITY);
  }

  private accepts(sessionId: string): boolean {
    return sessionId.length > 0 && sessionId === this.sessionId && this.buffer !== null;
  }

  private ensureBuffer(messageId: string): OutputBuffer {
    this.buffer ??= { messageId, text: '', reasoning: '' };
    this.buffer.messageId = messageId;
    return this.buffer;
  }

  private drain(sessionId: string, budget: number): SseOutputFrame[] {
    const buffer = this.buffer;
    if (!buffer || budget <= 0) {
      return [];
    }

    const frames: SseOutputFrame[] = [];
    let remaining = budget;
    if (buffer.text.length > 0 && remaining > 0) {
      const next = takePrefix(buffer.text, remaining);
      buffer.text = next.rest;
      remaining -= next.chunk.length;
      frames.push({
        sessionId,
        kind: 'text',
        messageId: buffer.messageId,
        text: next.chunk,
      });
    }
    if (buffer.reasoning.length > 0 && remaining > 0) {
      const next = takePrefix(buffer.reasoning, remaining);
      buffer.reasoning = next.rest;
      frames.push({
        sessionId,
        kind: 'reasoning',
        messageId: buffer.messageId,
        text: next.chunk,
      });
    }
    return frames;
  }
}
