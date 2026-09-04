import type { NextFunction, Request, Response } from 'express';

/**
 * 请求访问日志：记录路由、query、body 入参，以及结束时的状态码与耗时。
 * 不引入第三方 logger；控制台一行 JSON，便于本地联调与 Agent 排障。
 */
export function requestLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  const method = req.method;
  const path = req.originalUrl.split('?')[0] ?? req.path;

  // health 探活太吵，默认跳过入参行；结束时仍可看失败状态
  const skipBody = path === '/health' || method === 'OPTIONS';

  if (!skipBody) {
    console.log(
      JSON.stringify({
        type: 'request',
        method,
        path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        body: sanitizeBody(req.body),
        at: new Date().toISOString(),
      }),
    );
  }

  res.on('finish', () => {
    if (skipBody && res.statusCode < 400) {
      return;
    }

    console.log(
      JSON.stringify({
        type: 'response',
        method,
        path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        at: new Date().toISOString(),
      }),
    );
  });

  next();
}

/** 避免日志里塞进超长无关字段；只保留业务入参形状。 */
function sanitizeBody(body: unknown): unknown {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    return body;
  }

  const record = body as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && value.length > 500) {
      next[key] = `${value.slice(0, 500)}…(${value.length} chars)`;
    } else {
      next[key] = value;
    }
  }
  return next;
}
