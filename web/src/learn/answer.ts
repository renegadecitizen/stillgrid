import type { Interactive } from "./types";

export interface AnswerResult {
  correct: boolean;
  digit: number;
}

export function checkAnswer(interactive: Interactive, clickedCell: number): AnswerResult {
  return { correct: clickedCell === interactive.answerCell, digit: interactive.answerDigit };
}
