import { describe, expect, it } from 'vitest';

import {
  LangChainMarkdownTextSplitterAdapter,
  LangChainRecursiveCharacterTextSplitterAdapter,
  LangChainTokenTextSplitterAdapter,
} from '../src/index.ts';

describe('LangChain splitter presets', () => {
  it('uses RecursiveCharacterTextSplitter through the preset adapter', async () => {
    const chunker = new LangChainRecursiveCharacterTextSplitterAdapter({
      chunkSize: 10,
      chunkOverlap: 0,
    });

    const chunks = await chunker.chunk({
      id: 'doc-recursive',
      content: 'abcdefghijklmnopqrstuvwxyz',
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.content).toBe('abcdefghij');
    expect(chunks[2]?.content).toBe('uvwxyz');
  });

  it('constructs a TokenTextSplitter-backed chunker', () => {
    // TokenTextSplitter.splitText 会请求 tiktoken.pages.dev；切分映射已由 LangChainTextSplitterAdapter 覆盖。
    const chunker = new LangChainTokenTextSplitterAdapter({
      encodingName: 'cl100k_base',
      chunkSize: 5,
      chunkOverlap: 0,
    });

    expect(typeof chunker.chunk).toBe('function');
  });

  it('uses MarkdownTextSplitter through the preset adapter', async () => {
    const chunker = new LangChainMarkdownTextSplitterAdapter({
      chunkSize: 30,
      chunkOverlap: 0,
    });

    const chunks = await chunker.chunk({
      id: 'doc-markdown',
      content: '# Title\n\n## Section\n\nMarkdown body content.',
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.metadata).toMatchObject({
      sourceDocumentId: 'doc-markdown',
      chunkIndex: 0,
    });
  });
});
