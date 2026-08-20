import { describe, expect, it } from 'vitest';

import { HeadingBasedChunker } from '../src/index.ts';

const sampleMarkdown = `# Guide

Intro paragraph.

## Setup

Install dependencies.

## Usage

Run the CLI.
`;

describe('HeadingBasedChunker', () => {
  it('splits markdown into one chunk per heading section', async () => {
    const chunker = new HeadingBasedChunker();

    const chunks = await chunker.chunk({
      id: 'doc-1',
      content: sampleMarkdown,
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.metadata?.headerPath).toEqual(['Guide']);
    expect(chunks[1]?.metadata?.headerPath).toEqual(['Guide', 'Setup']);
    expect(chunks[2]?.metadata?.headerPath).toEqual(['Guide', 'Usage']);
    expect(chunks[1]?.content).toContain('Install dependencies.');
  });

  it('splits oversized sections when maxSectionSize is configured', async () => {
    const chunker = new HeadingBasedChunker({
      maxSectionSize: 20,
    });

    const chunks = await chunker.chunk({
      id: 'doc-2',
      content: '# Title\n\n' + 'word '.repeat(30),
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.metadata?.headerPath)).toBeTruthy();
  });
});
