import { OpenAIRuntimeGenerator } from '../generators/openai-runtime-generator.js';
import { OpenAIStrategyModel } from '../models/openai-strategy-model.js';
import { OpenAIChatClient, type OpenAIChatClientOptions } from './openai-chat-client.js';

export type CreateOpenAIChatAdaptersOptions = OpenAIChatClientOptions & {
  /** RuntimeGenerator 默认 system；不传则用内置 grounded 提示。 */
  systemPrompt?: string;
  /** StrategyModel 默认 system；可被 complete(input.system) 覆盖。 */
  defaultSystem?: string;
};

export type OpenAIChatAdapters = {
  client: OpenAIChatClient;
  generator: OpenAIRuntimeGenerator;
  strategyModel: OpenAIStrategyModel;
};

/**
 * 一次配置产出共用同一 chat client 的 Generator + StrategyModel，
 * 避免应用层对同一套 baseUrl/model 双 new。
 */
export function createOpenAIChatAdapters(
  options: CreateOpenAIChatAdaptersOptions,
): OpenAIChatAdapters {
  const client = new OpenAIChatClient(options);

  return {
    client,
    generator: new OpenAIRuntimeGenerator({
      client,
      systemPrompt: options.systemPrompt,
    }),
    strategyModel: new OpenAIStrategyModel({
      client,
      defaultSystem: options.defaultSystem,
    }),
  };
}
