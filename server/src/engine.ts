import { spawn } from "node:child_process";
import { resolve } from "node:path";

const ENGINE_DIR =
  process.env.STILLGRID_ENGINE_DIR ??
  resolve(import.meta.dirname, "../../engine/target/release");

const SOLVE_BIN = process.env.STILLGRID_SOLVE_BIN ?? resolve(ENGINE_DIR, "stillgrid-solve");
const GENERATE_BIN =
  process.env.STILLGRID_GENERATE_BIN ?? resolve(ENGINE_DIR, "stillgrid-generate");
const GRADE_BIN = process.env.STILLGRID_GRADE_BIN ?? resolve(ENGINE_DIR, "stillgrid-grade");

export type SolveResult =
  | { outcome: "unique"; solution: string }
  | { outcome: "multiple" }
  | { outcome: "unsolvable" }
  | { outcome: "error"; error: string };

export interface GeneratedPuzzle {
  variant: "classic" | "xsudoku" | "jigsaw" | "killer";
  givens: string;
  solution: string;
  clue_count: number;
  diagonals?: boolean;
  box_of?: number[];
  cages?: Array<{ cells: number[]; sum: number }>;
}

export type VariantKind = "classic" | "xsudoku" | "jigsaw" | "killer";

function runJson<T>(bin: string, args: string[], stdin: string | null, timeoutMs: number): Promise<T> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectP(new Error(`engine timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (err += c.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      rejectP(new Error(`engine spawn failed: ${e.message}`));
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const firstLine = out.split("\n").find((l) => l.trim().length > 0) ?? "";
        resolveP(JSON.parse(firstLine.trim()) as T);
      } catch {
        rejectP(
          new Error(
            `engine produced unparseable output: ${out.slice(0, 200)} (stderr: ${err.slice(0, 200)})`,
          ),
        );
      }
    });
    if (stdin !== null) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

export function solve(puzzle: string, timeoutMs = 5000): Promise<SolveResult> {
  return runJson<SolveResult>(SOLVE_BIN, [puzzle], null, timeoutMs);
}

export function generate(
  opts: { seed?: number; minClues?: number; variant?: VariantKind } = {},
  timeoutMs = 15000,
): Promise<GeneratedPuzzle> {
  const args: string[] = [];
  if (opts.variant) args.push("--variant", opts.variant);
  if (opts.seed !== undefined) args.push("--seed", String(opts.seed));
  if (opts.minClues !== undefined) args.push("--min-clues", String(opts.minClues));
  return runJson<GeneratedPuzzle>(GENERATE_BIN, args, null, timeoutMs);
}

export type Grade =
  | {
      outcome: "solved";
      tier: number;
      tier_label: "easy" | "medium" | "hard" | "diabolical" | "nightmare";
      steps: number;
      technique_counts: Record<string, number>;
    }
  | { outcome: "stuck"; steps_taken: number }
  | { outcome: "error"; error: string };

export function grade(puzzle: string, timeoutMs = 5000): Promise<Grade> {
  return runJson<Grade>(GRADE_BIN, [puzzle], null, timeoutMs);
}
