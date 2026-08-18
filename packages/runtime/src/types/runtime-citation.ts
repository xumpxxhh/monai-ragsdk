/**
 * 一次查询的 grounding 引用。
 * 与 core RAGCitation 同构：按 post-retrieval 选出的 chunks 顺序编号。
 * run / runStream / search 共用同一套编号规则。
 */
export type { RAGCitation as RuntimeCitation } from "@monai-ragsdk/core";
