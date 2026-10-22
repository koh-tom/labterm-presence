import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";

export const DEFAULT_TZ = "Asia/Tokyo";

// "2026-10-22" のその日の 0:00 (UNIX秒)
export function dayStart(date: string, tz = DEFAULT_TZ): number {
  const [y, m, d] = date.split("-").map(Number);
  return new TZDate(y ?? 0, (m ?? 1) - 1, d ?? 1, 0, 0, 0, tz).getTime() / 1000;
}

export function dateOf(epoch: number, tz = DEFAULT_TZ): string {
  return format(new TZDate(epoch * 1000, tz), "yyyy-MM-dd");
}

export function nextDate(date: string, days = 1, tz = DEFAULT_TZ): string {
  return format(addDays(new TZDate(dayStart(date, tz) * 1000, tz), days), "yyyy-MM-dd");
}

// from から to まで (両端を含む) の日付
export function datesBetween(from: string, to: string, tz = DEFAULT_TZ): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = nextDate(d, 1, tz)) out.push(d);
  return out;
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}
