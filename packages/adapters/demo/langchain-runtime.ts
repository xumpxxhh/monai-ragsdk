import { Document } from "@langchain/core/documents";
import { SimpleChatModel } from "@langchain/core/language_models/chat_models";
import { BaseRetriever } from "@langchain/core/retrievers";
import { NoopQueryPreprocessor, createDefaultRuntime } from "@monai-ragsdk/runtime";

import {
  createLangChainBaseRetrieverRuntimeAdapter,
  createLangChainChatModelRuntimeGenerator,
} from "../src/index.js";

class DemoRetriever extends BaseRetriever<{
  sourceId: string;
  hierarchyPath: string[];
  score?: number;
}> {
  async _getRelevantDocuments(query: string) {
    return [
      new Document({
        id: "chunk-1",
        pageContent: `runtime api for ${query}`,
        metadata: {
          sourceId: "docs/runtime",
          hierarchyPath: ["runtime", "api"],
          score: 0.95,
        },
      }),
      new Document({
        id: "chunk-2",
        pageContent: `faq for ${query}`,
        metadata: {
          sourceId: "docs/faq",
          hierarchyPath: ["runtime", "faq"],
          score: 0.42,
        },
      }),
    ];
  }
}

class DemoChatModel extends SimpleChatModel {
  _llmType() {
    return "demo-chat-model";
  }

  async _call(messages: import("@langchain/core/messages").BaseMessage[]) {
    return `generated from: ${messages.map((message) => message.content).join("\n\n")}`;
  }
}

const runtime = createDefaultRuntime({
  preprocessor: new NoopQueryPreprocessor({
    filters: {
      sourceIds: ["docs/runtime"],
    },
    rerank: {
      minScore: 0.6,
    },
    budget: {
      maxChunks: 1,
      maxPromptChars: 120,
    },
    strategy: "metadata-first",
    route: "docs",
  }),
  retriever: createLangChainBaseRetrieverRuntimeAdapter({
    retriever: new DemoRetriever(),
  }),
  generator: createLangChainChatModelRuntimeGenerator({
    model: new DemoChatModel({}),
    systemPrompt: "You answer using runtime retrieved context only.",
    buildGenerationMetadata() {
      return {
        provider: "demo-generator",
      };
    },
  }),
});

const result = await runtime.run(
  {
    query: "Explain runtime adapters",
  },
  {
    includeDebug: true,
  },
);

console.log("langchain runtime adapters demo passed");
console.log(result);
