import type { AIProvider } from './core/providers/types';

export const AI_TEMPLATE_PIPELINE_PROVIDER = 'AI_TEMPLATE_PIPELINE_PROVIDER';

export interface PipelineTokenUsageInput {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

export interface AiTemplatePipelineProvider {
  getProviderForTemplatePipeline(): {
    provider: AIProvider;
    /** 质量关键 stage（SchemaGen）用的 pro 模型。 */
    model: string;
    /** 辅助 stage（Designer/Critic/Verifier）用的快模型；未配 lite 时回退 pro。 */
    liteModel: string;
    apiKeyConfigured: boolean;
  };
  recordTemplatePipelineTokenUsage?(
    ownerUserId: string,
    model: string,
    usage: PipelineTokenUsageInput,
  ): Promise<number | void | undefined>;
}
