import { describe, it, expect } from "vitest";
import { checkAnswer } from "./answer";
import type { Interactive } from "./types";

const it_: Interactive = { stepIndex: 0, answerCell: 40, answerDigit: 4 };

describe("checkAnswer", () => {
  it("accepts the correct cell", () => {
    expect(checkAnswer(it_, 40)).toEqual({ correct: true, digit: 4 });
  });
  it("rejects a wrong cell", () => {
    expect(checkAnswer(it_, 12)).toEqual({ correct: false, digit: 4 });
  });
});
