import type { Embedder } from '@monai-ragsdk/indexing';

/**
 * 把查询文本编成单条向量。retriever 只吃 number[]，
 * 不走完整 Chunk 写入路径，因此单独包一层而不是复用索引 embed。
 */
export async function embedQuery(embedder: Embedder, query: string): Promise<number[]> {
  const [vector] = await embedder.embed([
    {
      id: 'query',
      content: query,
    },
  ]);

  if (!vector) {
    throw new Error('failed to build query vector');
  }

  return vector.values;
}
