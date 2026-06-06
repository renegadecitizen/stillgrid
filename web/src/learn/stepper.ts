import type { Lesson, Step } from "./types";

export interface Stepper {
  readonly index: number;
  readonly atStart: boolean;
  readonly atEnd: boolean;
  current(): Step;
  next(): boolean;
  prev(): boolean;
  goTo(i: number): void;
  restart(): void;
}

export function createStepper(lesson: Lesson): Stepper {
  const last = lesson.steps.length - 1;
  let i = 0;
  const clamp = (n: number) => Math.max(0, Math.min(last, n));
  return {
    get index() {
      return i;
    },
    get atStart() {
      return i === 0;
    },
    get atEnd() {
      return i === last;
    },
    current() {
      return lesson.steps[i]!;
    },
    next() {
      if (i >= last) return false;
      i += 1;
      return true;
    },
    prev() {
      if (i <= 0) return false;
      i -= 1;
      return true;
    },
    goTo(n: number) {
      i = clamp(n);
    },
    restart() {
      i = 0;
    },
  };
}
