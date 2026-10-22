import { describe, expect, it } from "vitest";
import { dayStart } from "../src/time.ts";
import {
  buildSegments,
  hourRange,
  splitByDay,
  summarizeDay,
  summarizeRange,
  toCells,
} from "../src/timeline.ts";
import type { PresenceEvent, PresenceState } from "../src/types.ts";

let n = 0;
// "2026-10-22 09:00" (JST) の形で書けるようにする
function at(s: string): number {
  const [d, t] = s.split(" ");
  const [h, m] = (t ?? "0:0").split(":").map(Number);
  return dayStart(d as string) + (h ?? 0) * 3600 + (m ?? 0) * 60;
}
function ev(time: string, state: PresenceState): PresenceEvent {
  n++;
  const e = at(time);
  return {
    id: `e${n}`,
    kind: "state",
    state,
    deviceId: "d",
    gen: 1,
    seq: n,
    deviceEpoch: e,
    receivedAt: e,
    effectiveAt: e,
    source: "button",
    flags: [],
  };
}
function voidOf(target: PresenceEvent, time: string): PresenceEvent {
  return { ...ev(time, "in"), kind: "void", state: undefined, voids: target.id };
}
const H = 3600;

describe("buildSegments", () => {
  it("in → out", () => {
    const s = buildSegments([ev("2026-10-22 9:00", "in"), ev("2026-10-22 18:00", "out")]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      state: "in",
      start: at("2026-10-22 9:00"),
      end: at("2026-10-22 18:00"),
    });
  });

  it("in → away → in → out", () => {
    const s = buildSegments([
      ev("2026-10-22 9:00", "in"),
      ev("2026-10-22 12:00", "away"),
      ev("2026-10-22 13:00", "in"),
      ev("2026-10-22 18:00", "out"),
    ]);
    expect(s.map((x) => x.state)).toEqual(["in", "away", "in"]);
  });

  it("ignores repeated states", () => {
    const s = buildSegments([
      ev("2026-10-22 9:00", "in"),
      ev("2026-10-22 10:00", "in"),
      ev("2026-10-22 18:00", "out"),
      ev("2026-10-22 19:00", "out"),
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]?.start).toBe(at("2026-10-22 9:00"));
  });

  it("ignores out → away", () => {
    const s = buildSegments([ev("2026-10-22 9:00", "away"), ev("2026-10-22 10:00", "in")]);
    expect(s.map((x) => x.state)).toEqual(["in"]);
  });

  it("applies void", () => {
    const out = ev("2026-10-22 18:00", "out");
    const s = buildSegments([ev("2026-10-22 9:00", "in"), out, voidOf(out, "2026-10-22 18:00")]);
    expect(s[0]?.end).toBeNull();
  });

  it("drops segments shorter than 2 minutes", () => {
    const s = buildSegments([ev("2026-10-22 9:00", "in"), ev("2026-10-22 9:01", "out")]);
    expect(s).toHaveLength(0);
  });

  it("keeps an ongoing segment", () => {
    const s = buildSegments([ev("2026-10-22 9:00", "in")]);
    expect(s[0]?.end).toBeNull();
  });

  it("skips events before the clock was set", () => {
    const bad = { ...ev("2026-10-22 9:00", "in"), effectiveAt: 1000 };
    expect(buildSegments([bad])).toHaveLength(0);
  });
});

describe("splitByDay / summarizeDay", () => {
  it("splits at midnight", () => {
    const segs = buildSegments([ev("2026-10-22 23:00", "in"), ev("2026-10-23 2:00", "out")]);
    const days = splitByDay(segs, "2026-10-22", "2026-10-23", at("2026-10-24 0:00"));
    const a = summarizeDay("2026-10-22", days.get("2026-10-22") ?? [], 0);
    const b = summarizeDay("2026-10-23", days.get("2026-10-23") ?? [], 0);
    expect(a.presenceSec).toBe(1 * H);
    expect(b.presenceSec).toBe(2 * H);
    expect(b.lastDeparture).toBe(at("2026-10-23 2:00"));
  });

  it("counts an ongoing segment until now", () => {
    const now = at("2026-10-22 12:30");
    const segs = buildSegments([ev("2026-10-22 9:00", "in")]);
    const day = splitByDay(segs, "2026-10-22", "2026-10-22", now).get("2026-10-22") ?? [];
    const sum = summarizeDay("2026-10-22", day, now);
    expect(sum.presenceSec).toBe(3.5 * H);
    expect(sum.lastDeparture).toBeNull();
  });

  it("sums away time", () => {
    const segs = buildSegments([
      ev("2026-10-22 9:00", "in"),
      ev("2026-10-22 12:00", "away"),
      ev("2026-10-22 13:00", "in"),
      ev("2026-10-22 18:00", "out"),
    ]);
    const day =
      splitByDay(segs, "2026-10-22", "2026-10-22", at("2026-10-23 0:00")).get("2026-10-22") ?? [];
    const sum = summarizeDay("2026-10-22", day, 0);
    expect(sum).toMatchObject({ presenceSec: 8 * H, awaySec: 1 * H, intervalCount: 2 });
    expect(sum.firstArrival).toBe(at("2026-10-22 9:00"));
  });

  it("handles month end and leap day", () => {
    const segs = buildSegments([ev("2028-02-29 22:00", "in"), ev("2028-03-01 1:00", "out")]);
    const days = splitByDay(segs, "2028-02-28", "2028-03-01", at("2028-03-02 0:00"));
    expect([...days.keys()]).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    expect(summarizeDay("2028-02-29", days.get("2028-02-29") ?? [], 0).presenceSec).toBe(2 * H);
  });
});

describe("summarizeRange", () => {
  it("counts lab days with 15 minutes or more", () => {
    const d = (sec: number) => ({
      date: "x",
      firstArrival: null,
      lastDeparture: null,
      presenceSec: sec,
      awaySec: 0,
      intervalCount: 1,
    });
    const r = summarizeRange([d(14 * 60), d(15 * 60), d(4 * H), d(0)]);
    expect(r.labDays).toBe(2);
    expect(r.totalSec).toBe(14 * 60 + 15 * 60 + 4 * H);
  });
});

describe("toCells", () => {
  const segs = buildSegments([ev("2026-10-22 9:10", "in"), ev("2026-10-22 10:45", "out")]);
  const now = at("2026-10-22 20:00");
  const day = splitByDay(segs, "2026-10-22", "2026-10-22", now).get("2026-10-22") ?? [];
  const cells = toCells("2026-10-22", day, { resolutionMin: 30, hours: [9, 11], now });

  it("marks full and partial cells", () => {
    expect(cells.map((c) => c.kind)).toEqual(["partial", "in", "in", "partial"]);
  });

  it("fills partial cells from the side where presence is", () => {
    // 9:10 入室 → 9:00-9:30 の右側 2/3
    expect(cells[0]?.from).toBeCloseTo(1 / 3);
    expect(cells[0]?.to).toBe(1);
    // 10:45 退室 → 10:30-11:00 の左側 1/2
    expect(cells[3]?.from).toBe(0);
    expect(cells[3]?.to).toBeCloseTo(0.5);
  });

  it("marks future and now", () => {
    const c = toCells("2026-10-22", [], { resolutionMin: 30, hours: [19, 21], now });
    expect(c.map((x) => x.kind)).toEqual(["empty", "empty", "future", "future"]);
    expect(c[2]?.now).toBe(true);
  });
});

describe("hourRange", () => {
  it("is 7-24 by default and widens for early presence", () => {
    const now = at("2026-10-23 12:00");
    const late = buildSegments([ev("2026-10-22 23:00", "in"), ev("2026-10-23 3:30", "out")]);
    expect(hourRange(splitByDay([], "2026-10-22", "2026-10-22", now))).toEqual([7, 24]);
    expect(hourRange(splitByDay(late, "2026-10-22", "2026-10-23", now))).toEqual([0, 24]);
  });
});

describe("segment metadata", () => {
  it("keeps start/end event ids and marks manual edits", () => {
    const a = ev("2026-10-22 9:00", "in");
    const b = { ...ev("2026-10-22 18:00", "out"), source: "web" as const };
    const [s] = buildSegments([a, b]);
    expect(s?.startEventId).toBe(a.id);
    expect(s?.endEventId).toBe(b.id);
    expect(s?.manual).toBe(true);
  });
});
