import { Document as LangChainDocument } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { describe, expect, it } from "vitest";

import { LangChainTextSplitterAdapter } from "../src/index.ts";

describe("LangChainTextSplitterAdapter", () => {
  it("splits a core document into rag chunks", async () => {
    const adapter = new LangChainTextSplitterAdapter({
      splitter: new RecursiveCharacterTextSplitter({
        chunkSize: 10,
        chunkOverlap: 2,
      }),
    });

    const chunks = await adapter.chunk({
      id: "doc-1",
      content: "abcdefghijklmnopqrstuvwxyz",
      metadata: { source: "unit-test" },
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({
      id: "doc-1#0",
      content: "abcdefghij",
      metadata: {
        source: "unit-test",
        sourceDocumentId: "doc-1",
        chunkIndex: 0,
      },
    });
    expect(chunks[2]).toMatchObject({
      id: "doc-1#2",
      content: "qrstuvwxyz",
      metadata: {
        source: "unit-test",
        sourceDocumentId: "doc-1",
        chunkIndex: 2,
      },
    });
  });

  it("skips blank split results and keeps chunk indexes contiguous", async () => {
    const adapter = new LangChainTextSplitterAdapter({
      splitter: {
        async splitDocuments() {
          return [
            new LangChainDocument({ pageContent: "   " }),
            new LangChainDocument({ pageContent: "first chunk" }),
            new LangChainDocument({ pageContent: "second chunk" }),
          ];
        },
      },
    });

    const chunks = await adapter.chunk({
      id: "doc-2",
      content: "unused in mock splitter",
    });

    expect(chunks).toEqual([
      {
        id: "doc-2#0",
        content: "first chunk",
        metadata: {
          sourceDocumentId: "doc-2",
          chunkIndex: 0,
        },
      },
      {
        id: "doc-2#1",
        content: "second chunk",
        metadata: {
          sourceDocumentId: "doc-2",
          chunkIndex: 1,
        },
      },
    ]);
  });
});
