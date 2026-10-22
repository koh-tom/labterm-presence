import { describe, expect, it } from "vitest";
import { buildStats } from "../src/stats.ts";
import { dayStart } from "../src/time.ts";
import type { PresenceEvent, PresenceState } from "../src/types.ts";

const TZ = "Asia/Tokyo";
let n = 0;
const at = (d: string, h: number) => dayStart(d, TZ) + h * 3600;
function ev(d: string, h: number, state: PresenceState): PresenceEvent {
  n++;
  const t = at(d, h);
  return {
    id: `e${n}`,
    kind: "state",
    state,
    deviceId: "d",
    gen: 1,
    seq: n,
    deviceEpoch: t,
    receivedAt: t,
    effectiveAt: t,
    source: "button",
    flags: [],
  };
}

// 2026-10 の月曜 (5, 12, 19日) に 9-18時、19日は 10-17時
const events = [
  ev("2026-10-05", 9, "in"),
  ev("2026-10-05", 18, "out"),
  ev("2026-10-12", 9, "in"),
  ev("2026-10-12", 18, "out"),
  ev("2026-10-19", 10, "in"),
  ev("2026-10-19", 17, "out"),
  ev("2026-09-07", 9, "in"),
  ev("2026-09-07", 12, "out"),
];
const now = at("2026-10-31", 23);

describe("buildStats", () => {
  const s = buildStats(
    events,
    [{ start: at("2026-10-05", 9), end: at("2026-10-05", 10) }],
    "2026-10-01",
    "2026-10-31",
    now,
    TZ,
  );

  it("compares with the previous period", () => {
    expect(s.current.totalSec).toBe((9 + 9 + 7) * 3600);
    expect(s.current.labDays).toBe(3);
    expect(s.current.focusSec).toBe(3600);
    expect(s.previous.from).toBe("2026-08-31");
    expect(s.previous.totalSec).toBe(3 * 3600);
  });

  it("averages arrival and departure", () => {
    expect(s.current.avgArrival).toBe(Math.round(((9 + 9 + 10) * 3600) / 3));
    expect(s.current.avgDeparture).toBe(Math.round(((18 + 18 + 17) * 3600) / 3));
  });

  it("builds the weekday x hour heat", () => {
    // 10月の月曜は 5,12,19,26 の4日。9時台は2日 → 0.5
    expect(s.heat[0]?.[9]).toBeCloseTo(0.5);
    expect(s.heat[0]?.[12]).toBeCloseTo(0.75);
    expect(s.heat[1]?.[12]).toBe(0);
    expect(s.weekdays[0]?.labDays).toBe(3);
  });

  it("totals the last 12 weeks and months", () => {
    expect(s.weeks).toHaveLength(12);
    expect(s.weeks.at(-1)?.start).toBe("2026-10-26");
    expect(s.months.at(-1)).toEqual({ month: "2026-10", sec: 25 * 3600 });
    expect(s.months.at(-2)).toEqual({ month: "2026-09", sec: 3 * 3600 });
    expect(s.months).toHaveLength(12);
  });

  it("only compares up to today when the period is ongoing", () => {
    const t = buildStats(events, [], "2026-10-01", "2026-10-31", at("2026-10-10", 12), TZ);
    expect(t.current.to).toBe("2026-10-10");
    expect(t.previous.to).toBe("2026-09-09");
  });
});
