import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, endOfMonth, format, startOfMonth, startOfWeek } from "date-fns";

export type Preset = "week" | "month" | "3m" | "custom";
export type Range = { preset: Preset; from: string; to: string };

const fmt = (d: Date) => format(d, "yyyy-MM-dd");
const parse = (s: string, tz: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new TZDate(y ?? 2000, (m ?? 1) - 1, d ?? 1, tz);
};

export function presetRange(preset: Exclude<Preset, "custom">, base: Date): Range {
  if (preset === "week") {
    const s = startOfWeek(base, { weekStartsOn: 1 });
    return { preset, from: fmt(s), to: fmt(addDays(s, 6)) };
  }
  if (preset === "month") {
    return { preset, from: fmt(startOfMonth(base)), to: fmt(endOfMonth(base)) };
  }
  const s = startOfMonth(addMonths(base, -2));
  return { preset, from: fmt(s), to: fmt(endOfMonth(base)) };
}

// ‹ › で同じ長さだけずらす
export function shiftRange(r: Range, dir: -1 | 1, tz: string): Range {
  const from = parse(r.from, tz);
  if (r.preset === "week") return presetRange("week", addDays(from, 7 * dir));
  if (r.preset === "month") return presetRange("month", addMonths(from, dir));
  if (r.preset === "3m") return presetRange("3m", addMonths(parse(r.to, tz), 3 * dir));
  const to = parse(r.to, tz);
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  return {
    preset: "custom",
    from: fmt(addDays(from, days * dir)),
    to: fmt(addDays(to, days * dir)),
  };
}

export function rangeLabel(r: Range): string {
  const [fy, fm, fd] = r.from.split("-").map(Number);
  const [ty, tm, td] = r.to.split("-").map(Number);
  if (r.preset === "month") return `${fy}年${fm}月`;
  if (r.preset === "3m") return `${fy}年${fm}月 – ${fy === ty ? "" : `${ty}年`}${tm}月`;
  return `${fy}年${fm}/${fd} – ${fy === ty ? "" : `${ty}年`}${tm}/${td}`;
}

// URL の ?from=&to=&p= と同期する
export function readUrl(now: Date): Range {
  const q = new URLSearchParams(location.search);
  const p = q.get("p") as Preset | null;
  const from = q.get("from");
  const to = q.get("to");
  if (p && from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { preset: p, from, to };
  }
  return presetRange("month", now);
}

export function writeUrl(r: Range) {
  const q = new URLSearchParams(location.search);
  q.set("p", r.preset);
  q.set("from", r.from);
  q.set("to", r.to);
  history.replaceState(null, "", `?${q}`);
}
