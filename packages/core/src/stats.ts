// 統計タブ用の集計
import { dateOf, datesBetween, dayStart, nextDate } from "./time.ts";
import {
  buildSegments,
  LAB_DAY_MIN_SEC,
  splitByDay,
  splitFocusByDay,
  summarizeDay,
} from "./timeline.ts";
import type { DailySummary, FocusSession, PresenceEvent } from "./types.ts";

export type PeriodStats = {
  from: string;
  to: string;
  totalSec: number;
  focusSec: number;
  labDays: number;
  averageSec: number;
  avgArrival: number | null; // 0時からの秒
  avgDeparture: number | null;
};

export type WeekdayStats = {
  weekday: number; // 0=月 ... 6=日
  days: number;
  labDays: number;
  avgSec: number;
  avgArrival: number | null;
  avgDeparture: number | null;
};

export type Stats = {
  current: PeriodStats;
  previous: PeriodStats;
  // 曜日(月始まり)×時(0-23) ごとの、その時間にいた割合 (0..1)
  heat: number[][];
  weekdays: WeekdayStats[];
  weeks: { start: string; sec: number }[]; // 直近12週 (月曜始まり)
  months: { month: string; sec: number }[]; // 直近12か月
};

const mean = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
const mondayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

type Ctx = {
  segs: ReturnType<typeof buildSegments>;
  focus: FocusSession[];
  now: number;
  tz: string;
};

function daily(ctx: Ctx, from: string, to: string): DailySummary[] {
  const byDay = splitByDay(ctx.segs, from, to, ctx.now, ctx.tz);
  const fByDay = splitFocusByDay(ctx.focus, from, to, ctx.tz);
  return [...byDay].map(([d, s]) => summarizeDay(d, s, ctx.now, fByDay.get(d) ?? []));
}

function period(ctx: Ctx, from: string, to: string): PeriodStats {
  const days = daily(ctx, from, to);
  const lab = days.filter((d) => d.presenceSec >= LAB_DAY_MIN_SEC);
  const totalSec = days.reduce((a, d) => a + d.presenceSec, 0);
  return {
    from,
    to,
    totalSec,
    focusSec: days.reduce((a, d) => a + d.focusSec, 0),
    labDays: lab.length,
    averageSec: lab.length ? Math.round(totalSec / lab.length) : 0,
    avgArrival: mean(
      lab
        .filter((d) => d.firstArrival !== null)
        .map((d) => (d.firstArrival as number) - dayStart(d.date, ctx.tz)),
    ),
    avgDeparture: mean(
      lab
        .filter((d) => d.lastDeparture !== null)
        .map((d) => (d.lastDeparture as number) - dayStart(d.date, ctx.tz)),
    ),
  };
}

export function buildStats(
  events: PresenceEvent[],
  focus: FocusSession[],
  from: string,
  to: string,
  now: number,
  tz: string,
): Stats {
  const ctx: Ctx = { segs: buildSegments(events), focus, now, tz };
  const today = dateOf(now, tz);

  // 今日を含む期間は、今日までの日数で前の期間と比べる
  const len = datesBetween(from, to, tz).length;
  const curTo = today >= from && today < to ? today : to;
  const used = datesBetween(from, curTo, tz).length;
  const prevFrom = nextDate(from, -len, tz);
  const prevTo = nextDate(prevFrom, used - 1, tz);

  // 曜日×時間 (未来の日は入れない)
  const pastTo = curTo < today ? curTo : today;
  const heatSec = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const heatDays = new Array<number>(7).fill(0);
  const byWeekday: DailySummary[][] = Array.from({ length: 7 }, () => []);
  if (from <= pastTo) {
    const byDay = splitByDay(ctx.segs, from, pastTo, now, tz);
    for (const [date, segs] of byDay) {
      const w = mondayIndex(date);
      heatDays[w] = (heatDays[w] ?? 0) + 1;
      const ds = dayStart(date, tz);
      for (const s of segs) {
        if (s.state !== "in") continue;
        const end = s.end ?? now;
        for (let h = Math.floor((s.start - ds) / 3600); h < 24 && ds + h * 3600 < end; h++) {
          const a = Math.max(s.start, ds + h * 3600);
          const b = Math.min(end, ds + (h + 1) * 3600);
          if (b > a) (heatSec[w] as number[])[h] = ((heatSec[w] as number[])[h] ?? 0) + (b - a);
        }
      }
      byWeekday[w]?.push(summarizeDay(date, segs, now));
    }
  }
  const heat = heatSec.map((row, w) =>
    row.map((sec) => (heatDays[w] ? sec / 3600 / (heatDays[w] ?? 1) : 0)),
  );

  const weekdays: WeekdayStats[] = byWeekday.map((days, w) => {
    const lab = days.filter((d) => d.presenceSec >= LAB_DAY_MIN_SEC);
    const sec = lab.reduce((a, d) => a + d.presenceSec, 0);
    return {
      weekday: w,
      days: days.length,
      labDays: lab.length,
      avgSec: lab.length ? Math.round(sec / lab.length) : 0,
      avgArrival: mean(
        lab
          .filter((d) => d.firstArrival !== null)
          .map((d) => (d.firstArrival as number) - dayStart(d.date, tz)),
      ),
      avgDeparture: mean(
        lab
          .filter((d) => d.lastDeparture !== null)
          .map((d) => (d.lastDeparture as number) - dayStart(d.date, tz)),
      ),
    };
  });

  // 直近12週 (to か今日の早い方を含む週まで。未来の空の週は出さない)
  const end = to < today ? to : today;
  const lastMonday = nextDate(end, -mondayIndex(end), tz);
  const firstMonday = nextDate(lastMonday, -7 * 11, tz);
  const weekDays = daily(ctx, firstMonday, nextDate(lastMonday, 6, tz));
  const weeks = Array.from({ length: 12 }, (_, i) => ({
    start: nextDate(firstMonday, i * 7, tz),
    sec: weekDays.slice(i * 7, i * 7 + 7).reduce((a, d) => a + d.presenceSec, 0),
  }));

  // 直近12か月
  const months: { month: string; sec: number }[] = [];
  let m = `${end.slice(0, 7)}-01`;
  for (let i = 0; i < 11; i++) m = `${nextDate(m, -1, tz).slice(0, 7)}-01`;
  const monthDays = daily(ctx, m, end);
  for (const d of monthDays) {
    const key = d.date.slice(0, 7);
    const last = months.at(-1);
    if (last?.month === key) last.sec += d.presenceSec;
    else months.push({ month: key, sec: d.presenceSec });
  }

  return {
    current: period(ctx, from, curTo),
    previous: period(ctx, prevFrom, prevTo),
    heat,
    weekdays,
    weeks,
    months,
  };
}
