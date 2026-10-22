// 端末やDBの変化を SSE で Web に流すための中継
import { EventEmitter } from "node:events";
import type { DeviceState, PresenceState, SyncState } from "@labterm/core";

export type LiveMessage =
  | { type: "device"; state: DeviceState }
  | { type: "presence"; eventId: string; at: number }
  | { type: "sync"; state: SyncState; imported?: number };

type Entry = { id: number; msg: LiveMessage };

export class Live {
  private emitter = new EventEmitter();
  private history: Entry[] = [];
  private nextId = 1;

  // 今の状態 (/api/status 用)
  device: { state: DeviceState; fw: string | null; lastSeenAt: number | null } = {
    state: "disconnected",
    fw: null,
    lastSeenAt: null,
  };
  sync: { state: SyncState; lastSyncAt: number | null } = { state: "ok", lastSyncAt: null };
  devicePresence: { state: PresenceState; since: number | null } | null = null;

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  publish(msg: LiveMessage) {
    const e = { id: this.nextId++, msg };
    this.history.push(e);
    if (this.history.length > 100) this.history.shift();
    this.emitter.emit("msg", e);
  }

  // Last-Event-ID より後のものを返す (再接続時の取りこぼし対策)
  since(id: number): Entry[] {
    return this.history.filter((e) => e.id > id);
  }

  subscribe(fn: (e: Entry) => void): () => void {
    this.emitter.on("msg", fn);
    return () => this.emitter.off("msg", fn);
  }

  setDevice(state: DeviceState, fw?: string | null) {
    if (fw !== undefined) this.device.fw = fw;
    if (state === "connected") this.device.lastSeenAt = Math.floor(Date.now() / 1000);
    if (this.device.state === state) return;
    this.device.state = state;
    this.publish({ type: "device", state });
  }

  setSync(state: SyncState, imported?: number) {
    this.sync.state = state;
    if (state === "ok") this.sync.lastSyncAt = Math.floor(Date.now() / 1000);
    this.publish({ type: "sync", state, ...(imported !== undefined ? { imported } : {}) });
  }
}
