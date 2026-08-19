/**
 * Thin wrappers around the native engine binaries, for build-time and test use.
 *
 * This is the descendant of the old `server/src/engine.ts`. The server spawned
 * these binaries per request; nothing does that at runtime any more. They are
 * still needed in two places:
 *
 *   - `prerender.ts`, to bake the daily archive at build time.
 *   - the test suite, to pin the sample puzzles baked into the landing pages
 *     against the engine that generated them.
 *
 * Synchronous on purpose: both callers are batch processes, and sync keeps the
 * call sites readable.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { GeneratedPuzzle, Grade, VariantKind } from "./types.js";

const WEB = process.env.STILLGRID_WEB_DIR ?? process.cwd();
export const ENGINE_DIR =
  process.env.STILLGRID_ENGINE_DIR ?? resolve(WEB, "../engine/target/release");

const GENERATE = resolve(ENGINE_DIR, "stillgrid-generate");
const GRADE = resolve(ENGINE_DIR, "stillgrid-grade");
const SOLVE = resolve(ENGINE_DIR, "stillgrid-solve");

/**
 * Whether the native binaries have been built.
 *
 * Tests that spawn them skip when this is false, so a checkout without
 * `cargo build` still runs the rest of the suite instead of failing with
 * ENOENT. CI builds the engine first, so they do run there.
 */
export const HAVE_ENGINE = existsSync(GENERATE) && existsSync(GRADE);

function run<T>(bin: string, args: string[], stdin?: string): T {
  const out = execFileSync(bin, args, {
    input: stdin,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const firstLine = out.split("\n").find((l) => l.trim().length > 0) ?? "";
  return JSON.parse(firstLine.trim()) as T;
}

export interface GenerateOpts {
  variant?: VariantKind;
  size?: number;
  seed?: number;
  minClues?: number;
}

export function generate(opts: GenerateOpts = {}): GeneratedPuzzle {
  const args: string[] = [];
  if (opts.variant) args.push("--variant", opts.variant);
  if (opts.size !== undefined) args.push("--size", String(opts.size));
  if (opts.seed !== undefined) args.push("--seed", String(opts.seed));
  if (opts.minClues !== undefined) args.push("--min-clues", String(opts.minClues));
  return run<GeneratedPuzzle>(GENERATE, args);
}

export interface GradeInput {
  givens: string;
  variant?: VariantKind;
  box_of?: number[];
  cages?: Array<{ cells: number[]; sum: number }>;
}

export function grade(input: string | GradeInput): Grade {
  // A bare classic puzzle goes on argv; the variants need their box/cage
  // layout, which only fits in the JSON stdin form.
  if (typeof input === "string") return run<Grade>(GRADE, [input]);
  return run<Grade>(GRADE, [], JSON.stringify(input));
}

export type SolveResult =
  | { outcome: "unique"; solution: string }
  | { outcome: "multiple" }
  | { outcome: "unsolvable" }
  | { outcome: "error"; error: string };

export function solve(puzzle: string): SolveResult {
  return run<SolveResult>(SOLVE, [puzzle]);
}
