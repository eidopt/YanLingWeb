import { Injectable, Logger } from '@nestjs/common';

import type { AIProvider, ProviderMessage, ProviderRequest } from '../core/providers/types';
import { tokenCountWithEstimation } from '../core/utils/tokens';
import { AiConfigDto } from '../ai.service';

const MAX_PROVIDER_LOG_TOKENS = 500_000;
const PROVIDER_LOG_FOLD_TAIL_TOKENS = 180_000;
const PROVIDER_LOG_FOLD_MARKER = [
  '[Editor provider history summary - earlier provider messages folded',
  'for cache and context efficiency]',
].join(' ');

function normalizeProviderMessages(messages: unknown): ProviderMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.flatMap((message): ProviderMessage[] => {
    if (!message || typeof message !== 'object') {
      return [];
    }
    const value = message as Record<string, unknown>;
    const role = value.role;
    if (
      role !== 'user'
      && role !== 'assistant'
      && role !== 'tool_call'
      && role !== 'tool_result'
    ) {
      return [];
    }
    const content = typeof value.content === 'string' ? value.content : '';
    const normalized: ProviderMessage = { role, content };
    if (typeof value.toolCallId === 'string') {
      normalized.toolCallId = value.toolCallId;
    }
    if (typeof value.toolName === 'string') {
      normalized.toolName = value.toolName;
    }
    if (typeof value.toolArguments === 'string') {
      normalized.toolArguments = value.toolArguments;
    }
    if (typeof value.reasoningContent === 'string') {
      normalized.reasoningContent = value.reasoningContent;
    }
    return [normalized];
  });
}

function providerMessageTokenEstimate(message: ProviderMessage): number {
  return tokenCountWithEstimation([message]);
}

function providerLogFoldBoundary(
  messages: readonly ProviderMessage[],
  tailTokens = PROVIDER_LOG_FOLD_TAIL_TOKENS,
): number {
  let tokens = 0;
  let boundary = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    const nextTokens = tokens + providerMessageTokenEstimate(message);
    if (nextTokens > tailTokens && boundary >= 0) {
      break;
    }
    tokens = nextTokens;
    if (message.role === 'user') {
      boundary = index;
    }
  }
  return boundary;
}

function serializeProviderMessageForSummary(message: ProviderMessage, index: number): string {
  const lines = [
    `Message ${index + 1}`,
    `role: ${message.role}`,
  ];
  if (message.toolName) {
    lines.push(`toolName: ${message.toolName}`);
  }
  if (message.toolCallId) {
    lines.push(`toolCallId: ${message.toolCallId}`);
  }
  if (message.toolArguments) {
    lines.push(`toolArguments: ${message.toolArguments}`);
  }
  const content = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content);
  lines.push('content:', content);
  return lines.join('\n');
}

@Injectable()
export class ProviderLogCompactionService {
  private readonly logger = new Logger(ProviderLogCompactionService.name);
  private apiKeyConfigured = false;
  private aiConfig!: AiConfigDto;
  private provider!: AIProvider;

  configure(aiConfig: AiConfigDto, provider: AIProvider, apiKeyConfigured: boolean): void {
    this.aiConfig = aiConfig;
    this.provider = provider;
    this.apiKeyConfigured = apiKeyConfigured;
  }

  async foldEditorProviderMessagesByTokenBudget(
    messages: readonly ProviderMessage[],
    maxTokens = MAX_PROVIDER_LOG_TOKENS,
  ): Promise<ProviderMessage[]> {
    const normalized = normalizeProviderMessages(messages);
    const tokens = tokenCountWithEstimation(normalized);
    if (tokens <= maxTokens) {
      return normalized;
    }

    const boundary = providerLogFoldBoundary(normalized);
    if (boundary <= 0) {
      this.logger.warn(
        [
          `[ProviderLog] log is over budget (~${tokens} tokens) but no safe`,
          'user-turn fold boundary was found; keeping full log.',
        ].join(' '),
      );
      return normalized;
    }

    const head = normalized.slice(0, boundary);
    const tail = normalized.slice(boundary);
    const summary = await this.summarizeProviderLog(head);
    if (!summary?.content) {
      this.logger.warn(
        [
          `[ProviderLog] summary fold failed for over-budget log (~${tokens}`,
          'tokens); keeping full log.',
        ].join(' '),
      );
      return normalized;
    }

    const folded: ProviderMessage[] = [
      {
        role: 'assistant',
        content: [
          PROVIDER_LOG_FOLD_MARKER,
          '',
          summary.content,
        ].join('\n'),
        ...(summary.reasoningContent ? { reasoningContent: summary.reasoningContent } : {}),
      },
      ...tail,
    ];
    this.logger.log(
      `[ProviderLog] folded provider log messages ${normalized.length}->${folded.length} `
      + `tokens ~${tokens}->~${tokenCountWithEstimation(folded)}`,
    );
    return folded;
  }

  private async summarizeProviderLog(
    messages: readonly ProviderMessage[],
  ): Promise<{ content: string; reasoningContent?: string } | null> {
    if (!this.apiKeyConfigured || messages.length === 0) {
      return null;
    }

    const serialized = messages
      .map((message, index) => serializeProviderMessageForSummary(message, index))
      .join('\n\n---\n\n');
    const summaryModel = this.aiConfig.models.lite ?? this.aiConfig.models.pro;
    const request: ProviderRequest = {
      model: summaryModel,
      messages: [
        {
          role: 'system',
          content: [
            'You compact provider conversation history for an editor AI agent.',
            'Return a concise but self-contained prose summary.',
            [
              'Preserve user goals, clarification decisions, target pages/nodes,',
              'tool calls, edit results, unresolved issues, and constraints needed',
              'for future turns.',
            ].join(' '),
            'Do not invent facts. Do not include markdown headings. Do not call tools.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            [
              'Summarize the provider messages below. This summary will replace',
              'them in the next request history.',
            ].join(' '),
            '',
            serialized,
          ].join('\n'),
        },
      ],
    };

    let content = '';
    let reasoningContent = '';
    try {
      for await (const event of this.provider.stream(request)) {
        if (event.type === 'text_delta') {
          content += event.text;
        } else if (event.type === 'done' && event.reasoningContent) {
          reasoningContent = event.reasoningContent;
        } else if (event.type === 'error') {
          this.logger.warn(`[ProviderLog] summary fold provider error: ${event.message}`);
          return null;
        }
      }
    } catch (err) {
      this.logger.warn(
        '[ProviderLog] summary fold failed',
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }

    const trimmed = content.trim();
    return trimmed ? { content: trimmed, reasoningContent } : null;
  }
}
