// 端末との接続を保ち、イベントを取り込む
import {
  currentState,
  type DeviceMessage,
  type EventMessage,
  type FocusMessage,
  type HelloMessage,
} from "@labterm/core";
import type pino from "pino";
import type { Live } from "../live.ts";
import { now, type Store } from "../store.ts";
import { toPresenceEvent } from "./ingest.ts";
import type { Link } from "./link.ts";

export type Opener = () => Promise<Link | null>;

export type ServiceOptions = {
  clockSync?: boolean;
  retryMs?: number;
  heartbeatMs?: number;
};

export class DeviceService {
  private link: Link | null = null;
  private hello: HelloMessage | null = null;
  private pausedUntil = 0;
  private timer: NodeJS.Timeout | null = null;
  private heartbeat: NodeJS.Timeout | null = null;
  private syncing = false;
  private stopped = false;
  private store: Store;
  private live: Live;
  private open: Opener;
  private log: pino.Logger;
  private opt: Required<ServiceOptions>;

  constructor(store: Store, live: Live, open: Opener, log: pino.Logger, opt: ServiceOptions = {}) {
    this.store = store;
    this.live = live;
    this.open = open;
    this.log = log;
    this.opt = { clockSync: true, retryMs: 2000, heartbeatMs: 30000, ...opt };
  }

  start() {
    this.stopped = false;
    void this.tick();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.disconnect();
  }

  // 接続していなければ探してつなぐ。抜かれても落ちずに探し続ける
  private async tick() {
    if (this.stopped) return;
    if (!this.link && Date.now() >= this.pausedUntil) {
      try {
        const link = await this.open();
        if (link) await this.attach(link);
      } catch (e) {
        this.log.debug({ err: (e as Error).message }, "open failed");
      }
    }
    if (Date.now() >= this.pausedUntil && this.live.device.state === "paused") {
      this.live.setDevice("disconnected");
    }
    this.timer = setTimeout(() => void this.tick(), this.opt.retryMs);
  }

  async attach(link: Link) {
    this.link = link;
    link.onClose(() => {
      if (this.link !== link) return;
      this.link = null;
      this.hello = null;
      this.live.devicePresence = null;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.live.setDevice(Date.now() < this.pausedUntil ? "paused" : "disconnected");
      this.log.info("device disconnected");
    });
    link.onEvent((msg, raw) => void this.onRealtime(msg, raw));

    try {
      await this.sync();
    } catch (e) {
      this.log.warn({ err: (e as Error).message }, "sync failed");
      await this.disconnect();
      return;
    }
    this.heartbeat = setInterval(() => void this.checkState(), this.opt.heartbeatMs);
  }

  // hello → 時刻合わせ → 抜けを取り込む → 状態を比べる
  async sync() {
    const link = this.link;
    if (!link || this.syncing) return;
    this.syncing = true;
    this.live.setSync("syncing");
    try {
      const [hello] = await link.request("hello");
      if (hello?.type !== "hello") throw new Error("no hello");
      this.hello = hello;
      this.live.setDevice("connected", hello.fw);
      this.log.info(
        { device: hello.device, fw: hello.fw, gen: hello.gen, seq: hello.lastSeq },
        "device connected",
      );

      if (this.opt.clockSync && (!hello.timeValid || Math.abs(hello.epoch - now()) >= 2)) {
        await link.request(`time ${now()}`);
        this.log.info({ diff: hello.epoch - now() }, "device clock set");
      }

      const imported = await this.fetchSince(link, hello);
      await this.fetchFocus(link, hello);
      await this.checkState();
      if (this.live.sync.state === "syncing") this.live.setSync("ok", imported);
    } finally {
      this.syncing = false;
      if (this.live.sync.state === "syncing") this.live.setSync("required");
    }
  }

  private async fetchSince(link: Link, hello: HelloMessage): Promise<number> {
    const last = this.store.lastSeq(hello.device, hello.gen);
    if (last >= hello.lastSeq) return 0;
    const msgs = await link.request(`since ${hello.gen} ${last}`, 15000);
    let imported = 0;
    let maxSeq = last;
    for (const m of msgs) {
      if (m.type !== "event") continue;
      if (this.save(m, hello.device, false)) imported++;
      maxSeq = Math.max(maxSeq, m.seq);
    }
    this.store.setLastSeq(hello.device, hello.gen, maxSeq, hello.fw);
    if (imported) this.log.info({ imported }, "imported events");
    return imported;
  }

  // 研究タイマーの区間。最後に取り込んだものより後に始まった分だけもらう
  private async fetchFocus(link: Link, hello: HelloMessage) {
    const after = this.store.lastFocusStart(hello.device);
    const msgs = await link.request(`focus ${after}`, 15000);
    let n = 0;
    for (const m of msgs) {
      if (m.type === "focus" && this.saveFocus(m, hello.device)) n++;
    }
    if (n) this.log.info({ imported: n }, "imported focus sessions");
  }

  private saveFocus(m: FocusMessage, deviceId: string): boolean {
    const ok = this.store.insertFocus(deviceId, {
      start: m.start,
      end: m.end,
      sec: m.sec,
      done: m.done,
    });
    if (ok) this.live.publish({ type: "focus", at: m.end });
    return ok;
  }

  private save(m: EventMessage, deviceId: string, realtime: boolean, raw?: string): boolean {
    const target =
      m.kind === "void" ? this.store.findBySeq(deviceId, m.gen, m.voids ?? 0)?.id : undefined;
    const e = toPresenceEvent(m, deviceId, now(), realtime, target);
    const ok = this.store.insert(e, raw);
    if (ok) this.live.publish({ type: "presence", eventId: e.id, at: e.effectiveAt });
    return ok;
  }

  private async onRealtime(msg: DeviceMessage, raw: string) {
    const hello = this.hello;
    if (!hello) return;
    if (msg.type === "focus") {
      this.saveFocus(msg, hello.device);
      return;
    }
    if (msg.type !== "event") return;
    const last = this.store.lastSeq(hello.device, msg.gen);
    if (msg.gen !== hello.gen || msg.seq !== last + 1) {
      // 抜けがある (または端末が初期化された) ので同期し直す
      this.log.info({ gen: msg.gen, seq: msg.seq, last }, "gap detected");
      await this.sync().catch(() => {});
      return;
    }
    this.save(msg, hello.device, true, raw);
    this.store.setLastSeq(hello.device, hello.gen, msg.seq, hello.fw);
    await this.checkState().catch(() => {});
  }

  // 端末の今の状態と、PCの記録から作った状態を比べる
  private async checkState() {
    const link = this.link;
    if (!link) return;
    try {
      const [st] = await link.request("state");
      if (st?.type !== "state") return;
      this.live.setDevice("connected");
      this.live.devicePresence = { state: st.state, since: st.since || null };
      const stored = currentState(this.store.eventsUntil(now() + 60));
      const mismatch = stored.state !== st.state;
      if (mismatch && this.live.sync.state !== "required") this.live.setSync("required");
      if (!mismatch && this.live.sync.state === "required") this.live.setSync("ok");
    } catch {
      await this.disconnect();
    }
  }

  async disconnect() {
    const link = this.link;
    this.link = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    await link?.close();
  }

  // 他のツールのためにポートを空ける
  async release(seconds: number) {
    this.pausedUntil = Date.now() + seconds * 1000;
    await this.disconnect();
    this.live.setDevice("paused");
  }

  acquire() {
    this.pausedUntil = 0;
    if (this.live.device.state === "paused") this.live.setDevice("disconnected");
  }

  requestSync() {
    void this.sync().catch(() => {});
  }
}
