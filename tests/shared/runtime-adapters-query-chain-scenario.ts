import assert from "node:assert/strict";

import { Document } from "@langchain/core/documents";
import {
  SimpleChatModel,
  type BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { BaseRetriever } from "@langchain/core/retrievers";
import type { RunnableConfig } from "@langchain/core/runnables";
import type * as AdaptersModule from "../../packages/adapters/src/index.ts";
import type * as RuntimeModule from "../../packages/runtime/src/index.ts";
import type {
  RetrievalRequest,
  RuntimeResult,
} from "../../packages/runtime/src/index.ts";

type TrackingMetadata = {
  sourceId: string;
  hierarchyPath: string[];
  score?: number;
};

class TrackingRetriever extends BaseRetriever<TrackingMetadata> {
  lc_namespace = ["tests", "shared", "tracking-retriever"];
  lastQuery?: string;
  lastConfig?: RunnableConfig;

  async invoke(input: string, options?: RunnableConfig) {
    this.lastConfig = options;

    return super.invoke(input, options);
  }

  async _getRelevantDocuments(query: string) {
    this.lastQuery = query;

    return [
      new Document({
        id: "chunk-runtime-api",
        pageContent: `runtime api for ${query}`,
        metadata: {
          sourceId: "docs/runtime",
          hierarchyPath: ["runtime", "api"],
          score: 0.95,
        },
      }),
      new Document({
        id: "chunk-runtime-faq",
        pageContent: `faq for ${query}`,
        metadata: {
          sourceId: "docs/faq",
          hierarchyPath: ["runtime", "faq"],
          score: 0.41,
        },
      }),
    ];
  }
}

class TrackingChatModel extends SimpleChatModel<BaseChatModelCallOptions> {
  lastMessages?: BaseMessage[];
  lastOptions?: this["ParsedCallOptions"];

  _llmType() {
    return "tracking-chat-model";
  }

  async _call(messages: BaseMessage[], options: this["ParsedCallOptions"]) {
    this.lastMessages = messages;
    this.lastOptions = options;

    return `generated from: ${messages.map((message) => message.content).join("\n\n")}`;
  }
}

export type RuntimeAdaptersQueryScenarioResult = {
  result: RuntimeResult;
  retriever: TrackingRetriever;
  model: TrackingChatModel;
};

export async function runRuntimeAdaptersQueryScenario(): Promise<RuntimeAdaptersQueryScenarioResult> {
  const {
    createLangChainBaseRetrieverRuntimeAdapter,
    createLangChainChatModelRuntimeGenerator,
  } =
    (await import("../../packages/adapters/dist/index.js")) as typeof AdaptersModule;
  const { NoopQueryPreprocessor, createDefaultRuntime } =
    (await import("../../packages/runtime/dist/index.js")) as typeof RuntimeModule;
  const retriever = new TrackingRetriever();
  const model = new TrackingChatModel({});
  const retrieverAdapterOptions = {
    retriever,
    mapRunnableConfig(request: RetrievalRequest) {
      return {
        tags: [`route:${request.route ?? "default"}`],
      };
    },
  } as unknown as Parameters<
    typeof createLangChainBaseRetrieverRuntimeAdapter
  >[0];
  const generatorAdapterOptions = {
    model,
    systemPrompt: "You answer using runtime retrieved context only.",
    mapCallOptions() {
      return {
        stop: ["END"],
      };
    },
    buildGenerationMetadata() {
      return {
        provider: "integration-smoke-demo",
      };
    },
  } as unknown as Parameters<
    typeof createLangChainChatModelRuntimeGenerator
  >[0];
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
    retriever: createLangChainBaseRetrieverRuntimeAdapter(
      retrieverAdapterOptions,
    ),
    generator: createLangChainChatModelRuntimeGenerator(
      generatorAdapterOptions,
    ),
  });

  const result = await runtime.run(
    {
      query: "Explain runtime adapters",
    },
    {
      includeDebug: true,
    },
  );

  return {
    result,
    retriever,
    model,
  };
}

export function assertRuntimeAdaptersQueryScenario(
  scenario: RuntimeAdaptersQueryScenarioResult,
): void {
  const { result, retriever, model } = scenario;

  assert.equal(retriever.lastQuery, "Explain runtime adapters");
  assert.deepEqual(retriever.lastConfig?.tags, ["route:docs"]);

  assert.equal(result.originalQuery.query, "Explain runtime adapters");
  assert.equal(result.effectiveQuery.query, "Explain runtime adapters");
  assert.equal(result.chunks.length, 1);
  assert.equal(result.chunks[0]?.id, "chunk-runtime-api");
  assert.equal(result.generationMetadata?.provider, "integration-smoke-demo");

  assert.equal(model.lastMessages?.length, 2);
  assert.equal(
    model.lastMessages?.[0]?.content,
    "You answer using runtime retrieved context only.",
  );
  assert.equal(
    model.lastMessages?.[1]?.content,
    "query: Explain runtime adapters\n\nruntime api for Explain runtime adapters",
  );
  assert.deepEqual(model.lastOptions?.stop, ["END"]);

  assert.ok(result.answer.includes("generated from:"));
  assert.ok(result.answer.includes("runtime api for Explain runtime adapters"));
  assert.ok(result.debug);
  assert.equal(result.debug?.route, "docs");
  assert.equal(result.debug?.retrievalStrategy, "metadata-first");
  assert.equal(result.debug?.rerankStrategy, undefined);
  assert.deepEqual(result.debug?.filters, {
    sourceIds: ["docs/runtime"],
  });
  assert.equal(result.debug?.retrievedCount, 1);
  assert.equal(result.debug?.selectedCount, 1);
  assert.equal(result.debug?.droppedCount, 0);
  assert.equal(result.debug?.finalChunkCount, 1);
  assert.deepEqual(result.debug?.appliedBudget, {
    maxChunks: 1,
    maxPromptChars: 120,
  });
  assert.equal(result.debug?.appliedScoreThreshold, 0.6);
  assert.equal(result.debug?.selectionTrace?.length, 1);
  assert.equal(
    result.debug?.promptContext,
    "query: Explain runtime adapters\n\nruntime api for Explain runtime adapters",
  );
}
