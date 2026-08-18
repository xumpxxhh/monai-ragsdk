import { z } from 'zod';

const mockEmbeddingSchema = z.object({
  provider: z.literal('mock'),
  dimension: z.number().int().positive().default(8),
});

const ollamaEmbeddingSchema = z.object({
  provider: z.literal('ollama'),
  model: z.string().min(1, "model is required when provider is 'ollama'"),
  baseUrl: z.string().url().default('http://localhost:11434'),
  dimension: z.number().int().positive().default(768),
});

const openaiEmbeddingSchema = z.object({
  provider: z.literal('openai'),
  model: z.string().min(1, "model is required when provider is 'openai'"),
  baseUrl: z
    .string()
    .url()
    .default('https://llm-5vs4jf61x3o1aul1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'),
  apiKey: z.string().min(1).optional(),
  dimension: z.number().int().positive().default(1024),
  batchSize: z.number().int().positive().optional(),
});

export const embeddingConfigSchema = z.discriminatedUnion('provider', [
  mockEmbeddingSchema,
  ollamaEmbeddingSchema,
  openaiEmbeddingSchema,
]);

const memoryVectorStoreSchema = z.object({
  provider: z.literal('memory'),
});

const pgvectorStoreSchema = z.object({
  provider: z.literal('pgvector'),
  connectionString: z.string().optional(),
  host: z.string().optional(),
  port: z.number().int().positive().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
  schema: z.string().min(1).default('public'),
  tableName: z.string().min(1, "tableName is required when provider is 'pgvector'"),
  ensureTable: z.boolean().default(false),
});

export const vectorStoreConfigSchema = z.discriminatedUnion('provider', [
  memoryVectorStoreSchema,
  pgvectorStoreSchema,
]);

const extractiveGenerationSchema = z.object({
  provider: z.literal('extractive'),
});

const ollamaGenerationSchema = z.object({
  provider: z.literal('ollama'),
  model: z.string().min(1, "model is required when provider is 'ollama'"),
  baseUrl: z.string().url().default('http://localhost:11434'),
});

const openaiGenerationSchema = z.object({
  provider: z.literal('openai'),
  model: z.string().min(1, "model is required when provider is 'openai'"),
  baseUrl: z.string().url().default('https://api.deepseek.com'),
  apiKey: z.string().min(1).optional(),
});

export const generationConfigSchema = z.discriminatedUnion('provider', [
  extractiveGenerationSchema,
  ollamaGenerationSchema,
  openaiGenerationSchema,
]);

export const cliConfigSchema = z.object({
  embedding: embeddingConfigSchema,
  vectorStore: vectorStoreConfigSchema,
  generation: generationConfigSchema.default({
    provider: 'extractive',
  }),
});

export type CliConfig = z.infer<typeof cliConfigSchema>;
export type EmbeddingConfig = z.infer<typeof embeddingConfigSchema>;
export type VectorStoreConfig = z.infer<typeof vectorStoreConfigSchema>;
export type GenerationConfig = z.infer<typeof generationConfigSchema>;
export type MockEmbeddingConfig = z.infer<typeof mockEmbeddingSchema>;
export type OllamaEmbeddingConfig = z.infer<typeof ollamaEmbeddingSchema>;
export type OpenAIEmbeddingConfig = z.infer<typeof openaiEmbeddingSchema>;
export type OpenAIGenerationConfig = z.infer<typeof openaiGenerationSchema>;
export type MemoryVectorStoreConfig = z.infer<typeof memoryVectorStoreSchema>;
export type PgVectorStoreConfig = z.infer<typeof pgvectorStoreSchema>;

export const DEFAULT_CLI_CONFIG: CliConfig = {
  embedding: {
    provider: 'mock',
    dimension: 8,
  },
  vectorStore: {
    provider: 'memory',
  },
  generation: {
    provider: 'extractive',
  },
};
