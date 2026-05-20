import { floatingChatContent as c } from './FloatingChat.content';
import styles from './PageComponents.module.css';
import { cx } from 'base/classname';
import type { KeyboardEvent, RefObject } from 'react';
import {
  Box,
  Button,
  Inline,
  Input,
  Label,
  Stack,
  Text,
  VisuallyHidden,
} from 'ui/system';

export interface FloatingChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface FloatingChatProps {
  closeLabel?: string;
  fabLabel: string;
  idPrefix?: string;
  input: string;
  inputLabel: string;
  messages: FloatingChatMessage[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onToggle: () => void;
  open: boolean;
  panelTitle: string;
  sendLabel: string;
  statusLabel: string;
}

export function FloatingChat({
  closeLabel = c.closeLabel,
  fabLabel,
  idPrefix = 'page-floating-chat',
  input,
  inputLabel,
  messages,
  messagesEndRef,
  onInputChange,
  onSend,
  onToggle,
  open,
  panelTitle,
  sendLabel,
  statusLabel,
}: FloatingChatProps) {
  const chatPanelId = `${idPrefix}-panel`;
  const chatInputId = `${idPrefix}-input`;
  const canSend = input.trim().length > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && canSend) {
      onSend();
    }
  };

  return (
    <Stack className={styles.floatingChat}>
      {open && (
        <Stack
          id={chatPanelId}
          className={styles.chatPanel}
          role="dialog"
          aria-label={panelTitle}
        >
          <Inline className={styles.chatHeader} justify="space-between">
            <Inline className={styles.chatMeta} gap="u1-4">
              <Box className={styles.chatAvatar}>✦</Box>
              <Stack gap="xs">
                <Text as="span" size="sm" variant="inverse" weight="bold">{panelTitle}</Text>
                <Inline className={styles.chatStatus} gap="u0-7">
                  <Box as="span" className={styles.chatDot} />
                  <Text as="span" size="xs" variant="inverse-muted">{statusLabel}</Text>
                </Inline>
              </Stack>
            </Inline>
            <Button
              type="button"
              onClick={onToggle}
              aria-label={closeLabel}
              size="icon-md"
              variant="icon-inverse"
            >
              ✕
            </Button>
          </Inline>
          <Stack className={styles.chatMessages} gap="u1-3" aria-live="polite">
            {messages.map((message) => (
              <Box
                key={message.id ?? `${message.role}:${message.text}`}
                as="span"
                className={cx(
                  styles.message,
                  message.role === 'user' ? styles.messageUser : styles.messageAssistant,
                )}
              >
                <Text
                  as="span"
                  size="sm"
                  variant={message.role === 'user' ? 'inverse' : 'secondary'}
                >
                  {message.text}
                </Text>
              </Box>
            ))}
            <Box ref={messagesEndRef} />
          </Stack>
          <Inline className={styles.chatInputRow} gap="u0-9" wrap={false}>
            <Label className={styles.srOnly} htmlFor={chatInputId}>
              <VisuallyHidden>
              {inputLabel}
              </VisuallyHidden>
            </Label>
            <Input
              id={chatInputId}
              type="text"
              size="md"
              variant="filled"
              placeholder={inputLabel}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <Button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              size="sm"
              variant="primary"
            >
              {sendLabel}
            </Button>
          </Inline>
        </Stack>
      )}
      <Button
        type="button"
        onClick={onToggle}
        title={fabLabel}
        aria-label={fabLabel}
        aria-expanded={open}
        aria-controls={open ? chatPanelId : undefined}
        size="fab"
        variant="floating"
      >
        {open ? '✕' : '✦'}
      </Button>
    </Stack>
  );
}
