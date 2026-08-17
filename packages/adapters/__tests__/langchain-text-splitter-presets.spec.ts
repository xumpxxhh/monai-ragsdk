import { describe, expect, it } from "vitest";

import {
  LangChainMarkdownTextSplitterAdapter,
  LangChainRecursiveCharacterTextSplitterAdapter,
  LangChainTokenTextSplitterAdapter,
} from "../src/index.ts";

describe("LangChain splitter presets", () => {
  it("uses RecursiveCharacterTextSplitter through the preset adapter", async () => {
    const chunker = new LangChainRecursiveCharacterTextSplitterAdapter({
      chunkSize: 10,
      chunkOverlap: 0,
    });

    const chunks = await chunker.chunk({
      id: "doc-recursive",
      content: "abcdefghijklmnopqrstuvwxyz",
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.content).toBe("abcdefghij");
    expect(chunks[2]?.content).toBe("uvwxyz");
  });

  it("uses TokenTextSplitter through the preset adapter", async () => {
    const chunker = new LangChainTokenTextSplitterAdapter({
      encodingName: "cl100k_base",
      chunkSize: 5,
      chunkOverlap: 0,
    });

    const chunks = await chunker.chunk({
      id: "doc-token",
      content: "one two three four five six seven eight",
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.metadata).toMatchObject({
      sourceDocumentId: "doc-token",
      chunkIndex: 0,
    });
  }, 15000);

  it("uses MarkdownTextSplitter through the preset adapter", async () => {
    const chunker = new LangChainMarkdownTextSplitterAdapter({
      chunkSize: 30,
      chunkOverlap: 0,
    });

    const chunks = await chunker.chunk({
      id: "doc-markdown",
      content: "# Title\n\n## Section\n\nMarkdown body content.",
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.metadata).toMatchObject({
      sourceDocumentId: "doc-markdown",
      chunkIndex: 0,
    });
  });
});
