import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LangChainDirectoryLoaderAdapter, LangChainMarkdownDirectoryLoader } from '../src/index.ts';
import { TextLoader } from '@langchain/classic/document_loaders/fs/text';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directoryPath) => rm(directoryPath, { recursive: true, force: true })),
  );
});

describe('LangChainMarkdownDirectoryLoader', () => {
  it('loads markdown files recursively and ignores other extensions by default', async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'rag-adapters-loader-'));
    temporaryDirectories.push(rootDirectory);

    await mkdir(path.join(rootDirectory, 'nested'), { recursive: true });
    await writeFile(path.join(rootDirectory, 'root.md'), '# Root\n\nHello');
    await writeFile(path.join(rootDirectory, 'nested', 'child.markdown'), '# Child');
    await writeFile(path.join(rootDirectory, 'nested', 'ignore.txt'), 'ignore');

    const loader = new LangChainMarkdownDirectoryLoader({
      path: rootDirectory,
    });
    const documents = await loader.load();

    expect(documents).toHaveLength(2);
    expect(documents.map((document) => document.content)).toEqual(['# Child', '# Root\n\nHello']);
    expect(documents[0]?.metadata).toMatchObject({
      source: expect.stringContaining(path.join('nested', 'child.markdown')),
    });
  });

  it('allows callers to provide their own file extension mapping', async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'rag-adapters-loader-custom-'));
    temporaryDirectories.push(rootDirectory);

    await writeFile(path.join(rootDirectory, 'guide.txt'), 'custom loader text');

    const loader = new LangChainDirectoryLoaderAdapter({
      directoryPath: rootDirectory,
      loaders: {
        '.txt': (filePath) => new TextLoader(filePath),
      },
      idPrefix: 'custom',
    });

    const documents = await loader.load();

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      id: 'custom-0',
      content: 'custom loader text',
    });
  });
});
