export type ShareVariant = "classic" | "xsudoku" | "jigsaw" | "killer";

export interface ShareInput {
  variant: ShareVariant;
  size: number;
  tier: string; // graded tier_label; unknown/stuck falls back to "easy"
  timeSec: number;
  mistakes: number;
  streak: number;
  isDaily: boolean;
  date: string; // "YYYY-MM-DD"; used only when isDaily
  origin: string; // e.g. "https://stillgrid.app"
}

const SQUARE: Record<ShareVariant, string> = {
  classic: "🟩",
  xsudoku: "🟦",
  killer: "🟧",
  jigsaw: "🟪",
};

const LABEL: Record<ShareVariant, string> = {
  classic: "Classic",
  xsudoku: "X-Sudoku",
  jigsaw: "Jigsaw",
  killer: "Killer",
};

const PIPS: Record<string, string> = {
  easy: "🟩⬜⬜⬜⬜",
  medium: "🟩🟩⬜⬜⬜",
  hard: "🟩🟩🟩⬜⬜",
  diabolical: "🟩🟩🟩🟩⬜",
  nightmare: "🟩🟩🟩🟩🟩",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function mmss(timeSec: number): string {
  const m = Math.floor(timeSec / 60);
  const s = timeSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// "2026-06-18" -> "Jun 18". Parsed by hand to avoid Date() timezone drift;
// returns the input unchanged if it isn't an ISO date.
function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1] ?? "";
  const day = Number(m[3]);
  return `${month} ${day}`.trim();
}

function mistakesPhrase(n: number): string {
  if (n === 0) return "no mistakes";
  if (n === 1) return "1 mistake";
  return `${n} mistakes`;
}

export type EntryParam =
  | { mode: "daily"; variant: "classic" | "killer"; date?: string }
  | { mode: "casual"; variant: ShareVariant; size?: 6 | 9 | 16 };

const DAILY_VARIANTS = ["classic", "killer"] as const;
const CASUAL_VARIANTS = ["classic", "xsudoku", "jigsaw", "killer"] as const;
const ENTRY_SIZES = [6, 9, 16] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseEntryParam(search: string): EntryParam | null {
  const params = new URLSearchParams(search);
  const d = params.get("d");
  if (d && (DAILY_VARIANTS as readonly string[]).includes(d)) {
    const entry: EntryParam = { mode: "daily", variant: d as "classic" | "killer" };
    const date = params.get("date");
    if (date && ISO_DATE.test(date)) entry.date = date;
    return entry;
  }
  const v = params.get("v");
  if (v && (CASUAL_VARIANTS as readonly string[]).includes(v)) {
    const entry: EntryParam = { mode: "casual", variant: v as ShareVariant };
    const size = Number(params.get("size"));
    if ((ENTRY_SIZES as readonly number[]).includes(size)) entry.size = size as 6 | 9 | 16;
    return entry;
  }
  return null;
}

export function buildShareText(input: ShareInput): { body: string; url: string; full: string } {
  const tierKey = PIPS[input.tier] ? input.tier : "easy";
  const pips = PIPS[tierKey]!;
  const tierCap = tierKey.charAt(0).toUpperCase() + tierKey.slice(1);
  const square = SQUARE[input.variant];
  const label = LABEL[input.variant];
  const sizeSuffix = input.size === 9 ? "" : ` ${input.size}×${input.size}`;
  const datePart = input.isDaily && input.date ? ` · ${prettyDate(input.date)}` : "";
  const dailyWord = input.isDaily ? " Daily" : "";
  // Streak flame only for multi-day runs — a single solved day isn't a streak yet.
  const streakPart = input.streak >= 2 ? ` · 🔥${input.streak}` : "";

  const line1 = `${square} Stillgrid${dailyWord} · ${label}${sizeSuffix}${datePart}`;
  const line2 = `${pips} ${tierCap} · ${mmss(input.timeSec)} · ${mistakesPhrase(input.mistakes)}${streakPart}`;
  const dateParam = input.isDaily && ISO_DATE.test(input.date) ? `&date=${input.date}` : "";
  const url = `${input.origin}${input.isDaily ? `/?d=${input.variant}${dateParam}` : `/?v=${input.variant}`}`;
  const body = `${line1}\n${line2}`;
  return { body, url, full: `${body}\n${url}` };
}

export type ShareMethod = "native" | "clipboard" | "manual" | "cancelled";

// Performs the share with progressive enhancement and reports which path ran.
// Side-effect-light: the caller owns the UI feedback + analytics based on the
// returned method. "cancelled" = user dismissed the native sheet (no-op).
export async function shareResult(parts: { body: string; url: string; full: string }): Promise<ShareMethod> {
  const nav: Navigator | undefined = typeof navigator !== "undefined" ? navigator : undefined;

  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({ text: parts.body, url: parts.url });
      return "native";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // any other error → fall through to clipboard
    }
  }

  if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
    try {
      await nav.clipboard.writeText(parts.full);
      return "clipboard";
    } catch {
      // fall through to manual
    }
  }

  if (typeof prompt === "function") {
    prompt("Copy your result:", parts.full);
  }
  return "manual";
}
