import type { EventMessage, PresenceEvent } from "@labterm/core";
import { newId } from "../store.ts";

export const SKEW_SEC = 300;
export const FUTURE_SEC = 60;

// 端末からのイベントを保存する形にする
//   realtime: その場で届いた通知 (受信時刻も信用できる)
//   同期で後から取り込んだものは端末の時刻を使う
export function toPresenceEvent(
  msg: EventMessage,
  deviceId: string,
  receivedAt: number,
  realtime: boolean,
  voidTargetId?: string,
): PresenceEvent {
  const flags: string[] = [];
  let effectiveAt = msg.epoch;
  if (msg.epoch > receivedAt + FUTURE_SEC) {
    flags.push("future");
    effectiveAt = receivedAt;
  } else if (realtime && Math.abs(msg.epoch - receivedAt) > SKEW_SEC) {
    flags.push("clock_skew");
    effectiveAt = receivedAt;
  }
  return {
    id: newId(),
    kind: msg.kind,
    state: msg.kind === "state" ? msg.state : undefined,
    voids: msg.kind === "void" ? (voidTargetId ?? `missing:${msg.gen}:${msg.voids}`) : undefined,
    deviceId,
    gen: msg.gen,
    seq: msg.seq,
    deviceEpoch: msg.epoch,
    receivedAt,
    effectiveAt,
    source: msg.source,
    flags,
  };
}
