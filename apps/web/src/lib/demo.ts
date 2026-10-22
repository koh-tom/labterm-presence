// daemon 無しで画面を確認するためのデモデータ (?demo)
import {
  buildRange,
  buildStats,
  currentState,
  dateOf,
  dayStart,
  nextDate,
  type PresenceEvent,
  type PresenceRange,
  type PresenceState,
  type Status,
} from "@labterm/core";

const TZ = "Asia/Tokyo";

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

let cache: PresenceEvent[] | null = null;
let focusCache: { start: number; end: number }[] = [];

function events(now: number): PresenceEvent[] {
  if (cache) return cache;
  const out: PresenceEvent[] = [];
  let seq = 0;
  const push = (t: number, state: PresenceState) => {
    if (t > now) return;
    seq++;
    out.push({
      id: `demo${seq}`,
      kind: "state",
      state,
      deviceId: "demo",
      gen: 1,
      seq,
      deviceEpoch: t,
      receivedAt: t,
      effectiveAt: t,
      source: "button",
      flags: [],
    });
  };

  const today = dateOf(now, TZ);
  for (let d = nextDate(today, -150, TZ); d <= today; d = nextDate(d, 1, TZ)) {
    const r = rand(Number(d.replaceAll("-", "")));
    const ds = dayStart(d, TZ);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    if (d === today) {
      push(ds + 9 * 3600 + 18 * 60, "in");
      push(ds + 12 * 3600 + 10 * 60, "away");
      push(ds + 13 * 3600 + 3 * 60, "in");
      continue;
    }
    if (r() < (weekend ? 0.75 : 0.12)) continue;
    const arrive = ds + (8.3 + r() * 2.7) * 3600;
    push(arrive, "in");
    // 研究タイマー (50分) を何回か
    for (let k = 0; k < 4; k++) {
      if (r() < 0.6) {
        const s = arrive + (0.3 + k * 1.6 + r() * 0.5) * 3600;
        focusCache.push({ start: s, end: s + 50 * 60 });
      }
    }
    if (r() < 0.7) {
      const lunch = ds + (11.8 + r() * 1.2) * 3600;
      push(lunch, "away");
      push(lunch + (0.5 + r() * 0.8) * 3600, "in");
    }
    if (r() < 0.25) {
      const t = ds + (15 + r() * 2) * 3600;
      push(t, "away");
      push(t + (0.3 + r() * 0.6) * 3600, "in");
    }
    const late = r() < 0.12;
    push(ds + (late ? 24.5 + r() * 2 : 17.5 + r() * 4.5) * 3600, "out");
  }
  cache = out;
  return out;
}

export function demoRange(from: string, to: string): PresenceRange {
  const now = Math.floor(Date.now() / 1000);
  return buildRange(
    events(now),
    from,
    to,
    now,
    TZ,
    focusCache.filter((f) => f.end <= now),
  );
}

export function demoStats(from: string, to: string) {
  const now = Math.floor(Date.now() / 1000);
  const ev = events(now);
  return buildStats(
    ev,
    focusCache.filter((f) => f.end <= now),
    from,
    to,
    now,
    TZ,
  );
}

export function demoStatus(): Status {
  const now = Math.floor(Date.now() / 1000);
  return {
    now,
    device: { state: "connected", fw: "demo", lastSeenAt: now },
    presence: currentState(events(now)),
    sync: { state: "ok", lastSyncAt: now },
  };
}
