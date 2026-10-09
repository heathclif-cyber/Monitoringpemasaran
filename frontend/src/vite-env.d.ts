/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_ISOLATED_PREVIEW?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
