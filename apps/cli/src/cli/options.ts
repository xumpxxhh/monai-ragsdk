import type {
  AskCommandOptions,
  CliCommandName,
  CliOptions,
  IndexBuildOptions,
  IndexCommandOptions,
  InitCommandOptions,
  RuntimeSubcommandName,
  RuntimeCommandOptions,
} from '../types.js';

const DEFAULT_INDEX_FILE_PATH = './.artifacts/index-snapshot.json';

export function parseCliOptions(argv: string[]): CliOptions {
  const { command, runtimeSubcommand, restArgs } = parseCommand(argv);
  const values = new Map<string, string>();
  let debug = false;

  for (let index = 0; index < restArgs.length; index += 1) {
    const token = restArgs[index];

    if (!token) {
      continue;
    }

    if (token === '--debug') {
      debug = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new Error(`unknown argument: ${token}`);
    }

    const nextValue = restArgs[index + 1];

    if (!nextValue || nextValue.startsWith('--')) {
      throw new Error(`missing value for argument: ${token}`);
    }

    values.set(token.slice(2), nextValue);
    index += 1;
  }

  switch (command) {
    case 'index':
      return parseIndexCommandOptions(values, debug);
    case 'runtime':
      return parseRuntimeCommandOptions(values, debug, runtimeSubcommand);
    case 'init':
      return parseInitCommandOptions(values);
    case 'ask':
    default:
      return parseAskCommandOptions(values, debug);
  }
}

function parseCommand(argv: string[]): {
  command: CliCommandName;
  runtimeSubcommand: RuntimeSubcommandName;
  restArgs: string[];
} {
  const [firstArg, secondArg, ...remainingArgs] = argv;

  if (!firstArg || firstArg.startsWith('--')) {
    return {
      command: 'ask',
      runtimeSubcommand: 'answer',
      restArgs: argv,
    };
  }

  if (firstArg === 'ask' || firstArg === 'index' || firstArg === 'init') {
    return {
      command: firstArg,
      runtimeSubcommand: 'answer',
      restArgs: [secondArg, ...remainingArgs].filter(
        (item): item is string => typeof item === 'string',
      ),
    };
  }

  if (firstArg === 'runtime') {
    if (!secondArg || secondArg.startsWith('--')) {
      return {
        command: 'runtime',
        runtimeSubcommand: 'answer',
        restArgs: secondArg ? [secondArg, ...remainingArgs] : remainingArgs,
      };
    }

    if (secondArg === 'answer' || secondArg === 'retrieval') {
      return {
        command: 'runtime',
        runtimeSubcommand: secondArg,
        restArgs: remainingArgs,
      };
    }

    throw new Error(`unknown runtime subcommand: ${secondArg}`);
  }

  throw new Error(`unknown command: ${firstArg}`);
}

function parseAskCommandOptions(values: Map<string, string>, debug: boolean): AskCommandOptions {
  const buildOptions = parseIndexBuildOptions(values);
  const query = readRequiredOption(values, 'query');

  return {
    command: 'ask',
    ...buildOptions,
    query,
    topK: parsePositiveInteger(values.get('topK'), 3, 'topK'),
    traceFilePath: values.get('traceFile') ?? './.artifacts/ask-trace.jsonl',
    debug,
  };
}

function parseIndexCommandOptions(
  values: Map<string, string>,
  debug: boolean,
): IndexCommandOptions {
  return {
    command: 'index',
    ...parseIndexBuildOptions(values),
    indexFilePath: values.get('indexFile') ?? DEFAULT_INDEX_FILE_PATH,
    traceFilePath: values.get('traceFile') ?? './.artifacts/index-trace.jsonl',
    debug,
  };
}

function parseRuntimeCommandOptions(
  values: Map<string, string>,
  debug: boolean,
  subcommand: RuntimeSubcommandName,
): RuntimeCommandOptions {
  return {
    command: 'runtime',
    subcommand,
    query: readRequiredOption(values, 'query'),
    topK: parsePositiveInteger(values.get('topK'), 3, 'topK'),
    indexFilePath: values.get('indexFile') ?? DEFAULT_INDEX_FILE_PATH,
    traceFilePath: values.get('traceFile') ?? `./.artifacts/runtime-${subcommand}-trace.jsonl`,
    configFilePath: values.get('config'),
    debug,
  };
}

function parseInitCommandOptions(values: Map<string, string>): InitCommandOptions {
  return {
    command: 'init',
    configFilePath: values.get('config'),
  };
}

function parseIndexBuildOptions(values: Map<string, string>): IndexBuildOptions {
  return {
    directoryPath: readRequiredOption(values, 'dir'),
    chunkSize: parsePositiveInteger(values.get('chunkSize'), 500, 'chunkSize'),
    chunkOverlap: parseNonNegativeInteger(values.get('chunkOverlap'), 50, 'chunkOverlap'),
    extensions: parseExtensions(values.get('extensions')),
    configFilePath: values.get('config'),
  };
}

function readRequiredOption(values: Map<string, string>, key: string): string {
  const value = values.get(key);

  if (!value) {
    throw new Error(`--${key} is required`);
  }

  return value;
}

function parsePositiveInteger(value: string | undefined, fallback: number, label: string): number {
  const resolved = value ? Number.parseInt(value, 10) : fallback;

  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return resolved;
}

function parseNonNegativeInteger(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  const resolved = value ? Number.parseInt(value, 10) : fallback;

  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }

  return resolved;
}

function parseExtensions(value: string | undefined): string[] {
  const raw = value ?? '.md,.markdown,.txt';
  const extensions = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => (item.startsWith('.') ? item.toLowerCase() : `.${item.toLowerCase()}`));

  if (extensions.length === 0) {
    throw new Error('extensions must contain at least one file extension');
  }

  return Array.from(new Set(extensions));
}
