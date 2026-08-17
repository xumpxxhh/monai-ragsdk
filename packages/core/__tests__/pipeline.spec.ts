import { describe, expect, it } from "vitest";

import {
  RAGResponseSchema,
  type Generator,
  type Query,
  type RAGPipeline,
  type Retriever,
} from "../src/index.ts";

describe("core pipeline contract", () => {
  it("supports a minimal typed pipeline flow", async () => {
    const retriever: Retriever = {
      async retrieve(query) {
        return [
          {
            id: "chunk-1",
            content: `retrieved for: ${query.query}`,
          },
        ];
      },
    };

    const generator: Generator = {
      async generate({ query, chunks }) {
        return `${query.query} -> ${chunks[0]?.content ?? "no chunk"}`;
      },
    };

    const pipeline: RAGPipeline = async (query: Query) => {
      const chunks = await retriever.retrieve(query);
      const answer = await generator.generate({ query, chunks });

      return RAGResponseSchema.parse({ answer, chunks });
    };

    await expect(
      pipeline({ query: "Explain the contract" }),
    ).resolves.toMatchObject({
      answer: "Explain the contract -> retrieved for: Explain the contract",
      chunks: [
        {
          id: "chunk-1",
          content: "retrieved for: Explain the contract",
        },
      ],
    });
  });
});
