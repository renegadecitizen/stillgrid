type EventName =
  | "puzzle_started"
  | "puzzle_completed"
  | "puzzle_abandoned"
  | "daily_streak_milestone"
  | "first_visit_ever"
  | "tier_unmatched";

type EventProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, opts?: { props?: EventProps }) => void;
  }
}

export function track(event: EventName, props?: EventProps): void {
  if (!import.meta.env.PROD) return;
  if (typeof window.plausible !== "function") return;
  window.plausible(event, props ? { props } : undefined);
}
