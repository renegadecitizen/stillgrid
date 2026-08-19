/**
 * Copy the compiled engine into `src/engine/` so Vite treats it as an asset:
 * it gets a content hash in the filename, which lets it be cached immutably
 * and busts correctly whenever the engine changes.
 *
 * Run after `cargo build --release --lib --target wasm32-unknown-unknown` and
 * before `vite build`.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, "..");
const ROOT = resolve(WEB, "..");

const SRC = resolve(
  ROOT,
  "engine/target/wasm32-unknown-unknown/release/stillgrid_engine.wasm",
);
const DEST = resolve(WEB, "src/engine/stillgrid-engine.wasm");

if (!existsSync(SRC)) {
  console.error(
    `error: ${SRC} not found.\n` +
      "Build it first:\n" +
      "  rustup target add wasm32-unknown-unknown\n" +
      "  cd engine && cargo build --release --lib --target wasm32-unknown-unknown",
  );
  process.exit(1);
}

mkdirSync(dirname(DEST), { recursive: true });
copyFileSync(SRC, DEST);

const kb = (statSync(DEST).size / 1024).toFixed(0);
console.log(`engine → src/engine/stillgrid-engine.wasm (${kb} KB)`);
