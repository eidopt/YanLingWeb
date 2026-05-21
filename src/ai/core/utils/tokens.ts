import type { ProviderMessage } from '../providers/types';

const BYTES_PER_TOKEN = 4;
const IMAGE_MAX_TOKEN_SIZE = 2000;

export function roughTokenCount(content: string): number {
  return Math.round(content.length / BYTES_PER_TOKEN);
}

export function estimateMessageTokens(message: ProviderMessage): number {
  let tokens = 0;

  if (typeof message.content === 'string') {
    tokens += roughTokenCount(message.content);
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if ('text' in part && typeof part.text === 'string') {
        tokens += roughTokenCount(part.text);
      } else if ('type' in part && part.type === 'image_url') {
        tokens += IMAGE_MAX_TOKEN_SIZE;
      } else {
        tokens += roughTokenCount(JSON.stringify(part));
      }
    }
  }

  if (message.toolArguments) {
    tokens += roughTokenCount(message.toolArguments);
  }

  return tokens;
}

export function tokenCountWithEstimation(messages: readonly ProviderMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  return Math.ceil(total * (4 / 3));
}

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-haiku-4-5': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-opus-4-5': 200_000,
  'gpt-5': 400_000,
  'gpt-5.4': 400_000,
  'deepseek-v4-flash': 1_000_000,
  'deepseek-v4-pro': 1_000_000,
  'deepseek-chat': 1_000_000,
  'deepseek-reasoner': 1_000_000,
  'kimi-k2': 128_000,
  'glm-4.6': 128_000,
};

export function getContextWindow(model: string): number {
  const lower = model.toLowerCase();
  for (const [key, size] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (lower.startsWith(key)) {
      return size;
    }
  }
  return 200_000;
}
