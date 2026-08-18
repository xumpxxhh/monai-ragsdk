import { describe, expect, it } from 'vitest';

import { LangChainDocumentMetadataExtractor } from '../src/index.ts';

describe('LangChainDocumentMetadataExtractor', () => {
  it('extracts canonical metadata fields from LangChain-style metadata', async () => {
    const extractor = new LangChainDocumentMetadataExtractor();

    const metadata = await extractor.extract(
      {
        id: 'chunk-1',
        content: 'chunk content',
        metadata: {
          source: '/docs/guide.md',
          loc: { lines: { from: 1, to: 10 } },
          'Header 1': 'Guide',
          'Header 2': 'Setup',
        },
      },
      {
        document: {
          id: 'doc-1',
          content: 'doc',
          metadata: {
            title: 'Guide Title',
          },
        },
        mode: 'full',
      },
    );

    expect(metadata).toEqual({
      sourcePath: '/docs/guide.md',
      documentTitle: 'Guide Title',
      headerPath: ['Guide', 'Setup'],
      sourceLocation: {
        lines: { from: 1, to: 10 },
      },
    });
  });

  it('returns undefined when no canonical metadata can be extracted', async () => {
    const extractor = new LangChainDocumentMetadataExtractor();

    await expect(
      extractor.extract(
        {
          id: 'chunk-2',
          content: 'chunk content',
          metadata: {},
        },
        {
          document: {
            id: 'doc-2',
            content: 'doc',
          },
          mode: 'full',
        },
      ),
    ).resolves.toBeUndefined();
  });
});
