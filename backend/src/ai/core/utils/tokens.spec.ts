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

  it('matches known provider context windows and falls back conservatively', () => {
    expect(getContextWindow('GPT-5.4-latest')).toBe(400_000);
    expect(getContextWindow('deepseek-reasoner')).toBe(1_000_000);
    expect(getContextWindow('unknown-model')).toBe(200_000);
  });
});
