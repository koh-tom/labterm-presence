import { dayStart, nextDate } from "./time.ts";
import type {
  Cell,
  DailySummary,
  PresenceEvent,
  PresenceState,
  RangeSummary,
  Segment,
} from "./types.ts";

export const MIN_SEGMENT_SEC = 2 * 60; // これより短い区間は押し間違いとして捨てる
export const LAB_DAY_MIN_SEC = 15 * 60; // 在室日として数える最低時間
export const VALID_SINCE = 1735689600; // 2025-01-01。これより前は端末の時刻未設定

// 取消 (void) されたイベントを除く
export function applyVoids(events: PresenceEvent[]): PresenceEvent[] {
  const voided = new Set(events.filter((e) => e.kind === "void" && e.voids).map((e) => e.voids));
  return events.filter((e) => e.kind === "state" && e.state && !voided.has(e.id));
}

// イベントを時刻順に状態機械で読んで、在室 / 外出の区間にする
export function buildSegments(events: PresenceEvent[]): Segment[] {
  const evs = applyVoids(events)
    .filter((e) => e.effectiveAt >= VALID_SINCE)
    .sort((a, b) => a.effectiveAt - b.effectiveAt || a.seq - b.seq);

  const out: Segment[] = [];
  let state: PresenceState = "out";
  let cur: Segment | null = null;
  let curManual = false;

  for (const e of evs) {
    const next = e.state as PresenceState;
    if (next === state) continue; // 同じ状態の連続は区切らない
    if (state === "out" && next === "away") continue; // 不在→外出はありえないので無視

    if (cur) {
      cur.end = e.effectiveAt;
      cur.endEventId = e.id;
      if (curManual || e.source === "web") cur.manual = true;
      out.push(cur);
      cur = null;
    }
    if (next !== "out") {
      cur = { state: next, start: e.effectiveAt, end: null, startEventId: e.id };
      curManual = e.source === "web";
      if (curManual) cur.manual = true;
    }
    state = next;
  }
  if (cur) out.push(cur);

  return out.filter((s) => s.end === null || s.end - s.start >= MIN_SEGMENT_SEC);
}

// 0時で区切って日ごとに分ける
export function splitByDay(
  segments: Segment[],
  from: string,
  to: string,
  now: number,
  tz?: string,
): Map<string, Segment[]> {
  const days = new Map<string, Segment[]>();
  for (let d = from; d <= to; d = nextDate(d, 1, tz)) {
    const ds = dayStart(d, tz);
    const de = dayStart(nextDate(d, 1, tz), tz);
    const list: Segment[] = [];
    for (const s of segments) {
      const end = s.end ?? now;
      const a = Math.max(s.start, ds);
      const b = Math.min(end, de);
      if (b <= a) continue;
      const ongoing = s.end === null && end <= de;
      list.push({ ...s, start: a, end: ongoing ? null : b });
    }
    days.set(d, list);
  }
  return days;
}

export function summarizeDay(date: string, segs: Segment[], now: number): DailySummary {
  let presenceSec = 0;
  let awaySec = 0;
  const ins = segs.filter((s) => s.state === "in");
  for (const s of segs) {
    const len = (s.end ?? now) - s.start;
    if (s.state === "in") presenceSec += len;
    else awaySec += len;
  }
  const last = ins.at(-1);
  return {
    date,
    firstArrival: ins[0]?.start ?? null,
    lastDeparture: last ? last.end : null,
    presenceSec,
    awaySec,
    intervalCount: ins.length,
  };
}

export function summarizeRange(days: DailySummary[]): RangeSummary {
  const totalSec = days.reduce((a, d) => a + d.presenceSec, 0);
  const labDays = days.filter((d) => d.presenceSec >= LAB_DAY_MIN_SEC).length;
  return { totalSec, labDays, averageSec: labDays ? Math.round(totalSec / labDays) : 0 };
}

// 表示する時間帯。通常 7〜24時で、それより早い在室があれば広げる
export function hourRange(days: Map<string, Segment[]>, tz?: string): [number, number] {
  let start = 7;
  for (const [date, segs] of days) {
    const ds = dayStart(date, tz);
    for (const s of segs) start = Math.min(start, Math.floor((s.start - ds) / 3600));
  }
  return [Math.max(0, start), 24];
}

export type CellOptions = {
  resolutionMin: number;
  hours: [number, number];
  now: number;
  tz?: string;
};

// 1日分のマス
export function toCells(date: string, segs: Segment[], opt: CellOptions): Cell[] {
  const ds = dayStart(date, opt.tz);
  const step = opt.resolutionMin * 60;
  const cells: Cell[] = [];
  for (let cs = ds + opt.hours[0] * 3600; cs < ds + opt.hours[1] * 3600; cs += step) {
    const ce = cs + step;
    let covered = 0;
    let first = Number.POSITIVE_INFINITY;
    let last = Number.NEGATIVE_INFINITY;
    let away = 0;
    for (const s of segs) {
      const a = Math.max(s.start, cs);
      const b = Math.min(s.end ?? opt.now, ce);
      if (b <= a) continue;
      if (s.state === "in") {
        covered += b - a;
        first = Math.min(first, a);
        last = Math.max(last, b);
      } else {
        away += b - a;
      }
    }

    let kind: Cell["kind"] = "empty";
    if (covered >= step * 0.98) kind = "in";
    else if (covered > 0) kind = "partial";
    else if (away > 0) kind = "away";
    else if (cs >= opt.now) kind = "future";

    cells.push({
      start: cs,
      end: ce,
      kind,
      from: covered > 0 ? (first - cs) / step : 0,
      to: covered > 0 ? (last - cs) / step : 0,
      now: cs <= opt.now && opt.now < ce,
    });
  }
  return cells;
}
