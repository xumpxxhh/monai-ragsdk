import {
  type BaseMessage,
  type BaseMessageChunk,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import type {
  BaseChatModel,
  BaseChatModelCallOptions,
} from '@langchain/core/language_models/chat_models';
import type { RuntimeContext } from '@monai-ragsdk/runtime';

import {
  LangChainRuntimeGeneratorAdapter,
  type LangChainRuntimeAnswerExtractor,
  type LangChainRuntimeGenerationInput,
  type LangChainRuntimeGenerationMetadataBuilder,
} from './langchain-runtime-generator-adapter.js';

type MaybePromise<T> = T | Promise<T>;

type ChatModelInvokeInput<CallOptions extends BaseChatModelCallOptions> = {
  messages: BaseMessage[];
  options?: Partial<CallOptions>;
};

export type CreateLangChainChatModelRuntimeGeneratorOptions<
  CallOptions extends BaseChatModelCallOptions = BaseChatModelCallOptions,
  OutputMessageType extends BaseMessageChunk = BaseMessageChunk,
> = {
  model: BaseChatModel<CallOptions, OutputMessageType>;
  systemPrompt?: string;
  buildSystemPrompt?: (
    input: LangChainRuntimeGenerationInput,
    context: RuntimeContext,
  ) => MaybePromise<string | undefined>;
  buildMessages?: (
    input: LangChainRuntimeGenerationInput,
    context: RuntimeContext,
  ) => MaybePromise<BaseMessage[]>;
  mapCallOptions?: (
    input: LangChainRuntimeGenerationInput,
    context: RuntimeContext,
  ) => MaybePromise<Partial<CallOptions> | undefined>;
  extractAnswer?: LangChainRuntimeAnswerExtractor<OutputMessageType>;
  buildGenerationMetadata?: LangChainRuntimeGenerationMetadataBuilder<OutputMessageType>;
};

function buildFallbackHumanMessageContent(input: LangChainRuntimeGenerationInput): string {
  if (input.promptContext) {
    return input.promptContext;
  }

  const contextText = input.chunks.map((chunk) => chunk.content).join('\n\n');

  if (!contextText) {
    return input.request.effectiveQuery.query;
  }

  return ['Question:', input.request.effectiveQuery.query, '', 'Context:', contextText].join('\n');
}

async function buildDefaultMessages<
  CallOptions extends BaseChatModelCallOptions,
  OutputMessageType extends BaseMessageChunk,
>(
  options: CreateLangChainChatModelRuntimeGeneratorOptions<CallOptions, OutputMessageType>,
  input: LangChainRuntimeGenerationInput,
  context: RuntimeContext,
): Promise<BaseMessage[]> {
  const systemPrompt = options.buildSystemPrompt
    ? await options.buildSystemPrompt(input, context)
    : options.systemPrompt;
  const messages: BaseMessage[] = [];

  if (systemPrompt) {
    messages.push(new SystemMessage(systemPrompt));
  }

  messages.push(new HumanMessage(buildFallbackHumanMessageContent(input)));

  return messages;
}

export function createLangChainChatModelRuntimeGenerator<
  CallOptions extends BaseChatModelCallOptions = BaseChatModelCallOptions,
  OutputMessageType extends BaseMessageChunk = BaseMessageChunk,
>(
  options: CreateLangChainChatModelRuntimeGeneratorOptions<CallOptions, OutputMessageType>,
): LangChainRuntimeGeneratorAdapter<ChatModelInvokeInput<CallOptions>, OutputMessageType> {
  return new LangChainRuntimeGeneratorAdapter<ChatModelInvokeInput<CallOptions>, OutputMessageType>(
    {
      generator: {
        async invoke(input) {
          return options.model.invoke(input.messages, input.options);
        },
      },
      async buildPrompt(input, context) {
        return {
          messages: options.buildMessages
            ? await options.buildMessages(input, context)
            : await buildDefaultMessages(options, input, context),
          options: options.mapCallOptions
            ? await options.mapCallOptions(input, context)
            : undefined,
        };
      },
      extractAnswer: options.extractAnswer,
      buildGenerationMetadata: options.buildGenerationMetadata,
    },
  );
}
