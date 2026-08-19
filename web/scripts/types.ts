// Shared shapes for the build-time renderer. These mirror the JSON emitted by
// the engine binaries (see engine/src/wire.rs), which is the same JSON the
// WebAssembly build returns in the browser.

export type VariantKind = "classic" | "xsudoku" | "jigsaw" | "killer";

export interface GeneratedPuzzle {
  variant: VariantKind;
  givens: string;
  solution: string;
  clue_count: number;
  size?: number;
  diagonals?: boolean;
  box_of?: number[];
  cages?: Array<{ cells: number[]; sum: number }>;
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
