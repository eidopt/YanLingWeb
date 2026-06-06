import type { ProviderMessage } from '../providers/types';
import {
  estimateMessageTokens,
  getContextWindow,
  roughTokenCount,
  tokenCountWithEstimation,
} from './tokens';

describe('token estimation helpers', () => {
  it('estimates text, image, and tool argument tokens consistently', () => {
    const message: ProviderMessage = {
      role: 'user',
      content: [
        { type: 'text', text: '12345678' },
        { type: 'image_url', image_url: { url: 'https://example.test/image.png' } },
      ],
      toolArguments: '{"name":"Landing"}',
    };

    expect(roughTokenCount('12345678')).toBe(2);
    expect(estimateMessageTokens(message)).toBe(2007);
    expect(tokenCountWithEstimation([message])).toBe(2676);
  });

  it('uses known model windows and a conservative unknown fallback', () => {
    expect(getContextWindow('GPT-5.2-latest')).toBe(400_000);
    expect(getContextWindow('deepseek-reasoner')).toBe(1_000_000);
    expect(getContextWindow('unknown-model')).toBe(200_000);
  });

  it('respects contextWindow override from config', () => {
    expect(getContextWindow('any-model', 200_000)).toBe(200_000);
    expect(getContextWindow('any-model', 0)).toBe(200_000); // ignored (not > 0)
    expect(getContextWindow('any-model', undefined)).toBe(200_000);
  });
});
