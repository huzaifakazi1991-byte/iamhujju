import { describe, expect, it } from 'vitest';
import { classifyProviderError } from '@/lib/gateway/health';

describe('classifyProviderError', () => {
  it('flags auth failures', () => {
    expect(classifyProviderError('API key not valid. Please pass a valid API key.')).toBe('auth');
    expect(classifyProviderError('401 Unauthorized: invalid api key')).toBe('auth');
    expect(classifyProviderError('Permission denied: the caller does not have permission')).toBe('auth');
  });

  it('flags model-level unavailability so the key is not marked failing', () => {
    expect(classifyProviderError('This model models/gemini-2.5-flash-lite is no longer available to new users.')).toBe('model');
    expect(classifyProviderError('404 The model `gpt-4-32k` does not exist')).toBe('model');
    expect(classifyProviderError('model_not_found: the model is not supported')).toBe('model');
  });

  it('treats network and unknown errors as provider failures', () => {
    expect(classifyProviderError('fetch failed')).toBe('provider');
    expect(classifyProviderError('')).toBe('provider');
  });
});
