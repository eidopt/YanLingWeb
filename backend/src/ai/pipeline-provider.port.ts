import type { AIProvider } from './core/providers/types';

export const AI_TEMPLATE_PIPELINE_PROVIDER = 'AI_TEMPLATE_PIPELINE_PROVIDER';

export interface AiTemplatePipelineProvider {
  getProviderForTemplatePipeline(): {
    provider: AIProvider;
    model: string;
    apiKeyConfigured: boolean;
  };
}
