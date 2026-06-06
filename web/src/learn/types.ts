export type HighlightKind = "unit" | "target" | "elim" | "place";

export interface Highlight {
  cells: number[]; // flat indices into the size×size grid
  kind: HighlightKind;
}

export interface Cell {
  given?: number; // a clue/solved digit shown filled
  value?: number; // a digit placed by this step (animated "place")
  cands?: number[]; // pencil-mark candidates
}

export interface Step {
  caption: string;
  grid: Cell[]; // length === size*size
  highlights: Highlight[];
}

export interface Interactive {
  stepIndex: number; // which step accepts a click
  answerCell: number; // the correct cell index
  answerDigit: number; // the digit the learner should identify
}

export interface Lesson {
  id: string; // matches a data-lesson attribute in learn.html
  title: string;
  size: 6 | 9 | 16;
  steps: Step[];
  interactive?: Interactive;
}
