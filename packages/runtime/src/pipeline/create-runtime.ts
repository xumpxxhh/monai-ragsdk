import type { CreateRuntimeOptions, Runtime } from '../types/index.js';

import { createRunnableRuntime } from './run-runtime.js';

export function createRuntime(options: CreateRuntimeOptions): Runtime {
  return createRunnableRuntime(options);
}
