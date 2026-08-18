import { Document as LangChainDocument } from '@langchain/core/documents';
import { describe, expect, it } from 'vitest';

import { LangChainLoaderAdapter } from '../src/index.ts';

describe('LangChainLoaderAdapter', () => {
  it('converts LangChain documents into core documents', async () => {
    const adapter = new LangChainLoaderAdapter({
      idPrefix: 'fixture',
      loader: {
        async load() {
          return [
            new LangChainDocument({
              id: 'langchain-1',
              pageContent: 'hello adapters',
              metadata: {
                source: 'unit-test',
                createdAt: new Date('2026-04-14T00:00:00.000Z'),
                nested: { page: 1 },
                tags: ['a', 2, true],
                skipped: undefined,
              },
            }),
            new LangChainDocument({
              pageContent: 'fallback id document',
            }),
          ];
        },
      },
    });

    const documents = await adapter.load();

    expect(documents).toEqual([
      {
        id: 'langchain-1',
        content: 'hello adapters',
        metadata: {
          source: 'unit-test',
          createdAt: new Date('2026-04-14T00:00:00.000Z').getTime(),
          nested: { page: 1 },
          tags: ['a', 2, true],
        },
      },
      {
        id: 'fixture-1',
        content: 'fallback id document',
        metadata: undefined,
      },
    ]);
  });
});
