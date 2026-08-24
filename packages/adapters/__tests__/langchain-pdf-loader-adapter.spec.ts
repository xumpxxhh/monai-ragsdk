import { Document as LangChainDocument } from '@langchain/core/documents';
import { describe, expect, it } from 'vitest';

import {
  LangChainCheerioWebLoaderAdapter,
  LangChainLoaderAdapter,
  LangChainPdfLoaderAdapter,
} from '../src/index.ts';

describe('LangChainPdfLoaderAdapter', () => {
  it('converts PDF-like loader output into core documents', async () => {
    const adapter = new LangChainLoaderAdapter({
      idPrefix: 'pdf',
      loader: {
        async load() {
          return [
            new LangChainDocument({
              pageContent: 'page one',
              metadata: { source: '/tmp/sample.pdf', pdf: { totalPages: 2 } },
            }),
            new LangChainDocument({
              pageContent: 'page two',
              metadata: { source: '/tmp/sample.pdf', pdf: { totalPages: 2 } },
            }),
          ];
        },
      },
    });

    const documents = await adapter.load();

    expect(documents).toEqual([
      {
        id: 'pdf-0',
        content: 'page one',
        metadata: {
          source: '/tmp/sample.pdf',
          pdf: { totalPages: 2 },
        },
      },
      {
        id: 'pdf-1',
        content: 'page two',
        metadata: {
          source: '/tmp/sample.pdf',
          pdf: { totalPages: 2 },
        },
      },
    ]);
  });

  it('exposes PDF loader options through the adapter constructor', () => {
    expect(() => {
      new LangChainPdfLoaderAdapter({
        filePath: '/tmp/missing.pdf',
        splitPages: true,
      });
    }).not.toThrow();
  });
});

describe('LangChainCheerioWebLoaderAdapter', () => {
  it('parses inline html with the configured selector', async () => {
    const adapter = new LangChainCheerioWebLoaderAdapter({
      html: '<html><body><main>Hello HTML</main><footer>ignored</footer></body></html>',
      selector: 'main',
      idPrefix: 'fixture',
    });

    const documents = await adapter.load();

    expect(documents).toEqual([
      {
        id: 'fixture-0',
        content: 'Hello HTML',
        metadata: {
          source: 'inline-html',
        },
      },
    ]);
  });

  it('requires exactly one source input', () => {
    expect(
      () => new LangChainCheerioWebLoaderAdapter({ html: '<p>x</p>', webPath: 'https://x' }),
    ).toThrow(/exactly one/i);
  });
});
