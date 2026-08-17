import { describe, expect, it } from "vitest";

import { LangChainHeaderAwareChunkTransformer } from "../src/index.ts";

describe("LangChainHeaderAwareChunkTransformer", () => {
  it("builds a header path from LangChain-style markdown metadata", async () => {
    const transformer = new LangChainHeaderAwareChunkTransformer();

    const chunk = await transformer.transform(
      {
        id: "chunk-1",
        content: "Install steps",
        metadata: {
          "Header 1": "Guide",
          "Header 2": "Setup",
        },
      },
      {
        document: {
          id: "doc-1",
          content: "unused",
        },
        mode: "full",
      },
    );

    expect(chunk.metadata).toMatchObject({
      headerPath: ["Guide", "Setup"],
    });
    expect(chunk.content).toContain("Context: Guide > Setup");
  });

  it("falls back to document metadata when chunk metadata has no headers", async () => {
    const transformer = new LangChainHeaderAwareChunkTransformer({
      includeInContent: false,
    });

    const chunk = await transformer.transform(
      {
        id: "chunk-2",
        content: "API details",
      },
      {
        document: {
          id: "doc-2",
          content: "unused",
          metadata: {
            "Header 1": "Reference",
            "Header 2": "API",
          },
        },
        mode: "full",
      },
    );

    expect(chunk).toMatchObject({
      content: "API details",
      metadata: {
        headerPath: ["Reference", "API"],
      },
    });
  });
});
