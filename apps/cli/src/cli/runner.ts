import { runAskCommand } from './commands/ask.js';
import { runIndexCommand } from './commands/index.js';
import { runInitCommand } from './commands/init.js';
import { runRuntimeCommand } from './commands/runtime.js';
import { parseCliOptions } from './options.js';

export async function runCli(argv: string[]): Promise<void> {
  const options = parseCliOptions(argv);
  switch (options.command) {
    case 'index':
      await runIndexCommand(options);
      break;
    case 'runtime':
      await runRuntimeCommand(options);
      break;
    case 'init':
      await runInitCommand(options);
      break;
    case 'ask':
    default:
      await runAskCommand(options);
      break;
  }
}
