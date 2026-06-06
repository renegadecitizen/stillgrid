import { describe, it, expect } from "vitest";
import { createStepper } from "./stepper";
import type { Lesson } from "./types";

const lesson: Lesson = {
  id: "t",
  title: "t",
  size: 9,
  steps: [
    { caption: "a", grid: Array(81).fill({}), highlights: [] },
    { caption: "b", grid: Array(81).fill({}), highlights: [] },
    { caption: "c", grid: Array(81).fill({}), highlights: [] },
  ],
};

describe("createStepper", () => {
  it("starts at 0", () => {
    const s = createStepper(lesson);
    expect(s.index).toBe(0);
    expect(s.atStart).toBe(true);
    expect(s.atEnd).toBe(false);
  });

  it("advances and clamps at the end", () => {
    const s = createStepper(lesson);
    expect(s.next()).toBe(true);
    expect(s.index).toBe(1);
    s.next();
    expect(s.atEnd).toBe(true);
    expect(s.next()).toBe(false); // no-op past the end
    expect(s.index).toBe(2);
  });

  it("goes back and clamps at the start", () => {
    const s = createStepper(lesson);
    s.next();
    expect(s.prev()).toBe(true);
    expect(s.index).toBe(0);
    expect(s.prev()).toBe(false);
  });

  it("restart returns to 0", () => {
    const s = createStepper(lesson);
    s.next();
    s.next();
    s.restart();
    expect(s.index).toBe(0);
  });

  it("goTo clamps to range and floors fractional input", () => {
    const s = createStepper(lesson);
    s.goTo(1);
    expect(s.index).toBe(1);
    s.goTo(99);
    expect(s.index).toBe(2); // clamped to last
    s.goTo(-5);
    expect(s.index).toBe(0); // clamped to start
    s.goTo(1.7);
    expect(s.index).toBe(1); // floored
  });

  it("current() returns the step at the index", () => {
    const s = createStepper(lesson);
    s.next();
    expect(s.current().caption).toBe("b");
  });
});
