// daemon と Web でやりとりする形。集計は daemon でもデモでも同じ関数で作る
import { dateOf } from "./time.ts";
import {
  buildSegments,
  hourRange,
  splitByDay,
  splitFocusByDay,
  summarizeDay,
  summarizeRange,
} from "./timeline.ts";
import type {
  DailySummary,
  FocusSession,
  PresenceEvent,
  PresenceState,
  RangeSummary,
  Segment,
} from "./types.ts";

export type DayData = {
  date: string;
  segments: Segment[];
  focus: FocusSession[];
  summary: DailySummary;
};

export type PresenceRange = {
  from: string;
  to: string;
  now: number;
  tz: string;
  hours: [number, number];
  days: DayData[];
  range: RangeSummary;
  today: DailySummary;
};

export type DeviceState = "connected" | "disconnected" | "paused";
export type SyncState = "ok" | "syncing" | "required";

export type Status = {
  now: number;
  device: { state: DeviceState; fw: string | null; lastSeenAt: number | null };
  presence: { state: PresenceState; since: number | null };
  sync: { state: SyncState; lastSyncAt: number | null };
};

export const MAX_RANGE_DAYS = 366;

export function buildRange(
  events: PresenceEvent[],
  from: string,
  to: string,
  now: number,
  tz: string,
  focus: FocusSession[] = [],
): PresenceRange {
  const segs = buildSegments(events);
  const byDay = splitByDay(segs, from, to, now, tz);
  const focusByDay = splitFocusByDay(focus, from, to, tz);
  const days: DayData[] = [...byDay].map(([date, segments]) => {
    const f = focusByDay.get(date) ?? [];
    return { date, segments, focus: f, summary: summarizeDay(date, segments, now, f) };
  });

  const today = dateOf(now, tz);
  const todaySegs = splitByDay(segs, today, today, now, tz).get(today) ?? [];
  const todayFocus = splitFocusByDay(focus, today, today, tz).get(today) ?? [];

  return {
    from,
    to,
    now,
    tz,
    hours: hourRange(byDay, tz),
    days,
    range: summarizeRange(days.map((d) => d.summary)),
    today: summarizeDay(today, todaySegs, now, todayFocus),
  };
}

// 今の状態 (最後の有効なイベント)
export function currentState(events: PresenceEvent[]): {
  state: PresenceState;
  since: number | null;
} {
  const segs = buildSegments(events);
  const last = segs.at(-1);
  if (last && last.end === null) return { state: last.state, since: last.start };
  return { state: "out", since: last?.end ?? null };
}
