import { describe, expect, it } from 'vitest';

import { LangChainLanguageTextSplitterAdapter } from '../src/index.ts';

const sampleScript = `function greet(name) {
  return 'hello ' + name;
}

function farewell(name) {
  return 'bye ' + name;
}`;

describe('LangChainLanguageTextSplitterAdapter', () => {
  it('keeps javascript functions on separate chunk boundaries when possible', async () => {
    const chunker = new LangChainLanguageTextSplitterAdapter({
      language: 'js',
      chunkSize: 80,
      chunkOverlap: 0,
    });

    const chunks = await chunker.chunk({
      id: 'code-doc',
      content: sampleScript,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(
      chunks.every(
        (chunk) =>
          !chunk.content.includes('function greet') ||
          chunk.content.includes('function farewell') === false,
      ),
    ).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes('function greet'))).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes('function farewell'))).toBe(true);
  });
});
