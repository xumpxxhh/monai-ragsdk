/** 各示例共用的默认连接与模型配置；可通过环境变量覆盖。 */
export const EXAMPLE_QUERY =
  "pgvector 是什么？它和 PostgreSQL 是什么关系？";

export const DEFAULT_PGVECTOR_CONNECTION_STRING =
  "postgresql://monai:monai@localhost:5432/monai_ragsdk";

export const DEFAULT_TABLE_NAME = "example_vectors";

export const DEFAULT_EMBEDDING_BASE_URL =
  "https://llm-5vs4jf61x3o1aul1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";

export const DEFAULT_CHAT_BASE_URL = "https://api.deepseek.com";

export const DEFAULT_CHAT_MODEL = "deepseek-v4-flash";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-v3";

export const DEFAULT_EMBEDDING_DIMENSION = 1024;

export type ExampleConfig = {
  connectionString: string;
  tableName: string;
  embeddingBaseUrl: string;
  chatBaseUrl: string;
  chatModel: string;
  embeddingModel: string;
  dimension: number;
  query: string;
};

/** 从环境变量解析示例运行配置；baseUrl 由调用方显式传入，不依赖 SDK 默认厂商地址。 */
export function loadExampleConfig(
  overrides?: Partial<Pick<ExampleConfig, "query">>,
): ExampleConfig {
  return {
    connectionString:
      process.env.PGVECTOR_CONNECTION_STRING?.trim() ||
      DEFAULT_PGVECTOR_CONNECTION_STRING,
    tableName:
      process.env.PGVECTOR_TABLE_NAME?.trim() || DEFAULT_TABLE_NAME,
    embeddingBaseUrl:
      process.env.EMBEDDING_BASE_URL?.trim() || DEFAULT_EMBEDDING_BASE_URL,
    chatBaseUrl:
      process.env.OPENAI_BASE_URL?.trim() || DEFAULT_CHAT_BASE_URL,
    chatModel: process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL,
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    dimension: DEFAULT_EMBEDDING_DIMENSION,
    query: overrides?.query ?? EXAMPLE_QUERY,
  };
}
