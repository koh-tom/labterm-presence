// DB の読み書き。SQL は Drizzle 経由だけにする
import type { FocusSession, PresenceEvent } from "@labterm/core";
import { and, asc, desc, eq, gte, lt, lte, max } from "drizzle-orm";
import { monotonicFactory } from "ulid";
import type { Db } from "./db/index.ts";
import { deviceSync, focusSessions, presenceEvents } from "./db/schema.ts";

const ulid = monotonicFactory();
export const newId = () => ulid();

type Row = typeof presenceEvents.$inferSelect;

function toEvent(r: Row): PresenceEvent {
  return {
    id: r.id,
    kind: r.kind,
    state: r.state ?? undefined,
    voids: r.voids ?? undefined,
    deviceId: r.deviceId,
    gen: r.gen,
    seq: r.seq,
    deviceEpoch: r.deviceEpoch,
    receivedAt: r.receivedAt,
    effectiveAt: r.effectiveAt,
    source: r.source,
    flags: r.flags,
  };
}

export class Store {
  private db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  // 保存できたら true。同じ (device, gen, seq) が既にあれば false
  insert(e: PresenceEvent, raw?: string): boolean {
    const res = this.db
      .insert(presenceEvents)
      .values({
        ...e,
        state: e.state ?? null,
        voids: e.voids ?? null,
        raw: raw ?? null,
        createdAt: now(),
      })
      .onConflictDoNothing()
      .run();
    return res.changes > 0;
  }

  getById(id: string): PresenceEvent | undefined {
    const r = this.db.select().from(presenceEvents).where(eq(presenceEvents.id, id)).get();
    return r ? toEvent(r) : undefined;
  }

  nextSeq(deviceId: string, gen: number): number {
    const r = this.db
      .select({ m: max(presenceEvents.seq) })
      .from(presenceEvents)
      .where(and(eq(presenceEvents.deviceId, deviceId), eq(presenceEvents.gen, gen)))
      .get();
    return (r?.m ?? 0) + 1;
  }

  insertFocus(
    deviceId: string,
    f: { start: number; end: number; sec: number; done: boolean },
  ): boolean {
    const res = this.db
      .insert(focusSessions)
      .values({ deviceId, ...f, receivedAt: now() })
      .onConflictDoNothing()
      .run();
    return res.changes > 0;
  }

  focusUntil(to: number): FocusSession[] {
    return this.db
      .select({ start: focusSessions.start, end: focusSessions.end })
      .from(focusSessions)
      .where(lt(focusSessions.start, to))
      .orderBy(asc(focusSessions.start))
      .all();
  }

  lastFocusStart(deviceId: string): number {
    const r = this.db
      .select({ m: max(focusSessions.start) })
      .from(focusSessions)
      .where(eq(focusSessions.deviceId, deviceId))
      .get();
    return r?.m ?? 0;
  }

  findBySeq(deviceId: string, gen: number, seq: number): PresenceEvent | undefined {
    const r = this.db
      .select()
      .from(presenceEvents)
      .where(
        and(
          eq(presenceEvents.deviceId, deviceId),
          eq(presenceEvents.gen, gen),
          eq(presenceEvents.seq, seq),
        ),
      )
      .get();
    return r ? toEvent(r) : undefined;
  }

  // 区間を作るには範囲の前の状態も要るので、to までの全部を返す (1年で数千件程度)
  eventsUntil(to: number): PresenceEvent[] {
    return this.db
      .select()
      .from(presenceEvents)
      .where(lt(presenceEvents.effectiveAt, to))
      .orderBy(asc(presenceEvents.effectiveAt), asc(presenceEvents.id))
      .all()
      .map(toEvent);
  }

  eventsBetween(from: number, to: number): PresenceEvent[] {
    return this.db
      .select()
      .from(presenceEvents)
      .where(and(gte(presenceEvents.effectiveAt, from), lte(presenceEvents.effectiveAt, to)))
      .orderBy(asc(presenceEvents.effectiveAt), asc(presenceEvents.id))
      .all()
      .map(toEvent);
  }

  lastEvent(): PresenceEvent | undefined {
    const r = this.db
      .select()
      .from(presenceEvents)
      .orderBy(desc(presenceEvents.effectiveAt))
      .limit(1)
      .get();
    return r ? toEvent(r) : undefined;
  }

  lastSeq(deviceId: string, gen: number): number {
    const r = this.db
      .select()
      .from(deviceSync)
      .where(and(eq(deviceSync.deviceId, deviceId), eq(deviceSync.gen, gen)))
      .get();
    return r?.lastSeq ?? 0;
  }

  setLastSeq(deviceId: string, gen: number, seq: number, fw: string | null) {
    this.db
      .insert(deviceSync)
      .values({ deviceId, gen, lastSeq: seq, lastSeenAt: now(), fw })
      .onConflictDoUpdate({
        target: [deviceSync.deviceId, deviceSync.gen],
        set: { lastSeq: seq, lastSeenAt: now(), fw },
      })
      .run();
  }
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}
