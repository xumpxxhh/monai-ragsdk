import type { NextFunction, Request, Response } from 'express';

/** 与 web `ApiErrorBody` 对齐的 HTTP 错误，路由里抛出后由中间件写成 JSON。 */
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

/** 把 async 路由的拒绝交给 Express 错误中间件，避免未处理 Promise。 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void fn(req, res, next).catch(next);
  };
}

/** 统一错误体 `{ message, code }`，与前端 ApiError 解析对齐。 */
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
