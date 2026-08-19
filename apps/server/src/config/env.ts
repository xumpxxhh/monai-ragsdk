import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** 包根目录（apps/server），用于定位 .env 与 data/。 */
export const PACKAGE_ROOT = resolve(SRC_DIR, '../..');

const DEFAULT_PGVECTOR_CONNECTION_STRING = 'postgresql://monai:monai@localhost:5432/monai_ragsdk';
const DEFAULT_EMBEDDING_BASE_URL =
  'https://llm-5vs4jf61x3o1aul1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
const DEFAULT_CHAT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_CHAT_MODEL = 'deepseek-v4-flash';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-v3';
const DEFAULT_EMBEDDING_DIMENSION = 1024;

export type ServerConfig = {
  port: number;
  corsOrigin: string;
  connectionString: string;
  embeddingBaseUrl: string;
  chatBaseUrl: string;
  chatModel: string;
  embeddingModel: string;
  dimension: number;
};

/**
 * 读取 apps/server/.env；已存在的 process.env 优先，避免覆盖 shell / Turbo passThrough 注入的密钥。
 * 经 `turbo run` 启动时，未列入根 `globalPassThroughEnv` 或本包 `passThroughEnv` 的变量会被 Strict 模式滤掉。
 */
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

/** 从环境变量组装服务配置；厂商地址必须显式给出，不内置到 SDK。 */
export function loadServerConfig(): ServerConfig {
  return {
    port: readPositiveInt(process.env.PORT, 3000),
    corsOrigin: process.env.CORS_ORIGIN?.trim() || 'http://localhost:5173',
    connectionString:
      process.env.PGVECTOR_CONNECTION_STRING?.trim() || DEFAULT_PGVECTOR_CONNECTION_STRING,
    embeddingBaseUrl: process.env.EMBEDDING_BASE_URL?.trim() || DEFAULT_EMBEDDING_BASE_URL,
    chatBaseUrl: process.env.OPENAI_BASE_URL?.trim() || DEFAULT_CHAT_BASE_URL,
    chatModel: process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL,
    embeddingModel: process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL,
    dimension: readPositiveInt(process.env.EMBEDDING_DIMENSION, DEFAULT_EMBEDDING_DIMENSION),
  };
}

export function hasEmbeddingKey(): boolean {
  return Boolean(process.env.EMBEDDING_API_KEY?.trim());
}

export function hasChatKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function hasVectorStoreConfig(): boolean {
  return Boolean(
    process.env.PGVECTOR_CONNECTION_STRING?.trim() || DEFAULT_PGVECTOR_CONNECTION_STRING,
  );
}
