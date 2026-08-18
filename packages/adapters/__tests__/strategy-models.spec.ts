import { describe, expect, it } from 'vitest';

import { OpenAIStrategyModel } from '../src/openai/models/openai-strategy-model.ts';
import { OllamaStrategyModel } from '../src/ollama/models/ollama-strategy-model.ts';

describe('strategy model adapters', () => {
  it('requires OpenAI credentials and baseUrl', () => {
    expect(
      () =>
        new OpenAIStrategyModel({
          model: 'gpt-test',
          baseUrl: '',
          apiKey: 'test-key',
        }),
    ).toThrow('OpenAIStrategyModel requires baseUrl');
  });

  it('calls OpenAI-compatible chat for complete()', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: ' rewritten query ' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const model = new OpenAIStrategyModel({
      model: 'gpt-test',
      baseUrl: 'https://example.test/v1',
      apiKey: 'test-key',
      fetch: fetchImpl,
    });

    await expect(
      model.complete(
        { prompt: 'rewrite this', system: 'you rewrite queries' },
        {
          requestId: 'req-1',
          input: { query: 'rewrite this' },
          options: {},
          startedAt: Date.now(),
        },
      ),
    ).resolves.toBe('rewritten query');
  });

  it('calls Ollama chat for complete()', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          message: { content: ' expanded query ' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );

    const model = new OllamaStrategyModel({
      model: 'llama-test',
      baseUrl: 'http://localhost:11434',
      fetch: fetchImpl,
    });

    await expect(
      model.complete(
        { prompt: 'expand this' },
        {
          requestId: 'req-1',
          input: { query: 'expand this' },
          options: {},
          startedAt: Date.now(),
        },
      ),
    ).resolves.toBe('expanded query');
  });
});
