import type { Chunk, Vector } from "@monai-ragsdk/core";
import type { IndexingResult } from "@monai-ragsdk/indexing";

export type CliCommandName = "ask" | "index" | "runtime" | "init";
export type RuntimeSubcommandName = "answer" | "retrieval";

export type IndexBuildOptions = {
  directoryPath: string;
  chunkSize: number;
  chunkOverlap: number;
  extensions: string[];
  configFilePath?: string;
};

export type AskCommandOptions = IndexBuildOptions & {
  command: "ask";
  query: string;
  topK: number;
  traceFilePath: string;
  debug: boolean;
};

export type IndexCommandOptions = IndexBuildOptions & {
  command: "index";
  indexFilePath: string;
  traceFilePath: string;
  debug: boolean;
};

export type RuntimeCommandOptions = {
  command: "runtime";
  subcommand: RuntimeSubcommandName;
  query: string;
  topK: number;
  indexFilePath: string;
  traceFilePath: string;
  configFilePath?: string;
  debug: boolean;
};

export type InitCommandOptions = {
  command: "init";
  configFilePath?: string;
};

export type CliOptions =
  | AskCommandOptions
  | IndexCommandOptions
  | RuntimeCommandOptions
  | InitCommandOptions;

export type IndexedChunkMap = Map<string, Chunk>;

export type IndexSnapshot = {
  /** Unix 毫秒时间戳；快照落盘用 number，展示时再转 ISO。 */
  createdAt: number;
  directoryPath: string;
  indexingResult: IndexingResult;
  chunks: Chunk[];
  vectors: Vector[];
  embeddingDimension: number;
};
