/**
 * 从策略模型输出里抽出 JSON：允许被 markdown 围栏或前后说明文字包住。
 * 解析失败返回 undefined，由调用方决定透传还是抛错。
 */
export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    const objectStart = candidate.indexOf("{");
    const arrayStart = candidate.indexOf("[");
    const start =
      objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart)
        ? objectStart
        : arrayStart;

    if (start < 0) {
      return undefined;
    }

    try {
      return JSON.parse(candidate.slice(start));
    } catch {
      return undefined;
    }
  }
}

function trimQuery(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim();
}

/** 单条改写：优先 JSON `{ query }` / 字符串 / 数组首项，否则取第一行非空文本。 */
export function parseRewrittenQuery(text: string): string | undefined {
  const json = extractJsonValue(text);

  if (typeof json === "string") {
    return trimQuery(json);
  }

  if (json && typeof json === "object" && !Array.isArray(json)) {
    const query = (json as { query?: unknown }).query;
    if (typeof query === "string") {
      return trimQuery(query);
    }
  }

  if (Array.isArray(json) && typeof json[0] === "string") {
    return trimQuery(json[0]);
  }

  const firstLine = text
    .split(/\r?\n/)
    .map((line) => stripListMarker(line))
    .find((line) => line.length > 0 && !line.startsWith("```"));

  return firstLine ? trimQuery(firstLine) : undefined;
}

function collectJsonQueries(json: unknown): string[] {
  if (typeof json === "string") {
    const query = trimQuery(json);
    return query ? [query] : [];
  }

  if (Array.isArray(json)) {
    return json.flatMap((item) =>
      typeof item === "string" ? (trimQuery(item) ? [item.trim()] : []) : [],
    );
  }

  if (json && typeof json === "object") {
    const queries = (json as { queries?: unknown }).queries;
    if (Array.isArray(queries)) {
      return collectJsonQueries(queries);
    }

    const query = (json as { query?: unknown }).query;
    if (typeof query === "string") {
      const trimmed = trimQuery(query);
      return trimmed ? [trimmed] : [];
    }
  }

  return [];
}

/** 多路查询列表：优先 JSON `queries` / 数组，否则按行拆，去掉编号后截断 maxCount。 */
export function parseQueryList(text: string, maxCount: number): string[] {
  const fromJson = collectJsonQueries(extractJsonValue(text));
  const source =
    fromJson.length > 0
      ? fromJson
      : text
          .split(/\r?\n/)
          .map((line) => stripListMarker(line))
          .filter(
            (line) =>
              line.length > 0 &&
              !line.startsWith("```") &&
              line !== "[" &&
              line !== "]",
          );

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const item of source) {
    const normalized = item.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(item);

    if (unique.length >= maxCount) {
      break;
    }
  }

  return unique;
}
