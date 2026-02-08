/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_LLM_BACKEND_URL?: string;
  readonly VITE_LLM_BACKEND_TOKEN?: string;
  readonly VITE_WORD_SYNC_URL?: string;
  readonly VITE_WORD_SYNC_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
