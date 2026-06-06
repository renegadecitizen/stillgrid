import "./learn.css";
import { LESSONS } from "./lessons";
import { mountLesson } from "./widget";

document.querySelectorAll<HTMLElement>("[data-lesson]").forEach((el) => {
  const id = el.getAttribute("data-lesson");
  const lesson = LESSONS.find((l) => l.id === id);
  if (lesson) mountLesson(el, lesson);
});
