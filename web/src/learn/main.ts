import "./learn.css";
import { LESSONS } from "./lessons";
import { mountLesson } from "./widget";
import { mountGuided } from "./guidedWidget";

document.querySelectorAll<HTMLElement>("[data-lesson]").forEach((el) => {
  const id = el.getAttribute("data-lesson");
  const lesson = LESSONS.find((l) => l.id === id);
  if (lesson) mountLesson(el, lesson);
});

const guidedHost = document.querySelector<HTMLElement>("[data-guided]");
if (guidedHost) mountGuided(guidedHost);
