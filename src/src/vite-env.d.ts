/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `owner/name` of the repository issues are reported to; see `src/lib/issue.ts`. */
  readonly VITE_REPO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
