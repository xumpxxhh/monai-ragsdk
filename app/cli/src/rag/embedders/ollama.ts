import type { Chunk, Vector } from "@monai-ragsdk/core";
import type { Embedder } from "@monai-ragsdk/indexing";

export type OllamaEmbedderOptions = {
  model: string;
  baseUrl: string;
  dimension: number;
};

type OllamaEmbedResponse = {
  embeddings?: number[][];
  embedding?: number[];
};

export class OllamaEmbedder implements Embedder {
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #dimension: number;

  constructor(options: OllamaEmbedderOptions) {
    this.#model = options.model;
    this.#baseUrl = options.baseUrl.replace(/\/$/, "");
    this.#dimension = options.dimension;
  }

  async embed(chunks: Chunk[]): Promise<Vector[]> {
    if (chunks.length === 0) {
      return [];
    }

    const response = await fetch(`${this.#baseUrl}/api/embed`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.#model,
        input: chunks.map((chunk) => chunk.content),
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama embedding request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload = (await response.json()) as OllamaEmbedResponse;
    const embeddings = payload.embeddings ?? readSingleEmbedding(payload);

    if (embeddings.length !== chunks.length) {
      throw new Error(
        `Ollama returned ${embeddings.length} embeddings for ${chunks.length} chunks`,
      );
    }

    return chunks.map((chunk, index) => {
      const values = embeddings[index];

      if (!values || values.length !== this.#dimension) {
        throw new Error(
          `Ollama embedding dimension mismatch for ${chunk.id}: expected ${this.#dimension}, received ${values?.length ?? 0}`,
        );
      }

      return {
        id: chunk.id,
        values,
        metadata: chunk.metadata,
      };
    });
  }
}

function readSingleEmbedding(payload: OllamaEmbedResponse): number[][] {
  return payload.embedding ? [payload.embedding] : [];
}
