// socat の仮想シリアルで、本物の SerialLink を通して偽の端末と同期する
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSegments } from "@labterm/core";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db/index.ts";
import { FakeDevice, virtualPair } from "../src/dev/fake-device.ts";
import { SerialLink } from "../src/device/link.ts";
import { DeviceService } from "../src/device/service.ts";
import { Live } from "../src/live.ts";
import { now, Store } from "../src/store.ts";

const hasSocat = (() => {
  try {
    execSync("which socat", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const log = pino({ level: "silent" });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!hasSocat)("serial (virtual port)", () => {
  let pair: Awaited<ReturnType<typeof virtualPair>>;
  let dev: FakeDevice;
  let store: Store;
  let live: Live;
  let svc: DeviceService;

  beforeEach(async () => {
    pair = await virtualPair(mkdtempSync(join(tmpdir(), "labterm-test-")));
    dev = new FakeDevice();
    await dev.open(pair.device);
    store = new Store(openDb(":memory:").db);
    live = new Live();
    svc = new DeviceService(store, live, () => SerialLink.open(pair.host, log), log, {
      retryMs: 100,
      heartbeatMs: 1e9,
    });
  });

  afterEach(async () => {
    await svc.stop();
    await dev.close();
    pair.stop();
  });

  const events = () => store.eventsUntil(now() + 3600);

  it("connects, syncs the clock and receives realtime events", async () => {
    dev.clockOffset = -600;
    svc.start();
    await wait(500);
    expect(live.device.state).toBe("connected");
    expect(Math.abs(dev.clockOffset)).toBeLessThan(2);

    dev.press("in");
    await wait(300);
    expect(events().map((e) => e.state)).toEqual(["in"]);
    expect(live.devicePresence?.state).toBe("in");
  });

  it("imports what happened while the pc was away", async () => {
    dev.press("in", false);
    dev.press("away", false);
    svc.start();
    await wait(500);
    expect(events().map((e) => e.state)).toEqual(["in", "away"]);
    expect(live.sync.state).toBe("ok");
  });

  it("applies undo", async () => {
    svc.start();
    await wait(400);
    dev.press("in");
    await wait(200);
    dev.press("out");
    await wait(200);
    dev.undo();
    await wait(300);
    const segs = buildSegments(events());
    expect(segs.at(-1)?.end ?? null).toBeNull();
    expect(live.sync.state).toBe("ok");
  });
});
