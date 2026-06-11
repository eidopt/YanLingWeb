'use client';

import styles from './ChatPanel.module.css';
import type { AgentClarificationOption } from '@shared/agent/contracts/agent';
import { type FormEvent, type KeyboardEvent, type ReactNode, type RefObject, useState } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box, Button, Heading, Stack, Text, TextArea } from 'ui/base';

export interface ChatClarification {
  question: string;
  options: AgentClarificationOption[];
  allowCustom?: boolean;
  customLabel?: string;
  customPlaceholder?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  streaming?: boolean;
  clarification?: ChatClarification;
}

export interface ChatPanelProps {
  ariaLabel: string;
  eyebrow: string;
  title: string;
  status: string;
  messages: readonly ChatMessage[];
  inputValue: string;
  inputPlaceholder: string;
  submitLabel: string;
  cancelLabel: string;
  disabled?: boolean;
  isRunning?: boolean;
  badges?: readonly string[];
  streamingLabel: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onClarificationSelect?: (option: AgentClarificationOption, message: ChatMessage) => void;
  onClarificationCustomSubmit?: (value: string, message: ChatMessage) => void;
  messagesEndRef?: RefObject<HTMLDivElement | null>;
  renderAfterMessages?: ReactNode;
  undoButtonLabel?: string;
  onUndo?: () => void;
  undoAvailableCount?: number;
}

const markdownComponents: Components = {
  a({ children, href, ...props }) {
    return (
      <a {...props} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  code({ children, className, ...props }) {
    const codeClassName = className ? `${className} ${styles.blockCode}` : styles.inlineCode;

    return (
      <code {...props} className={codeClassName}>
        {children}
      </code>
    );
  },
  pre({ children, ...props }) {
    return (
      <pre {...props} className={styles.codeBlock}>
        {children}
      </pre>
    );
  },
};

function MarkdownMessage({ text }: { text: string }) {
  return (
    <Box className={styles.markdown}>
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {text}
      </ReactMarkdown>
    </Box>
  );
}

function StreamingPending({ label }: { label: string }) {
  return (
    <Box as="span" className={styles.waiting}>
      <Text as="span" size="sm" variant="muted">
        {label}
      </Text>
      <Box as="span" className={styles.waitingDots} aria-hidden="true">
        <Box as="span" />
        <Box as="span" />
        <Box as="span" />
      </Box>
    </Box>
  );
}

function messageClassName(message: ChatMessage): string {
  if (message.role === 'user') {
    return styles.userMessage;
  }
  if (message.role === 'system') {
    return styles.systemMessage;
  }
  return message.streaming ? `${styles.assistantMessage} ${styles.streamingMessage}` : styles.assistantMessage;
}

export function ChatPanel({
  ariaLabel,
  eyebrow,
  title,
  status,
  messages,
  inputValue,
  inputPlaceholder,
  submitLabel,
  cancelLabel,
  disabled = false,
  isRunning = false,
  badges = [],
  streamingLabel,
  onInputChange,
  onSubmit,
  onCancel,
  onClarificationSelect,
  onClarificationCustomSubmit,
  messagesEndRef,
  renderAfterMessages,
  undoButtonLabel,
  onUndo,
  undoAvailableCount,
}: ChatPanelProps) {
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  function updateCustomValue(messageId: string, value: string) {
    setCustomValues((current) => ({ ...current, [messageId]: value }));
  }

  function submitCustomValue(message: ChatMessage) {
    const value = (customValues[message.id] || '').trim();
    if (!value) {
      return;
    }
    onClarificationCustomSubmit?.(value, message);
    setCustomValues((current) => ({ ...current, [message.id]: '' }));
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (disabled || isRunning || !inputValue.trim()) {
      return;
    }
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <Box as="section" className={styles.panel} aria-label={ariaLabel}>
      <Box className={styles.header}>
        <Stack gap="xs">
          <Text as="span" size="xs" transform="uppercase" variant="muted" weight="bold">
            {eyebrow}
          </Text>
          <Heading as="h3" size="xs" variant="primary" weight="bold">
            {title}
          </Heading>
        </Stack>
        <Text as="span" size="xs" variant="muted" weight="bold">
          {status}
        </Text>
      </Box>

      {badges.length > 0 ? (
        <Box className={styles.badges}>
          {badges.map((badge) => (
            <Box key={badge} as="span">
              {badge}
            </Box>
          ))}
        </Box>
      ) : null}

      <Box className={styles.messages} aria-live="polite">
        {messages.map((message) => (
          <Box key={message.id} className={messageClassName(message)}>
            {message.text ? (
              message.role === 'user' ? (
                message.text
              ) : (
                <MarkdownMessage text={message.text} />
              )
            ) : message.role === 'assistant' ? (
              <StreamingPending label={streamingLabel} />
            ) : (
              ''
            )}

            {message.clarification ? (
              <>
                <Box className={styles.optionList}>
                  {message.clarification.options.map((option) => (
                    <Button
                      key={option.id}
                      type="button"
                      disabled={disabled || isRunning}
                      onClick={() => onClarificationSelect?.(option, message)}
                      size="sm"
                      variant="secondary"
                    >
                      <span className={styles.optionContent}>
                        <span className={styles.optionLabel}>{option.label}</span>
                        {option.description ? (
                          <span className={styles.optionDescription}>{option.description}</span>
                        ) : null}
                      </span>
                    </Button>
                  ))}
                </Box>
                {message.clarification.allowCustom ? (
                  <Box className={styles.customChoice}>
                    <TextArea
                      className={styles.inputArea}
                      aria-label={message.clarification.customLabel ?? '其他补充说明'}
                      value={customValues[message.id] ?? ''}
                      onChange={(event) => updateCustomValue(message.id, event.target.value)}
                      placeholder={message.clarification.customPlaceholder ?? '输入其他目标或更具体的修改范围'}
                      disabled={disabled || isRunning}
                      rows={2}
                      size="sm"
                      variant="filled"
                    />
                    <Box className={styles.customChoiceActions}>
                      <Button
                        type="button"
                        disabled={disabled || isRunning || !(customValues[message.id] ?? '').trim()}
                        onClick={() => submitCustomValue(message)}
                        size="sm"
                        variant="secondary"
                      >
                        {message.clarification.customLabel ?? '其他'}
                      </Button>
                    </Box>
                  </Box>
                ) : null}
              </>
            ) : null}

            {message.streaming && message.role === 'assistant' ? (
              <Box as="span" className={styles.streamingCursor} aria-hidden="true" />
            ) : null}
          </Box>
        ))}
        <Box ref={messagesEndRef} />
      </Box>

      {renderAfterMessages}

      <Box as="form" className={styles.form} onSubmit={onSubmit}>
        <TextArea
          className={styles.inputArea}
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={inputPlaceholder}
          disabled={disabled || isRunning}
          size="sm"
          variant="filled"
        />
        <Box className={styles.actions}>
          {onUndo ? (
            <Box className={styles.undoButton}>
              <Button
                type="button"
                onClick={onUndo}
                disabled={disabled || isRunning || !undoAvailableCount}
                title="撤销 (Ctrl+Z)"
                size="sm"
                variant="secondary"
              >
                {undoButtonLabel ?? '撤销'}
                {undoAvailableCount !== undefined && undoAvailableCount > 0 ? ` (${undoAvailableCount})` : ''}
              </Button>
            </Box>
          ) : null}
          {isRunning ? (
            <Button type="button" onClick={onCancel} size="sm" variant="secondary">
              {cancelLabel}
            </Button>
          ) : null}
          <Button type="submit" disabled={disabled || isRunning || !inputValue.trim()} size="sm" variant="primary">
            {submitLabel}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
