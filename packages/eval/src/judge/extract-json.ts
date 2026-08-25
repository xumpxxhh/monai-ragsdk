/**
 * 从模型输出抽出 JSON 值：允许 markdown 围栏或前后说明文字。
 * 解析失败返回 undefined，由调用方决定标 unscorable 还是重试。
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
    const objectStart = candidate.indexOf('{');
    const arrayStart = candidate.indexOf('[');
    const start =
      objectStart >= 0 && (arrayStart < 0 || objectStart < arrayStart) ? objectStart : arrayStart;

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
