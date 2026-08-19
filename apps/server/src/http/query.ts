import { badRequest } from './errors.js';

export function readQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

export function readQueryInt(value: unknown, fallback: number): number {
  const raw = readQueryString(value);
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`无效的整数参数: ${raw}`);
  }
  return parsed;
}
