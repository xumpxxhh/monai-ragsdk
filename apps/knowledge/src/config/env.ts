import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** 包根目录（apps/knowledge），用于定位 .env 与默认 state 路径。 */
export const PACKAGE_ROOT = resolve(SRC_DIR, '../..');

const DEFAULT_PGVECTOR_CONNECTION_STRING = 'postgresql://monai:monai@localhost:5432/monai_ragsdk';
const DEFAULT_EMBEDDING_BASE_URL =
  'https://llm-5vs4jf61x3o1aul1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
const DEFAULT_CHAT_BASE_URL = 'https://note3-prev-api.askdiandian.com/v1';
const DEFAULT_CHAT_MODEL = 'dots3-note-prev';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-v3';
const DEFAULT_EMBEDDING_DIMENSION = 1024;
const DEFAULT_KNOWLEDGE_PORT = 3001;
const DEFAULT_CONSOLE_STATE_PATH = resolve(PACKAGE_ROOT, '../server/data/state.json');

export type KnowledgeConfig = {
  port: number;
  corsOrigin: string;
  consoleStatePath: string;
  connectionString: string;
  embeddingBaseUrl: string;
  chatBaseUrl: string;
  chatModel: string;
  chatApiKey?: string;
  embeddingModel: string;
  dimension: number;
};

function loadDotEnvFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const text = readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnvFile(resolve(PACKAGE_ROOT, '.env'));

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** 从环境变量组装 knowledge 服务配置。 */
export function loadKnowledgeConfig(): KnowledgeConfig {
  const portFromEnv =
    process.env.KNOWLEDGE_PORT?.trim() || process.env.PORT?.trim() || String(DEFAULT_KNOWLEDGE_PORT);

  return {
    port: readPositiveInt(portFromEnv, DEFAULT_KNOWLEDGE_PORT),
    corsOrigin: process.env.CORS_ORIGIN?.trim() || '*',
    consoleStatePath: process.env.CONSOLE_STATE_PATH?.trim() || DEFAULT_CONSOLE_STATE_PATH,
    connectionString:
      process.env.PGVECTOR_CONNECTION_STRING?.trim() || DEFAULT_PGVECTOR_CONNECTION_STRING,
    embeddingBaseUrl: process.env.EMBEDDING_BASE_URL?.trim() || DEFAULT_EMBEDDING_BASE_URL,
    chatBaseUrl:
      process.env.DOTSAI_BASE_URL?.trim() ||
      process.env.OPENAI_BASE_URL?.trim() ||
      DEFAULT_CHAT_BASE_URL,
    chatModel:
      process.env.DOTSAI_CHAT_MODEL?.trim() ||
      process.env.OPENAI_CHAT_MODEL?.trim() ||
      DEFAULT_CHAT_MODEL,
    chatApiKey:
      process.env.DOTSAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || undefined,
    embeddingModel: process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    dimension: readPositiveInt(process.env.EMBEDDING_DIMENSION, DEFAULT_EMBEDDING_DIMENSION),
  };
}

export function hasEmbeddingKey(): boolean {
  return Boolean(process.env.EMBEDDING_API_KEY?.trim());
}

export function hasChatKey(): boolean {
  return Boolean(process.env.DOTSAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
}

export function hasVectorStoreConfig(): boolean {
  return Boolean(
    process.env.PGVECTOR_CONNECTION_STRING?.trim() || DEFAULT_PGVECTOR_CONNECTION_STRING,
  );
}
