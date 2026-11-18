/**
 * MessagePurifier — purifies ProviderMessage[] before sending to a specific provider.
 *
 * Each provider has different capabilities (reasoningMode, supportsDeveloperRole).
 * This module strips or adjusts fields that the target provider cannot handle,
 * preventing cross-model pollution errors (e.g. GPT rejecting reasoning_content).
 */
import type { ProviderCapabilities, ProviderMessage } from '@shared/agent/contracts/provider';

/**
 * Purify messages for the target provider's capabilities.
 * Returns a new array; does not mutate the input.
 */
export function purifyMessages(
  messages: readonly ProviderMessage[],
  targetCaps: ProviderCapabilities,
): ProviderMessage[] {
  return messages.map((msg) => purifyOneMessage(msg, targetCaps));
}

function purifyOneMessage(msg: ProviderMessage, targetCaps: ProviderCapabilities): ProviderMessage {
  // Only assistant and tool_call messages can carry reasoningContent
  const hasReasoning =
    (msg.role === 'assistant' || msg.role === 'tool_call') &&
    typeof msg.reasoningContent === 'string' &&
    msg.reasoningContent.length > 0;

  const needsDeveloperHandling = msg.role === 'developer' && !targetCaps.supportsDeveloperRole;

  // For required mode, assistant and tool_call messages without reasoningContent need filling
  const needsRequiredFill =
    (msg.role === 'assistant' || msg.role === 'tool_call') &&
    targetCaps.reasoningMode === 'required' &&
    !hasReasoning;

  // cache_control is only meaningful for providers whose cacheStrategy is
  // 'cache_control' (Qwen). For any other target, drop the marker so the
  // vendor-specific field is not forwarded to providers that don't understand
  // it. Belt-and-suspenders: convertMessages also gates this.
  const needsCacheControlStrip =
    msg.cacheControl !== undefined && targetCaps.cacheStrategy !== 'cache_control';

  // Fast path: nothing to purify
  if (!hasReasoning && !needsDeveloperHandling && !needsRequiredFill && !needsCacheControlStrip) {
    return msg;
  }

  // Shallow copy — only mutate fields that need changing
  const clean = { ...msg };

  // 1. reasoning_content handling
  if (hasReasoning) {
    switch (targetCaps.reasoningMode) {
      case 'none':
        // GPT/GLM: delete reasoning_content — target doesn't recognize it
        delete clean.reasoningContent;
        break;
      case 'required':
        // MiMo: keep as-is (must be present)
        break;
      case 'passthrough':
        // DeepSeek/Kimi/Qwen/MiniMax: keep if present
        break;
    }
  }

  // For required mode: ensure reasoningContent exists on assistant messages
  // even if the original didn't have it (MiMo will 400 otherwise)
  if (needsRequiredFill) {
    clean.reasoningContent = '';
  }

  // 2. developer role handling
  if (needsDeveloperHandling) {
    clean.role = 'system';
    // Prepend a marker so the LLM can distinguish developer-level instructions
    // from system-level instructions after the role is downgraded.
    const content = typeof clean.content === 'string' ? clean.content : '';
    clean.content = `[Developer Instructions]\n${content}`;
  }

  // 3. cache_control stripping (defense in depth: convertMessages also gates)
  if (needsCacheControlStrip) {
    delete clean.cacheControl;
  }

  return clean;
}
