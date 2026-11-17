import { SSE_OUTPUT_FRAME_MS, SseOutputController, type SseQueuedEvent } from './sseOutputController';

interface WorkerInbound {
  type: 'start' | 'enqueue' | 'flush' | 'reset';
  sessionId?: string;
  event?: SseQueuedEvent;
}

const controller = new SseOutputController();
let timer: ReturnType<typeof setInterval> | null = null;

function postFrames(sessionId: string, frames: ReturnType<SseOutputController['tick']>, drained = false): void {
  if (frames.length > 0) {
    self.postMessage({ type: 'frames', sessionId, frames });
  }
  if (drained) {
    self.postMessage({ type: 'drained', sessionId });
  }
}

function ensureTimer(): void {
  if (timer !== null) {
    return;
  }
  timer = setInterval(() => {
    const sessionId = controller.activeSessionId;
    if (!sessionId) {
      return;
    }
    const frames = controller.tick(sessionId);
    if (frames.length > 0) {
      self.postMessage({ type: 'frames', sessionId, frames });
    }
  }, SSE_OUTPUT_FRAME_MS);
}

function stopTimer(): void {
  if (timer === null) {
    return;
  }
  clearInterval(timer);
  timer = null;
}

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const message = event.data;
  if (message.type === 'reset') {
    controller.reset();
    stopTimer();
    return;
  }

  const sessionId = message.sessionId ?? '';
  if (message.type === 'start') {
    controller.start(sessionId);
    ensureTimer();
    return;
  }
  if (message.type === 'enqueue' && message.event) {
    postFrames(sessionId, controller.enqueue(sessionId, message.event));
    return;
  }
  if (message.type === 'flush') {
    postFrames(sessionId, controller.flush(sessionId), true);
  }
};
