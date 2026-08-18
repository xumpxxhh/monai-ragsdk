import type { JsonValue } from "@monai-ragsdk/core";

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return Object.getPrototypeOf(value) === Object.prototype;
};

export const normalizeJsonValue = (value: unknown): JsonValue | undefined => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    // Date 一旦进入 metadata / JSON 就会跨包流通；统一成毫秒时间戳，避免 ISO 字符串混入存储。
    return value.getTime();
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const normalizedItem = normalizeJsonValue(item);
      return normalizedItem === undefined ? [] : [normalizedItem];
    });
  }

  if (isPlainObject(value)) {
    const normalizedEntries = Object.entries(value).flatMap(([key, item]) => {
      const normalizedItem = normalizeJsonValue(item);
      return normalizedItem === undefined
        ? []
        : [[key, normalizedItem] as const];
    });

    return Object.fromEntries(normalizedEntries);
  }

  return undefined;
};

export const normalizeJsonObject = (
  value: Record<string, unknown> | undefined,
): Record<string, JsonValue> | undefined => {
  if (!value) {
    return undefined;
  }

  const normalizedValue = normalizeJsonValue(value);

  if (
    typeof normalizedValue !== "object" ||
    normalizedValue === null ||
    Array.isArray(normalizedValue)
  ) {
    return undefined;
  }

  if (Object.keys(normalizedValue).length === 0) {
    return undefined;
  }

  return normalizedValue;
};

export const mergeJsonObjects = (
  ...values: Array<Record<string, JsonValue> | undefined>
): Record<string, JsonValue> | undefined => {
  const merged = Object.assign({}, ...values.filter(Boolean));

  if (Object.keys(merged).length === 0) {
    return undefined;
  }

  return merged;
};