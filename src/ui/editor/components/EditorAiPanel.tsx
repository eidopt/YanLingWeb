'use client';

import type {
  ThemeComponentDescriptor,
  ThemeLayoutDocument,
  ThemeLayoutNode,
} from '../../layout/types';
import type {
  ApplyEditorAiEditInstructionsResult,
  EditorAiEditInstruction,
} from '../services/aiEditInstructions';
import styles from '../ThemeLayoutBuilder.module.css';
import type { UiIntentPlan } from 'ai/planning/ui-intent-router';
import { useAppServices } from 'hooks/useAppServices';
import {
  type FormEvent,
  useRef,
  useState,
} from 'react';

interface EditorAiPanelProps {
  currentDocument: ThemeLayoutDocument;
  selectedNode: ThemeLayoutNode | null;
  selectedDescriptor: ThemeComponentDescriptor | null;
  disabled?: boolean;
  onApplyInstructions: (
    instructions: readonly EditorAiEditInstruction[],
  ) => ApplyEditorAiEditInstructionsResult;
}

interface EditorAiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
}

interface EditAppliedEventPayload {
  applied?: string[];
  errors?: string[];
  reason?: string;
}

const INITIAL_MESSAGES: EditorAiMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: '告诉我想怎么调整当前画布，我会尽量用局部编辑完成。',
  },
];

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function parseIntentPlan(data: string): UiIntentPlan | null {
  try {
    return JSON.parse(data) as UiIntentPlan;
  } catch {
    return null;
  }
}

function parseEditAppliedPayload(data: string): EditAppliedEventPayload {
  try {
    return JSON.parse(data) as EditAppliedEventPayload;
  } catch {
    return {};
  }
}

function describeAppliedEdits(payload: EditAppliedEventPayload) {
  const applied = payload.applied ?? [];
  const errors = payload.errors ?? [];

  if (!applied.length && !errors.length) {
    return '没有产生可执行的画布编辑。';
  }

  const appliedText = applied.length
    ? `已执行：${applied.join('、')}`
    : '';
  const errorText = errors.length
    ? `未完成：${errors.join('；')}`
    : '';

  return [payload.reason, appliedText, errorText].filter(Boolean).join('\n');
}

export function EditorAiPanel({
  currentDocument,
  selectedNode,
  selectedDescriptor,
  disabled = false,
  onApplyInstructions,
}: EditorAiPanelProps) {
  const { editorAiService } = useAppServices();
  const abortRef = useRef<AbortController | null>(null);
  const [messages, setMessages] = useState<EditorAiMessage[]>(INITIAL_MESSAGES);
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('就绪');
  const [isRunning, setIsRunning] = useState(false);
  const [intentPlan, setIntentPlan] = useState<UiIntentPlan | null>(null);

  function appendMessage(message: EditorAiMessage) {
    setMessages((current) => [...current, message].slice(-8));
  }

  function appendAssistantDelta(messageId: string, text: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, text: `${message.text}${text}` }
          : message,
      ),
    );
  }

  async function runAssistant(trimmedPrompt: string) {
    const assistantMessageId = createMessageId('assistant');
    const abortController = new AbortController();
    abortRef.current = abortController;
    setIsRunning(true);
    setStatus('正在分析');
    setIntentPlan(null);
    setPrompt('');
    appendMessage({
      id: createMessageId('user'),
      role: 'user',
      text: trimmedPrompt,
    });
    appendMessage({
      id: assistantMessageId,
      role: 'assistant',
      text: '',
    });

    try {
      await editorAiService.editCanvas({
        prompt: trimmedPrompt,
        document: currentDocument,
        selectedNode,
        selectedDescriptor,
        applyInstructions: onApplyInstructions,
        signal: abortController.signal,
        onEvent: (event) => {
          switch (event.type) {
            case 'intent_plan': {
              setIntentPlan(parseIntentPlan(event.data));
              setStatus('已识别需求');
              break;
            }
            case 'text':
              appendAssistantDelta(assistantMessageId, event.data);
              break;
            case 'tool_start':
              setStatus('正在编辑画布');
              break;
            case 'edit_applied':
              appendMessage({
                id: createMessageId('system'),
                role: 'system',
                text: describeAppliedEdits(
                  parseEditAppliedPayload(event.data),
                ),
              });
              break;
            case 'tool_done':
              setStatus('编辑已应用');
              break;
            case 'error':
              setStatus('执行失败');
              appendMessage({
                id: createMessageId('system'),
                role: 'system',
                text: event.data,
              });
              break;
            case 'done':
              setStatus('就绪');
              break;
          }
        },
      });
    } finally {
      if (abortRef.current === abortController) {
        abortRef.current = null;
      }
      setIsRunning(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isRunning || disabled) {
      return;
    }

    void runAssistant(trimmedPrompt);
  }

  function handleCancel() {
    abortRef.current?.abort();
    editorAiService.cancel();
    setIsRunning(false);
    setStatus('已停止');
  }

  const capabilityBadges = intentPlan
    ? [
        intentPlan.primaryCategory,
        intentPlan.generationStrategy,
        ...intentPlan.missingCapabilities.map((capability) => capability.id),
      ].slice(0, 3)
    : [];

  return (
    <section className={styles.editorAiPanel} aria-label="AI 编辑助手">
      <div className={styles.editorAiHeader}>
        <div>
          <span className={styles.sidebarEyebrow}>AI Edit</span>
          <h3>画布助手</h3>
        </div>
        <span className={styles.editorAiStatus}>{status}</span>
      </div>

      {capabilityBadges.length > 0 ? (
        <div className={styles.editorAiBadges}>
          {capabilityBadges.map((badge) => (
            <span key={badge}>{badge}</span>
          ))}
        </div>
      ) : null}

      <div className={styles.editorAiMessages} aria-live="polite">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user'
                ? styles.editorAiUserMessage
                : message.role === 'system'
                  ? styles.editorAiSystemMessage
                  : styles.editorAiAssistantMessage
            }
          >
            {message.text || (message.role === 'assistant' ? '...' : '')}
          </div>
        ))}
      </div>

      <form className={styles.editorAiForm} onSubmit={handleSubmit}>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="例如：把选中的卡片改成预约入口，并在下面加一个按钮"
          disabled={disabled || isRunning}
        />
        <div className={styles.editorAiActions}>
          {isRunning ? (
            <button
              type="button"
              className={styles.ghostButton}
              onClick={handleCancel}
            >
              停止
            </button>
          ) : null}
          <button
            type="submit"
            className={styles.button}
            disabled={disabled || isRunning || !prompt.trim()}
          >
            执行
          </button>
        </div>
      </form>
    </section>
  );
}
