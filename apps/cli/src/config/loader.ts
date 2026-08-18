import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { cliConfigSchema, DEFAULT_CLI_CONFIG, type CliConfig } from './schema.js';

const DEFAULT_CONFIG_FILE_PATHS = ['./rag-cli.config.json', './apps/cli/rag-cli.config.json'];

export async function loadCliConfig(
  configFilePath: string | undefined,
): Promise<{ config: CliConfig; resolvedConfigFilePath?: string }> {
  const resolvedConfigFilePath = configFilePath
    ? path.resolve(process.cwd(), configFilePath)
    : await findDefaultConfigFilePath();

  if (!resolvedConfigFilePath) {
    return {
      config: DEFAULT_CLI_CONFIG,
    };
  }

  const rawContent = await readFile(resolvedConfigFilePath, 'utf-8');
  let rawConfig: unknown;

  try {
    rawConfig = JSON.parse(rawContent) as unknown;
  } catch {
    throw new Error(
      `Failed to parse config file: ${resolvedConfigFilePath}\n` +
        'Make sure the file is valid JSON.',
    );
  }

  const parsed = cliConfigSchema.safeParse(rawConfig);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
        return `  - ${path}: ${issue.message}`;
      })
      .join('\n');

    throw new Error(
      `Config validation failed: ${resolvedConfigFilePath}\n${issues}\n` +
        `Run "pnpm cli:dev init" to generate a valid config file.`,
    );
  }

  return {
    config: parsed.data,
    resolvedConfigFilePath,
  };
}

async function findDefaultConfigFilePath(): Promise<string | undefined> {
  for (const configFilePath of DEFAULT_CONFIG_FILE_PATHS) {
    const resolvedConfigFilePath = path.resolve(process.cwd(), configFilePath);

    try {
      await access(resolvedConfigFilePath);
      return resolvedConfigFilePath;
    } catch {
      continue;
    }
  }

  return undefined;
}
