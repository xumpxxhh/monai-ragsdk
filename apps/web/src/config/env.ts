/** 环境变量集中读取；业务代码不直接拼接 API 根路径。 */
function toRouterBasename(basePath: string): string {
  if (!basePath || basePath === '/') return '';
  return basePath.replace(/\/$/, '');
}

export const routerBasename = toRouterBasename(import.meta.env.APP_BASE_PATH ?? '/');
export const apiBaseUrl = import.meta.env.APP_API_BASE_URL ?? '/api/v1';
