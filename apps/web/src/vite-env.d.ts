/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_BASE_PATH?: string;
  readonly APP_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
