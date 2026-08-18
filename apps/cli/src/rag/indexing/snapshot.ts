import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { IndexSnapshot, IndexedChunkMap } from '../../types.js';

export async function writeIndexSnapshot(
  indexFilePath: string,
  snapshot: IndexSnapshot,
): Promise<string> {
  const resolvedIndexFilePath = path.resolve(process.cwd(), indexFilePath);

  await mkdir(path.dirname(resolvedIndexFilePath), { recursive: true });
  await writeFile(resolvedIndexFilePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf-8');

  return resolvedIndexFilePath;
}

export async function readIndexSnapshot(indexFilePath: string): Promise<{
  snapshot: IndexSnapshot;
  resolvedIndexFilePath: string;
}> {
  const resolvedIndexFilePath = path.resolve(process.cwd(), indexFilePath);
  const content = await readFile(resolvedIndexFilePath, 'utf-8');

  return {
    snapshot: JSON.parse(content) as IndexSnapshot,
    resolvedIndexFilePath,
  };
}

export function createChunkMapFromSnapshot(snapshot: IndexSnapshot): IndexedChunkMap {
  return new Map(snapshot.chunks.map((chunk) => [chunk.id, chunk]));
}
