import { dayStart, type PresenceEvent, type PresenceRange } from "@labterm/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { openDb } from "../src/db/index.ts";
import { Live } from "../src/live.ts";
import { newId, Store } from "../src/store.ts";

const TZ = "Asia/Tokyo";
const HOST = { host: "127.0.0.1:8787" };
const NOW = dayStart("2026-10-22", TZ) + 20 * 3600;

let store: Store;
let app: ReturnType<typeof createApp>;

function ev(seq: number, hour: number, state: "in" | "away" | "out"): PresenceEvent {
  const t = dayStart("2026-10-22", TZ) + hour * 3600;
  return {
    id: newId(),
    kind: "state",
    state,
    deviceId: "d",
    gen: 1,
    seq,
    deviceEpoch: t,
    receivedAt: t,
    effectiveAt: t,
    source: "button",
    flags: [],
  };
}

beforeEach(() => {
  store = new Store(openDb(":memory:").db);
  app = createApp({ store, live: new Live(), tz: TZ, port: 8787, now: () => NOW });
});

describe("guard", () => {
  it("rejects other hosts (dns rebinding)", async () => {
    const res = await app.request("/api/health", { headers: { host: "evil.example:8787" } });
    expect(res.status).toBe(421);
  });

  it("rejects other origins", async () => {
    const res = await app.request("/api/health", {
      headers: { ...HOST, origin: "https://evil.example" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects non-json posts (csrf)", async () => {
    const res = await app.request("/api/sync", {
      method: "POST",
      headers: { ...HOST, "content-type": "text/plain" },
      body: "x",
    });
    expect(res.status).toBe(415);
  });

  it("allows same origin", async () => {
    const res = await app.request("/api/sync", {
      method: "POST",
      headers: { ...HOST, origin: "http://127.0.0.1:8787", "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
  });
});

describe("presence", () => {
  it("validates the range", async () => {
    const bad = await app.request("/api/presence?from=2026-10-31&to=2026-10-01", { headers: HOST });
    expect(bad.status).toBe(400);
    const long = await app.request("/api/presence?from=2025-01-01&to=2026-10-01", {
      headers: HOST,
    });
    expect(long.status).toBe(400);
    const junk = await app.request("/api/presence?from=2026-13-01&to=2026-13-02", {
      headers: HOST,
    });
    expect(junk.status).toBe(400);
  });

  it("summarizes stored events", async () => {
    store.insert(ev(1, 9, "in"));
    store.insert(ev(2, 12, "away"));
    store.insert(ev(3, 13, "in"));
    store.insert(ev(4, 18, "out"));
    const res = await app.request("/api/presence?from=2026-10-01&to=2026-10-31", { headers: HOST });
    const body = (await res.json()) as PresenceRange;
    expect(body.days).toHaveLength(31);
    expect(body.range.totalSec).toBe(8 * 3600);
    expect(body.range.labDays).toBe(1);
  });

  it("ignores duplicates", () => {
    const e = ev(1, 9, "in");
    expect(store.insert(e)).toBe(true);
    expect(store.insert({ ...e, id: newId() })).toBe(false);
  });

  it("exports csv", async () => {
    store.insert(ev(1, 9, "in"));
    store.insert(ev(2, 18, "out"));
    const res = await app.request("/api/export.csv?from=2026-10-22&to=2026-10-22", {
      headers: HOST,
    });
    const text = await res.text();
    expect(text).toContain("2026-10-22,2026-10-22T09:00:00+09:00,2026-10-22T18:00:00+09:00,540,0");
  });
});

describe("manual edits", () => {
  const post = (body: unknown) =>
    app.request("/api/presence/events", {
      method: "POST",
      headers: { ...HOST, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const today = async () => {
    const res = await app.request("/api/presence?from=2026-10-22&to=2026-10-22", { headers: HOST });
    return ((await res.json()) as PresenceRange).days[0];
  };

  it("adds a forgotten checkout", async () => {
    store.insert(ev(1, 9, "in"));
    const at = dayStart("2026-10-22", TZ) + 18 * 3600;
    expect((await post({ kind: "state", state: "out", at })).status).toBe(200);
    const d = await today();
    expect(d?.summary.presenceSec).toBe(9 * 3600);
    expect(d?.segments[0]?.manual).toBe(true);
  });

  it("deletes an interval with voids", async () => {
    store.insert(ev(1, 9, "in"));
    store.insert(ev(2, 10, "out"));
    const seg = (await today())?.segments[0];
    await post({ kind: "void", voids: seg?.startEventId });
    await post({ kind: "void", voids: seg?.endEventId });
    expect((await today())?.segments).toHaveLength(0);
  });

  it("rejects bad edits", async () => {
    expect((await post({ kind: "state", state: "in", at: 1000 })).status).toBe(400);
    expect((await post({ kind: "state", state: "in", at: NOW + 3600 })).status).toBe(400);
    expect((await post({ kind: "void", voids: "01HZZZZZZZZZZZZZZZZZZZZZZZ" })).status).toBe(404);
    expect((await post({ kind: "delete", id: "x" })).status).toBe(400);
  });
});

describe("stats", () => {
  it("returns stats for the range", async () => {
    store.insert(ev(1, 9, "in"));
    store.insert(ev(2, 18, "out"));
    const res = await app.request("/api/stats?from=2026-10-01&to=2026-10-31", { headers: HOST });
    const body = (await res.json()) as { current: { totalSec: number }; heat: number[][] };
    expect(body.current.totalSec).toBe(9 * 3600);
    expect(body.heat).toHaveLength(7);
  });
});
