import type { Chunk } from "@monai-ragsdk/core";
import type { Embedder } from "@monai-ragsdk/indexing";

export async function embedQuery(
  embedder: Embedder,
  query: string,
): Promise<number[]> {
  const [vector] = await embedder.embed([
    {
      id: "query",
      content: query,
      metadata: {
        source: "cli-query",
      },
    } satisfies Chunk,
  ]);

  if (!vector) {
    throw new Error("failed to build query vector");
  }

  return vector.values;
}
