import type { Runtime, RuntimeResult } from '@monai-ragsdk/runtime';

export type StreamRuntimeOptions = {
  runtime: Runtime;
  query: string;
  /** 为 true 时在 stdout 逐 token 打印 answer；默认 true。 */
  printAnswer?: boolean;
};

/** 消费 runStream 事件流，汇总最终 RuntimeResult；可选实时打印 delta。 */
export async function streamRuntime(options: StreamRuntimeOptions): Promise<RuntimeResult> {
  const printAnswer = options.printAnswer ?? true;

  if (printAnswer) {
    process.stdout.write('answer: ');
  }

  let result: RuntimeResult | undefined;

  for await (const event of options.runtime.runStream({
    query: options.query,
  })) {
    if (event.type === 'delta') {
      if (printAnswer) {
        process.stdout.write(event.text);
      }
      continue;
    }

    result = event.result;
  }

  if (printAnswer) {
    process.stdout.write('\n');
  }

  if (!result) {
    throw new Error('runtime stream ended without a result');
  }

  return result;
}
