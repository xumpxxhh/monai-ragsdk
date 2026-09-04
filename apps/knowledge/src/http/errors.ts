import type { NextFunction, Request, Response } from 'express';

/** 与 Agent 客户端对齐的 HTTP 错误体。 */
export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function notFound(message = '资源不存在'): HttpError {
  return new HttpError(404, message, 'not_found');
}

export function badRequest(message: string, code = 'bad_request'): HttpError {
  return new HttpError(400, message, code);
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message, code: err.code });
    return;
  }

  const message = err instanceof Error ? err.message : '服务器内部错误';
  console.error(err);
  res.status(500).json({ message, code: 'internal_error' });
}
