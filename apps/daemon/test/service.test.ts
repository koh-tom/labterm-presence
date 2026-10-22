import { buildSegments, type DeviceMessage } from "@labterm/core";
import pino from "pino";
import { beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db/index.ts";
import { toPresenceEvent } from "../src/device/ingest.ts";
import type { Link } from "../src/device/link.ts";
import { DeviceService } from "../src/device/service.ts";
import { Live } from "../src/live.ts";
import { now, Store } from "../src/store.ts";

const DEV = "48:27:e2:66:5d:18";
const log = pino({ level: "silent" });

type Ev = Extract<DeviceMessage, { type: "event" }>;

// 端末の代わり。@q のコマンドに仕様どおり答える
class FakeDevice implements Link {
  gen = 100;
  events: Ev[] = [];
  state: "in" | "away" | "out" = "out";
  epoch = now();
  commands: string[] = [];
  private eventFns: ((m: DeviceMessage, raw: string) => void)[] = [];
  private closeFns: (() => void)[] = [];

  add(state: "in" | "away" | "out", at = now() - 3600) {
    const e: Ev = {
      type: "event",
      gen: this.gen,
      seq: this.events.filter((x) => x.gen === this.gen).length + 1,
      kind: "state",
      state,
      epoch: at,
      source: "button",
    };
    this.events.push(e);
    this.state = state;
    return e;
  }

  addVoid(target: Ev) {
    const e: Ev = {
      type: "event",
      gen: this.gen,
      seq: this.events.filter((x) => x.gen === this.gen).length + 1,
      kind: "void",
      voids: target.seq,
      epoch: now(),
      source: "button",
    };
    this.events.push(e);
    return e;
  }

  push(e: Ev) {
    for (const fn of this.eventFns) fn(e, JSON.stringify(e));
  }

  async request(cmd: string): Promise<DeviceMessage[]> {
    this.commands.push(cmd);
    const re = 1;
    const mine = this.events.filter((e) => e.gen === this.gen);
    if (cmd === "hello") {
      return [
        {
          type: "hello",
          re,
          proto: 1,
          device: DEV,
          gen: this.gen,
          lastSeq: mine.length,
          fw: "test",
          epoch: this.epoch,
          timeValid: true,
          uptime: 10,
        },
      ];
    }
    if (cmd === "state")
      return [{ type: "state", re, state: this.state, since: 0, seq: mine.length }];
    if (cmd.startsWith("time ")) {
      this.epoch = Number(cmd.slice(5));
      return [{ type: "ok", re }];
    }
    if (cmd.startsWith("since ")) {
      const [, g, s] = cmd.split(" ").map(Number);
      const out = this.events
        .filter((e) => e.gen === g && e.seq > (s ?? 0))
        .map((e) => ({ ...e, re }));
      return [...out, { type: "end", re, count: out.length }];
    }
    return [{ type: "error", re, code: "unknown" }];
  }

  onEvent(fn: (m: DeviceMessage, raw: string) => void) {
    this.eventFns.push(fn);
  }
  onClose(fn: () => void) {
    this.closeFns.push(fn);
  }
  async close() {
    for (const fn of this.closeFns) fn();
  }
}

let store: Store;
let live: Live;
let dev: FakeDevice;
let svc: DeviceService;

beforeEach(() => {
  store = new Store(openDb(":memory:").db);
  live = new Live();
  dev = new FakeDevice();
  svc = new DeviceService(store, live, async () => dev, log, { heartbeatMs: 1e9 });
});

const all = () => store.eventsUntil(now() + 3600);

describe("sync", () => {
  it("imports everything on first connect", async () => {
    dev.add("in", now() - 7200);
    dev.add("out", now() - 3600);
    await svc.attach(dev);
    expect(all()).toHaveLength(2);
    expect(store.lastSeq(DEV, 100)).toBe(2);
    expect(live.sync.state).toBe("ok");
    expect(live.device.state).toBe("connected");
  });

  it("imports only new events after reconnect (pc was off)", async () => {
    dev.add("in", now() - 7200);
    await svc.attach(dev);
    await dev.close();
    dev.add("away", now() - 3000);
    dev.add("in", now() - 2000);
    dev.commands = [];
    await svc.attach(dev);
    expect(all()).toHaveLength(3);
    expect(dev.commands).toContain("since 100 1");
  });

  it("stores realtime events and fills gaps", async () => {
    await svc.attach(dev);
    const a = dev.add("in", now());
    dev.push(a);
    await new Promise((r) => setTimeout(r, 10));
    expect(all()).toHaveLength(1);

    dev.add("away", now()); // 届かなかった
    const c = dev.add("in", now());
    dev.push(c); // seq が飛んだ → since で埋める
    await new Promise((r) => setTimeout(r, 10));
    expect(all().map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("ignores duplicates", async () => {
    const a = dev.add("in", now());
    await svc.attach(dev);
    dev.push(a);
    await new Promise((r) => setTimeout(r, 10));
    expect(all()).toHaveLength(1);
  });

  it("restarts from 0 when the device gen changes", async () => {
    dev.add("in", now() - 7200);
    await svc.attach(dev);
    await dev.close();
    dev.gen = 200;
    dev.add("out", now() - 100);
    await svc.attach(dev);
    expect(all().map((e) => e.gen)).toEqual([100, 200]);
  });

  it("links void to the target event", async () => {
    dev.add("in", now() - 7200);
    const out = dev.add("out", now() - 60);
    dev.addVoid(out);
    dev.state = "in";
    await svc.attach(dev);
    const segs = buildSegments(all());
    expect(segs.at(-1)?.end).toBeNull();
    expect(live.sync.state).toBe("ok");
  });

  it("sets the device clock when it is off", async () => {
    dev.epoch = now() - 500;
    await svc.attach(dev);
    expect(dev.commands.some((c) => c.startsWith("time "))).toBe(true);
    expect(Math.abs(dev.epoch - now())).toBeLessThan(2);
  });

  it("asks to sync when states disagree", async () => {
    dev.add("in", now() - 7200);
    await svc.attach(dev);
    dev.state = "out"; // 端末だけ変わった (イベントが失われた)
    await (svc as unknown as { checkState(): Promise<void> }).checkState();
    expect(live.sync.state).toBe("required");
  });
});

describe("ingest", () => {
  const msg = (epoch: number): Ev => ({
    type: "event",
    gen: 1,
    seq: 1,
    kind: "state",
    state: "in",
    epoch,
    source: "button",
  });

  it("uses receive time when the device clock is skewed", () => {
    const e = toPresenceEvent(msg(1000_000_000 + 600), "d", 1000_000_000, true);
    expect(e.flags).toEqual(["future"]);
    const s = toPresenceEvent(msg(1000_000_000 - 600), "d", 1000_000_000, true);
    expect(s.flags).toEqual(["clock_skew"]);
    expect(s.effectiveAt).toBe(1000_000_000);
  });

  it("trusts the device time for synced events", () => {
    const e = toPresenceEvent(msg(1000_000_000 - 86400), "d", 1000_000_000, false);
    expect(e.flags).toEqual([]);
    expect(e.effectiveAt).toBe(1000_000_000 - 86400);
  });
});
