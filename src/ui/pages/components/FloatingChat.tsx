import { floatingChatContent as c } from './FloatingChat.content';
import styles from './PageComponents.module.css';
import { cx } from 'base/classname';
import type { KeyboardEvent, RefObject } from 'react';

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
    <div className={styles.floatingChat}>
      {open && (
        <div
          id={chatPanelId}
          className={styles.chatPanel}
          role="dialog"
          aria-label={panelTitle}
        >
          <div className={styles.chatHeader}>
            <div className={styles.chatMeta}>
              <div className={styles.chatAvatar}>✦</div>
              <div>
                <div className={styles.chatName}>{panelTitle}</div>
                <div className={styles.chatStatus}>
                  <span className={styles.chatDot} />{statusLabel}
                </div>
              </div>
            </div>
            <button
              type="button"
              className={styles.chatClose}
              onClick={onToggle}
              aria-label={closeLabel}
            >
              ✕
            </button>
          </div>
          <div className={styles.chatMessages} aria-live="polite">
            {messages.map((message) => (
              <div
                key={message.id ?? `${message.role}:${message.text}`}
                className={cx(
                  styles.message,
                  message.role === 'user' ? styles.messageUser : styles.messageAssistant,
                )}
              >
                {message.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
          <div className={styles.chatInputRow}>
            <label className={styles.srOnly} htmlFor={chatInputId}>
              {inputLabel}
            </label>
            <input
              id={chatInputId}
              type="text"
              className={styles.chatInput}
              placeholder={inputLabel}
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              className={styles.chatSend}
              onClick={onSend}
              disabled={!canSend}
            >
              {sendLabel}
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        className={styles.chatButton}
        onClick={onToggle}
        title={fabLabel}
        aria-label={fabLabel}
        aria-expanded={open}
        aria-controls={open ? chatPanelId : undefined}
      >
        <span className={styles.chatButtonIcon}>{open ? '✕' : '✦'}</span>
      </button>
    </div>
  );
}
