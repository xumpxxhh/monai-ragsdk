import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

import type {
  CliConfig,
  EmbeddingConfig,
  GenerationConfig,
  VectorStoreConfig,
} from '../../config/schema.js';
import type { InitCommandOptions } from '../../types.js';

const DEFAULT_OPENAI_EMBEDDING_BASE_URL =
  'https://llm-5vs4jf61x3o1aul1.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
const DEFAULT_OPENAI_CHAT_BASE_URL = 'https://api.deepseek.com';

type Question = (prompt: string, defaultValue?: string) => Promise<string>;
type Confirm = (prompt: string, defaultValue?: boolean) => Promise<boolean>;

/** 向量库问答抽出来，避免 openai / ollama / mock 三条路径重复拼 pgvector 字段。 */
async function promptVectorStore(
  question: Question,
  confirm: Confirm,
  defaultProvider: 'pgvector' | 'memory',
): Promise<VectorStoreConfig> {
  const vectorStoreProvider = await question(
    '选择向量存储提供者 (memory / pgvector)',
    defaultProvider,
  );

  if (vectorStoreProvider !== 'pgvector') {
    return {
      provider: 'memory',
    };
  }

  const connectionString = await question(
    'PostgreSQL 连接字符串',
    'postgresql://postgres:password@localhost:5432/ragdb',
  );
  const schema = await question('数据库 schema', 'public');
  const tableName = await question('数据表名', 'rag_vectors');
  const ensureTable = await confirm('是否自动建表', true);

  return {
    provider: 'pgvector',
    connectionString,
    schema,
    tableName,
    ensureTable,
  };
}

export async function runInitCommand(options: InitCommandOptions): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question: Question = (prompt, defaultValue) =>
    new Promise((resolve) => {
      const fullPrompt =
        defaultValue !== undefined ? `${prompt} (${defaultValue}): ` : `${prompt}: `;
      rl.question(fullPrompt, (answer) => {
        resolve(answer.trim() || defaultValue || '');
      });
    });

  const confirm: Confirm = async (prompt, defaultValue = false) => {
    const suffix = defaultValue ? ' (Y/n): ' : ' (y/N): ';
    const answer = await question(prompt + suffix, defaultValue ? 'Y' : 'N');
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  };

  try {
    console.log('🛠️  RAG CLI Config Initialization\n');

    const embeddingProvider = await question(
      '选择嵌入模型提供者 (openai / ollama / mock)',
      'openai',
    );

    let embedding: EmbeddingConfig;
    let vectorStore: VectorStoreConfig;

    if (embeddingProvider === 'openai') {
      const model = await question('OpenAI 兼容模型名称', 'text-embedding-v3');
      const baseUrl = await question('OpenAI 兼容服务地址', DEFAULT_OPENAI_EMBEDDING_BASE_URL);
      const dimensionInput = await question('向量维度', '1024');
      const dimension = Number.parseInt(dimensionInput, 10);

      embedding = {
        provider: 'openai',
        model,
        baseUrl,
        dimension,
      };
      vectorStore = await promptVectorStore(question, confirm, 'pgvector');
    } else if (embeddingProvider === 'ollama') {
      const model = await question('Ollama 模型名称', 'nomic-embed-text:latest');
      const baseUrl = await question('Ollama 服务地址', 'http://localhost:11434');
      const dimensionInput = await question('向量维度', '768');
      const dimension = Number.parseInt(dimensionInput, 10);

      embedding = {
        provider: 'ollama',
        model,
        baseUrl,
        dimension,
      };
      vectorStore = await promptVectorStore(question, confirm, 'pgvector');
    } else {
      const dimensionInput = await question('向量维度', '8');
      const dimension = Number.parseInt(dimensionInput, 10);

      embedding = {
        provider: 'mock',
        dimension,
      };
      vectorStore = await promptVectorStore(question, confirm, 'memory');
    }

    const generationProvider = await question(
      '选择生成模型提供者 (openai / ollama / extractive)',
      'openai',
    );

    let generation: GenerationConfig;

    if (generationProvider === 'openai') {
      const model = await question('OpenAI 兼容对话模型', 'deepseek-v4-flash');
      const baseUrl = await question('OpenAI 兼容对话服务地址', DEFAULT_OPENAI_CHAT_BASE_URL);
      generation = {
        provider: 'openai',
        model,
        baseUrl,
      };
    } else if (generationProvider === 'ollama') {
      const model = await question('Ollama 对话模型名称', 'qwen2.5:latest');
      const baseUrl = await question('Ollama 服务地址', 'http://localhost:11434');
      generation = {
        provider: 'ollama',
        model,
        baseUrl,
      };
    } else {
      generation = {
        provider: 'extractive',
      };
    }

    const configFilePath = path.resolve(
      process.cwd(),
      options.configFilePath ?? './rag-cli.config.json',
    );

    await writeFile(
      configFilePath,
      `${JSON.stringify(
        {
          embedding,
          vectorStore,
          generation,
        } satisfies CliConfig,
        null,
        2,
      )}\n`,
      'utf-8',
    );

    console.log(`\n✅ 配置文件已生成: ${configFilePath}`);
    if (embedding.provider === 'openai') {
      console.log('embedding 请设置 EMBEDDING_API_KEY，不要把密钥写进配置文件。');
    }
    if (generation.provider === 'openai') {
      console.log('ask 请设置 OPENAI_API_KEY，不要把密钥写进配置文件。');
    }
    console.log(
      `\n你可以使用以下命令测试配置:\n  pnpm cli:dev ask --dir ./docs --query "测试问题"`,
    );
  } finally {
    rl.close();
  }
}
