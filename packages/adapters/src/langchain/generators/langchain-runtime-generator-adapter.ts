import type { Chunk, JsonValue } from '@monai-ragsdk/core';
import type {
  RetrievalRequest,
  RuntimeContext,
  RuntimeGenerationResult,
  RuntimeGenerator,
} from '@monai-ragsdk/runtime';

import { mergeJsonObjects, normalizeJsonObject } from '../../shared/json.js';

type MaybePromise<T> = T | Promise<T>;

export type LangChainRuntimeGenerationInput = {
  request: RetrievalRequest;
  chunks: Chunk[];
  promptContext?: string;
};

export type LangChainRuntimeGeneratorOutputLike =
  | string
  | {
      content?: unknown;
      response_metadata?: Record<string, unknown>;
      usage_metadata?: Record<string, unknown>;
    };

export type LangChainRuntimeGeneratorLike<
  TPrompt = string,
  TResult = LangChainRuntimeGeneratorOutputLike,
> = {
  invoke(prompt: TPrompt): Promise<TResult>;
};

export type LangChainRuntimePromptBuilder<TPrompt> = (
  input: LangChainRuntimeGenerationInput,
  context: RuntimeContext,
) => MaybePromise<TPrompt>;

export type LangChainRuntimeAnswerExtractor<TResult> = (
  result: TResult,
  input: LangChainRuntimeGenerationInput,
  context: RuntimeContext,
) => MaybePromise<string>;

export type LangChainRuntimeGenerationMetadataBuilder<TResult> = (
  result: TResult,
  input: LangChainRuntimeGenerationInput,
  context: RuntimeContext,
) => MaybePromise<Record<string, JsonValue> | undefined>;

export type LangChainRuntimeGeneratorOptions<
  TPrompt = string,
  TResult = LangChainRuntimeGeneratorOutputLike,
> = {
  generator: LangChainRuntimeGeneratorLike<TPrompt, TResult>;
  buildPrompt?: LangChainRuntimePromptBuilder<TPrompt>;
  extractAnswer?: LangChainRuntimeAnswerExtractor<TResult>;
  buildGenerationMetadata?: LangChainRuntimeGenerationMetadataBuilder<TResult>;
};

function defaultBuildPrompt(input: LangChainRuntimeGenerationInput): string {
  if (input.promptContext) {
    return input.promptContext;
  }

  const contextText = input.chunks.map((chunk) => chunk.content).join('\n\n');

  if (!contextText) {
    return input.request.effectiveQuery.query;
  }

  return [`query: ${input.request.effectiveQuery.query}`, contextText].join('\n\n');
}

function readContentText(content: unknown): string | undefined {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const segments = content.flatMap((segment) => {
      if (typeof segment === 'string') {
        return segment;
      }

      if (
        typeof segment === 'object' &&
        segment !== null &&
        'text' in segment &&
        typeof segment.text === 'string'
      ) {
        return segment.text;
      }

      return [];
    });

    return segments.length > 0 ? segments.join('\n') : undefined;
  }

  return undefined;
}

function defaultExtractAnswer(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  if (typeof result === 'object' && result !== null && 'content' in result) {
    const answer = readContentText(result.content);

    if (answer !== undefined) {
      return answer;
    }
  }

  throw new Error(
    'LangChainRuntimeGeneratorAdapter could not extract a string answer from generator output. Provide extractAnswer() to customize output parsing.',
  );
}

function defaultBuildGenerationMetadata(result: unknown): Record<string, JsonValue> | undefined {
  if (typeof result !== 'object' || result === null) {
    return undefined;
  }

  return mergeJsonObjects(
    'response_metadata' in result &&
      typeof result.response_metadata === 'object' &&
      result.response_metadata !== null
      ? normalizeJsonObject(result.response_metadata as Record<string, unknown>)
      : undefined,
    'usage_metadata' in result &&
      typeof result.usage_metadata === 'object' &&
      result.usage_metadata !== null
      ? normalizeJsonObject(result.usage_metadata as Record<string, unknown>)
      : undefined,
  );
}

export class LangChainRuntimeGeneratorAdapter<
  TPrompt = string,
  TResult = LangChainRuntimeGeneratorOutputLike,
> implements RuntimeGenerator {
  readonly #generator: LangChainRuntimeGeneratorLike<TPrompt, TResult>;
  readonly #options: LangChainRuntimeGeneratorOptions<TPrompt, TResult>;

  constructor(options: LangChainRuntimeGeneratorOptions<TPrompt, TResult>) {
    this.#generator = options.generator;
    this.#options = options;
  }

  async generate(
    input: LangChainRuntimeGenerationInput,
    context: RuntimeContext,
  ): Promise<RuntimeGenerationResult> {
    const prompt = this.#options.buildPrompt
      ? await this.#options.buildPrompt(input, context)
      : (defaultBuildPrompt(input) as TPrompt);
    const result = await this.#generator.invoke(prompt);
    const answer = this.#options.extractAnswer
      ? await this.#options.extractAnswer(result, input, context)
      : defaultExtractAnswer(result);
    const generationMetadata = this.#options.buildGenerationMetadata
      ? await this.#options.buildGenerationMetadata(result, input, context)
      : defaultBuildGenerationMetadata(result);

    return {
      answer,
      generationMetadata,
    };
  }
}
