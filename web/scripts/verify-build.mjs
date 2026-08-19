/**
 * Post-build verification.
 *
 * The interesting part is not the file checks — it's that this instantiates the
 * compiled WebAssembly engine and compares its output, byte for byte, against
 * the native binaries for the same seeds.
 *
 * That matters because the site now depends on an equivalence that nothing else
 * enforces at runtime: the daily archive pages are pre-rendered by the *native*
 * engine at build time, while the puzzle a visitor actually plays is generated
 * by the *WebAssembly* engine in their browser. Both come from the same Rust
 * source, but "same source" is not the same as "same bytes out" — a difference
 * in integer width, allocator behaviour, or float formatting would produce a
 * site that quietly contradicts its own indexed pages.
 *
 * This also exercises the hand-written JS ABI in `src/engine/wasm.ts` (alloc,
 * length-prefixed reads, free) against the real module, which is otherwise only
 * covered by the Rust-side round-trip tests.
 *
 * Run from web/ after a full build.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const WEB = process.cwd();
const ROOT = resolve(WEB, "..");
const DIST = resolve(WEB, "dist");
const ENGINE_DIR = process.env.STILLGRID_ENGINE_DIR ?? resolve(ROOT, "engine/target/release");

let failures = 0;
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  failures++;
};
const pass = (msg) => console.log(`  ok    ${msg}`);

function check(name, fn) {
  try {
    const detail = fn();
    pass(detail ? `${name} — ${detail}` : name);
  } catch (e) {
    fail(`${name}: ${e.message}`);
  }
}

// --- structural checks ------------------------------------------------------

console.log("build output:");

check("SPA entry exists", () => {
  if (!existsSync(resolve(DIST, "index.html"))) throw new Error("dist/index.html missing");
});

const wasmPath = check_wasm();
function check_wasm() {
  const assets = resolve(DIST, "assets");
  const found = existsSync(assets)
    ? readdirSync(assets).filter((f) => f.endsWith(".wasm"))
    : [];
  if (found.length !== 1) {
    fail(`expected exactly one .wasm in dist/assets, found ${found.length}`);
    return null;
  }
  const p = resolve(assets, found[0]);
  const kb = (readFileSync(p).length / 1024).toFixed(0);
  pass(`engine emitted as a hashed asset — ${found[0]} (${kb} KB)`);
  return p;
}

check("routing config shipped", () => {
  for (const f of ["_headers", "_redirects"]) {
    if (!existsSync(resolve(DIST, f))) throw new Error(`dist/${f} missing`);
  }
  const redirects = readFileSync(resolve(DIST, "_redirects"), "utf8");
  // Every /learn/* URL the old server served must still resolve.
  for (const slug of [
    "core",
    "advanced",
    "variants",
    "xy-wing",
    "swordfish",
    "coloring",
    "forcing-chains",
  ]) {
    if (!redirects.includes(`/learn/${slug}`)) {
      throw new Error(`/learn/${slug} has no rewrite rule`);
    }
  }
  return "all /learn/* rewrites present";
});

check("daily archive pre-rendered", () => {
  const idx = resolve(DIST, "daily/index.html");
  if (!existsSync(idx)) throw new Error("dist/daily/index.html missing");
  const classic = readdirSync(resolve(DIST, "daily/classic")).filter((f) => f.endsWith(".html"));
  const killer = readdirSync(resolve(DIST, "daily/killer")).filter((f) => f.endsWith(".html"));
  if (classic.length !== killer.length) {
    throw new Error(`asymmetric archive: ${classic.length} classic vs ${killer.length} killer`);
  }
  if (classic.length < 30) throw new Error(`only ${classic.length} dates rendered`);
  return `${classic.length + killer.length} pages`;
});

check("sitemap includes the archive", () => {
  const xml = readFileSync(resolve(DIST, "sitemap.xml"), "utf8");
  const dailyUrls = (xml.match(/\/daily\//g) ?? []).length;
  if (dailyUrls < 30) throw new Error(`only ${dailyUrls} daily URLs in sitemap`);
  // A double-merge would duplicate every URL; make sure that didn't happen.
  const urls = xml.match(/<loc>([^<]+)<\/loc>/g) ?? [];
  const unique = new Set(urls);
  if (urls.length !== unique.size) {
    throw new Error(`sitemap has ${urls.length - unique.size} duplicate URLs`);
  }
  return `${urls.length} unique URLs`;
});

check("16×16 pool shipped", () => {
  const p = resolve(DIST, "pool-16.json");
  if (!existsSync(p)) throw new Error("dist/pool-16.json missing");
  const pool = JSON.parse(readFileSync(p, "utf8"));
  for (const variant of ["classic", "xsudoku"]) {
    const rows = pool[variant] ?? [];
    if (rows.length < 10) throw new Error(`${variant} pool has only ${rows.length} puzzles`);
    for (const row of rows) {
      if (row.givens.length !== 256 || row.solution.length !== 256) {
        throw new Error(`${variant} pool has a malformed 16×16 entry`);
      }
      if (row.grade?.outcome !== "solved") {
        throw new Error(`${variant} pool contains an ungradeable puzzle`);
      }
    }
  }
  return `classic ${pool.classic.length}, xsudoku ${pool.xsudoku.length}`;
});

// --- the engine equivalence check -------------------------------------------

console.log("\nwasm engine vs native engine:");

if (wasmPath) {
  try {
    await verifyEngine(wasmPath);
  } catch (e) {
    // A module that won't even instantiate should read as a failed check, not
    // as a crashed script.
    fail(`could not run the wasm engine: ${e.message}`);
  }
} else {
  fail("skipping engine checks — no .wasm found");
}

async function verifyEngine(path) {
  const { instance } = await WebAssembly.instantiate(readFileSync(path), {});
  const ex = instance.exports;

  for (const sym of [
    "memory",
    "sg_alloc",
    "sg_free",
    "sg_result_free",
    "sg_generate",
    "sg_solve",
    "sg_grade",
  ]) {
    if (!(sym in ex)) {
      fail(`the wasm module does not export ${sym}`);
      return;
    }
  }
  pass("exports the full ABI");

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // Mirrors src/engine/wasm.ts exactly — if the loader logic is wrong, it is
  // wrong here too and these comparisons fail.
  const write = (s) => {
    const bytes = enc.encode(s);
    const ptr = ex.sg_alloc(bytes.length);
    new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
    return { ptr, len: bytes.length };
  };
  const read = (ptr) => {
    const len = new DataView(ex.memory.buffer).getUint32(ptr, true);
    const bytes = new Uint8Array(ex.memory.buffer, ptr + 4, len).slice();
    ex.sg_result_free(ptr);
    return dec.decode(bytes);
  };
  const wasmGenerate = (variant, size, minClues, seed) => {
    const v = write(variant);
    try {
      return read(ex.sg_generate(v.ptr, v.len, size, minClues, BigInt(seed)));
    } finally {
      ex.sg_free(v.ptr, v.len);
    }
  };
  const wasmCall = (fn, input) => {
    const i = write(input);
    try {
      return read(fn(i.ptr, i.len));
    } finally {
      ex.sg_free(i.ptr, i.len);
    }
  };

  const native = (bin, args, stdin) =>
    execFileSync(resolve(ENGINE_DIR, bin), args, {
      input: stdin,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }).trim();

  // Generation must agree for the same seed across every variant. This is the
  // property the pre-rendered daily pages depend on.
  const cases = [
    ["classic", 9, 28, 20260819001],
    ["killer", 9, 28, 20260819002],
    ["xsudoku", 9, 28, 4242],
    ["jigsaw", 9, 28, 777],
    ["classic", 6, 28, 31337],
  ];
  let agreed = 0;
  for (const [variant, size, minClues, seed] of cases) {
    const w = wasmGenerate(variant, size, minClues, seed);
    const n = native("stillgrid-generate", [
      "--variant",
      variant,
      "--size",
      String(size),
      "--seed",
      String(seed),
      "--min-clues",
      String(minClues),
    ]);
    if (w !== n) {
      fail(
        `generate(${variant}, ${size}×${size}, seed ${seed}) differs\n` +
          `        wasm:   ${w.slice(0, 120)}\n` +
          `        native: ${n.slice(0, 120)}`,
      );
    } else {
      agreed++;
    }
  }
  if (agreed === cases.length) pass(`generate agrees on all ${cases.length} seeded cases`);

  // Solve and grade over a puzzle the wasm side just produced.
  const puzzle = JSON.parse(wasmGenerate("classic", 9, 28, 12345)).givens;
  const wSolve = wasmCall(ex.sg_solve, puzzle);
  const nSolve = native("stillgrid-solve", [puzzle]);
  if (wSolve !== nSolve) fail(`solve differs\n        wasm: ${wSolve}\n        native: ${nSolve}`);
  else pass("solve agrees");

  const wGrade = wasmCall(ex.sg_grade, puzzle);
  const nGrade = native("stillgrid-grade", [puzzle]);
  if (wGrade !== nGrade) fail(`grade differs\n        wasm: ${wGrade}\n        native: ${nGrade}`);
  else pass("grade agrees");

  // Malformed input must come back as an error payload. A panic would trap and
  // poison the module for the rest of the page's life, so this is load-bearing.
  const bad = wasmCall(ex.sg_grade, "not a puzzle");
  if (!bad.includes('"outcome":"error"')) fail(`malformed input did not return an error: ${bad}`);
  else pass("malformed input returns an error instead of trapping");

  // The module must survive that error and keep working.
  const after = wasmCall(ex.sg_solve, puzzle);
  if (after !== nSolve) fail("engine is unusable after an error payload");
  else pass("engine still works after an error");
}

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("all checks passed");
