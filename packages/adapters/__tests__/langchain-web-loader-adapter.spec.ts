import { Document as LangChainDocument } from '@langchain/core/documents';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@langchain/community/document_loaders/web/html', () => ({
  HTMLWebBaseLoader: class HTMLWebBaseLoader {
    webPath: string;

    constructor(webPath: string) {
      this.webPath = webPath;
    }

    async load() {
      return [
        new LangChainDocument({
          pageContent: `content:${this.webPath}`,
          metadata: { source: this.webPath },
        }),
      ];
    }
  },
}));

import { LangChainWebLoaderAdapter } from '../src/langchain/loaders/langchain-web-loader-adapter.js';

describe('LangChainWebLoaderAdapter', () => {
  it('loads documents from each configured url', async () => {
    const adapter = new LangChainWebLoaderAdapter({
      urls: ['https://example.com/a', 'https://example.com/b'],
      idPrefix: 'web',
    });

    const documents = await adapter.load();

    expect(documents).toEqual([
      {
        id: 'web-0',
        content: 'content:https://example.com/a',
        metadata: { source: 'https://example.com/a' },
      },
      {
        id: 'web-1',
        content: 'content:https://example.com/b',
        metadata: { source: 'https://example.com/b' },
      },
    ]);
  });

  it('requires at least one url', () => {
    expect(() => new LangChainWebLoaderAdapter({ urls: [] })).toThrow(/at least one/i);
  });
});
