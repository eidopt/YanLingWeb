import {
  SSE_OUTPUT_FRAME_MS,
  SseOutputController,
  type SseOutputFrame,
  type SseQueuedEvent,
} from './sseOutputController';

export interface SseOutputBridge {
  start: (sessionId: string) => void;
  enqueue: (sessionId: string, event: SseQueuedEvent) => void;
  flush: (sessionId: string) => Promise<void>;
  reset: () => void;
  dispose: () => void;
}

interface WorkerOutbound {
  type: 'frames' | 'drained';
  sessionId: string;
  frames?: SseOutputFrame[];
}

interface CreateSseOutputBridgeOptions {
  onFrames: (sessionId: string, frames: readonly SseOutputFrame[]) => void;
  createWorker?: () => Worker | null;
}

function createDefaultWorker(): Worker | null {
  if (typeof Worker === 'undefined') {
    return null;
  }
  try {
    return new Worker(new URL('./sseOutput.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

export function createSseOutputBridge(options: CreateSseOutputBridgeOptions): SseOutputBridge {
  const worker = (options.createWorker ?? createDefaultWorker)();
  if (worker) {
    return createWorkerBridge(worker, options.onFrames);
  }
  return createFallbackBridge(options.onFrames);
}

function createWorkerBridge(worker: Worker, onFrames: CreateSseOutputBridgeOptions['onFrames']): SseOutputBridge {
  const pendingFlush = new Map<string, () => void>();
  worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
    const message = event.data;
    if (message.type === 'frames' && message.frames?.length) {
      onFrames(message.sessionId, message.frames);
      return;
    }
    if (message.type === 'drained') {
      pendingFlush.get(message.sessionId)?.();
      pendingFlush.delete(message.sessionId);
    }
  };

  return {
    start: (sessionId) => {
      worker.postMessage({ type: 'start', sessionId });
    },
    enqueue: (sessionId, event) => {
      worker.postMessage({ type: 'enqueue', sessionId, event });
    },
    flush: (sessionId) =>
      new Promise((resolve) => {
        pendingFlush.set(sessionId, resolve);
        worker.postMessage({ type: 'flush', sessionId });
      }),
    reset: () => {
      for (const resolve of pendingFlush.values()) {
        resolve();
      }
      pendingFlush.clear();
      worker.postMessage({ type: 'reset' });
    },
    dispose: () => {
      for (const resolve of pendingFlush.values()) {
        resolve();
      }
      pendingFlush.clear();
      worker.terminate();
    },
  };
}

function createFallbackBridge(onFrames: CreateSseOutputBridgeOptions['onFrames']): SseOutputBridge {
  const controller = new SseOutputController();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stopTimer = () => {
    if (timer === null) {
      return;
    }
    clearInterval(timer);
    timer = null;
  };

  const ensureTimer = () => {
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
        onFrames(sessionId, frames);
      }
    }, SSE_OUTPUT_FRAME_MS);
  };

  return {
    start: (sessionId) => {
      controller.start(sessionId);
      ensureTimer();
    },
    enqueue: (sessionId, event) => {
      const frames = controller.enqueue(sessionId, event);
      if (frames.length > 0) {
        onFrames(sessionId, frames);
      }
    },
    flush: (sessionId) => {
      const frames = controller.flush(sessionId);
      if (frames.length > 0) {
        onFrames(sessionId, frames);
      }
      stopTimer();
      return Promise.resolve();
    },
    reset: () => {
      controller.reset();
      stopTimer();
    },
    dispose: () => {
      controller.reset();
      stopTimer();
    },
  };
}
