import type { RuntimeContext } from './runtime-context.js';

/** 策略阶段调 LLM 的轻量抽象，与 RuntimeGenerator 解耦；厂商实现放在 adapters。 */
export type RuntimeStrategyModelInput = {
  prompt: string;
  system?: string;
};

export interface RuntimeStrategyModel {
  complete(input: RuntimeStrategyModelInput, context: RuntimeContext): Promise<string>;
}
