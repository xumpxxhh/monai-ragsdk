import { describe, expect, it } from 'vitest';

import { SimpleChunker } from '../src/index.ts';

describe('SimpleChunker', () => {
  it('splits content into overlapping chunks', async () => {
    const chunker = new SimpleChunker({ chunkSize: 10, overlap: 2 });
    const chunks = await chunker.chunk({
      id: 'doc-1',
      content: 'abcdefghijklmnopqrstuvwxyz',
    });

    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toMatchObject({
      id: 'doc-1#0',
      content: 'abcdefghij',
      metadata: { chunkIndex: 0, start: 0, end: 10 },
    });
    expect(chunks[1]).toMatchObject({
      id: 'doc-1#1',
      content: 'ijklmnopqr',
      metadata: { chunkIndex: 1, start: 8, end: 18 },
    });
  });

  it('returns no chunks for empty content', async () => {
    const chunker = new SimpleChunker();

    await expect(chunker.chunk({ id: 'empty', content: '   ' })).resolves.toEqual([]);
  });

  it('rejects invalid overlap configuration', () => {
    expect(() => new SimpleChunker({ chunkSize: 10, overlap: 10 })).toThrow(
      'overlap must be smaller than chunkSize',
    );
  });
});
