/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_BASE_PATH?: string;
  readonly APP_API_BASE_URL?: string;
  readonly APP_USE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
