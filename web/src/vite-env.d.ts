/// <reference types="vite/client" />

interface ImportMetaEnv {
  // VITE_DEMO used to switch the app onto a static pool of pre-baked puzzles
  // so it could run without the API server. The engine now runs in the page in
  // every environment, so there is nothing left to stub out.
  readonly _unused?: never;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// The engine is imported as a URL so Vite content-hashes it; the built-in
// client types don't cover `?url` on .wasm.
declare module "*.wasm?url" {
  const src: string;
  export default src;
}
