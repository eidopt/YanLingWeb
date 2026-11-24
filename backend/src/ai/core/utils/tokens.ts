import type { ProviderMessage } from '../providers/types';

const IMAGE_MAX_TOKEN_SIZE = 2000;
const DEFAULT_CONTEXT_WINDOW = 128_000;

export function roughTokenCount(content: string): number {
  if (!content) {
    return 0;
  }
  let ascii = 0;
  let cjk = 0;
  let other = 0;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    if (code <= 0x7f) {
      ascii += 1;
    } else if (code >= 0x4e00 && code <= 0x9fff) {
      cjk += 1;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      other += 1;
      index += 1;
    } else {
      other += 1;
    }
  }
  return Math.round(ascii * 0.25 + cjk * 1.8 + other);
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
 *   2. A safe 128K default. Set AI_CONTEXT_WINDOW for models with a larger window.
 */
export function getContextWindow(_model: string, override?: number): number {
  if (override && Number.isFinite(override) && override > 0) {
    return override;
  }
  return DEFAULT_CONTEXT_WINDOW;
}
