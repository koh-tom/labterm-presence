import { TZDate } from "@date-fns/tz";

// 秒 → "6:34"
export function hm(sec: number): string {
  const m = Math.floor(sec / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

// UNIX秒 → "9:18"
export function clock(epoch: number, tz: string): string {
  const d = new TZDate(epoch * 1000, tz);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const WDAY = ["日", "月", "火", "水", "木", "金", "土"];

export function weekday(date: string): string {
  return WDAY[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? "";
}

export function isWeekend(date: string): boolean {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

// "2026-10-22" → "10/22"
export function md(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}
