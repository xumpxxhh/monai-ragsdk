import { describe, expect, it } from 'vitest';

import { LangChainSentenceTextSplitterAdapter } from '../src/index.ts';

describe('LangChainSentenceTextSplitterAdapter', () => {
  it('creates multiple chunks from multi-sentence content', async () => {
    const chunker = new LangChainSentenceTextSplitterAdapter({
      chunkSize: 60,
      chunkOverlap: 0,
    });

    const content =
      'First sentence stays intact. Second sentence stays intact too. Third sentence wraps the chunk set.';

    const chunks = await chunker.chunk({
      id: 'faq-doc',
      content,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.trim().length > 0)).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes('Second sentence'))).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes('Third sentence'))).toBe(true);
  });
});
