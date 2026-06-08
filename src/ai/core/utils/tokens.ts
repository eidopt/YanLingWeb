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

/**
 * Get the context window size for a model.
 * Resolution order:
 *   1. `override` parameter (from ConfigFactory -> config.ai.contextWindow)
 *   2. Default 1M context for all configured models
 */
export function getContextWindow(_model: string, override?: number): number {
  if (override && Number.isFinite(override) && override > 0) {
    return override;
  }
  return 1_000_000;
}
