/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TIME_ZONE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
