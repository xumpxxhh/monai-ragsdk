import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

import type { CliConfig } from "../../config/schema.js";
import type { InitCommandOptions } from "../../types.js";

export async function runInitCommand(
  options: InitCommandOptions,
): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string, defaultValue?: string): Promise<string> =>
    new Promise((resolve) => {
      const fullPrompt =
        defaultValue !== undefined ? `${prompt} (${defaultValue}): ` : `${prompt}: `;
      rl.question(fullPrompt, (answer) => {
        resolve(answer.trim() || defaultValue || "");
      });
    });

  const confirm = async (prompt: string, defaultValue = false): Promise<boolean> => {
    const suffix = defaultValue ? " (Y/n): " : " (y/N): ";
    const answer = await question(prompt + suffix, defaultValue ? "Y" : "N");
    return answer.toLowerCase() === "y" || answer.toLowerCase() === "yes";
  };

  try {
    console.log("🛠️  RAG CLI Config Initialization\n");

    const embeddingProvider = await question(
      "选择嵌入模型提供者 (mock / ollama)",
      "ollama",
    );

    let config: CliConfig;

    if (embeddingProvider === "ollama") {
      const model = await question("Ollama 模型名称", "nomic-embed-text:latest");
      const baseUrl = await question("Ollama 服务地址", "http://localhost:11434");
      const dimensionInput = await question("向量维度", "768");
      const dimension = Number.parseInt(dimensionInput, 10);

      const vectorStoreProvider = await question(
        "选择向量存储提供者 (memory / pgvector)",
        "pgvector",
      );

      if (vectorStoreProvider === "pgvector") {
        const connectionString = await question(
          "PostgreSQL 连接字符串",
          "postgresql://postgres:password@localhost:5432/ragdb",
        );
        const schema = await question("数据库 schema", "public");
        const tableName = await question("数据表名", "rag_vectors");
        const ensureTable = await confirm("是否自动建表", true);

        config = {
          embedding: {
            provider: "ollama",
            model,
            baseUrl,
            dimension,
          },
          vectorStore: {
            provider: "pgvector",
            connectionString,
            schema,
            tableName,
            ensureTable,
          },
        };
      } else {
        config = {
          embedding: {
            provider: "ollama",
            model,
            baseUrl,
            dimension,
          },
          vectorStore: {
            provider: "memory",
          },
        };
      }
    } else {
      const dimensionInput = await question("向量维度", "8");
      const dimension = Number.parseInt(dimensionInput, 10);

      const vectorStoreProvider = await question(
        "选择向量存储提供者 (memory / pgvector)",
        "memory",
      );

      if (vectorStoreProvider === "pgvector") {
        const connectionString = await question(
          "PostgreSQL 连接字符串",
          "postgresql://postgres:password@localhost:5432/ragdb",
        );
        const schema = await question("数据库 schema", "public");
        const tableName = await question("数据表名", "rag_vectors");
        const ensureTable = await confirm("是否自动建表", true);

        config = {
          embedding: {
            provider: "mock",
            dimension,
          },
          vectorStore: {
            provider: "pgvector",
            connectionString,
            schema,
            tableName,
            ensureTable,
          },
        };
      } else {
        config = {
          embedding: {
            provider: "mock",
            dimension,
          },
          vectorStore: {
            provider: "memory",
          },
        };
      }
    }

    const configFilePath = path.resolve(
      process.cwd(),
      options.configFilePath ?? "./rag-cli.config.json",
    );

    await writeFile(
      configFilePath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf-8",
    );

    console.log(`\n✅ 配置文件已生成: ${configFilePath}`);
    console.log(
      `\n你可以使用以下命令测试配置:\n  pnpm cli:dev ask --dir ./docs --query "测试问题"`,
    );
  } finally {
    rl.close();
  }
}
