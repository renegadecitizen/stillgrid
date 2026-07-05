type EventName =
  | "puzzle_started"
  | "puzzle_completed"
  | "puzzle_abandoned"
  | "daily_streak_milestone"
  | "first_visit_ever"
  | "tier_unmatched"
  | "puzzle_shared";

type EventProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track: (event: string, data?: EventProps) => void };
  }
}

export function track(event: EventName, props?: EventProps): void {
  if (!import.meta.env.PROD) return;
  const umami = window.umami;
  if (!umami || typeof umami.track !== "function") return;
  umami.track(event, props);
}
