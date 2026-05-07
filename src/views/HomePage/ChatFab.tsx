'use client';

import { homePageContent as c } from './HomePage.content';
import type { RefObject } from 'react';
import { FloatingChat } from 'ui/pages';

interface Message {
  id?: string;
  role: 'user' | 'ai';
  text: string;
}

interface ChatFabProps {
  open: boolean;
  messages: Message[];
  input: string;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onToggle: () => void;
  onInputChange: (value: string) => void;
  onSend: () => void;
}

export function ChatFab({
  open,
  messages,
  input,
  messagesEndRef,
  onToggle,
  onInputChange,
  onSend,
}: ChatFabProps) {
  return (
    <FloatingChat
      closeLabel="关闭 AI 助手"
      fabLabel={c.chat.fabTitle}
      idPrefix="home-ai-chat"
      input={input}
      inputLabel={c.chat.placeholder}
      messages={messages.map((message) => ({
        id: message.id,
        role: message.role === 'ai' ? 'assistant' : 'user',
        text: message.text,
      }))}
      messagesEndRef={messagesEndRef}
      onInputChange={onInputChange}
      onSend={onSend}
      onToggle={onToggle}
      open={open}
      panelTitle={c.chat.panelTitle}
      sendLabel={c.chat.sendBtn}
      statusLabel={c.chat.onlineLabel}
    />
  );
}
