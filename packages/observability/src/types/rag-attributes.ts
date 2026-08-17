import type { JsonValue } from "@monai-ragsdk/core";

export type RAGAttributes = Record<string, JsonValue>;

export type RAGTagValue = string | number | boolean;

export type RAGTags = Record<string, RAGTagValue>;
