import { existsSync } from "node:fs";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  buildRange,
  buildStats,
  currentState,
  dayStart,
  isValidDate,
  MAX_RANGE_DAYS,
  nextDate,
  type PresenceEvent,
  type Status,
  VALID_SINCE,
} from "@labterm/core";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { dailyCsv, intervalCsv } from "./csv.ts";
import type { Live } from "./live.ts";
import { newId, now as nowSec, type Store } from "./store.ts";

export type Deps = {
  store: Store;
  live: Live;
  tz: string;
  port: number;
  dev?: boolean; // Vite (5173) からのアクセスも許す
  webDir?: string;
  requestSync?: () => void;
  now?: () => number;
};

const RangeQuery = z
  .object({
    from: z.string().refine(isValidDate),
    to: z.string().refine(isValidDate),
  })
  .refine((q) => q.from <= q.to);

// Web からの手動修正。PC の履歴だけを直す (端末の状態は変えない)
const Edit = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("state"),
    state: z.enum(["in", "away", "out"]),
    at: z.number().int(),
  }),
  z.object({ kind: z.literal("void"), voids: z.string().regex(/^[0-9A-Z]{26}$/) }),
]);

// ブラウザ経由の攻撃 (DNS rebinding / CSRF) を防ぐ
function guard(deps: Deps) {
  const hosts = new Set([`127.0.0.1:${deps.port}`, `localhost:${deps.port}`]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  if (deps.dev) {
    for (const h of ["127.0.0.1:5173", "localhost:5173"]) origins.add(`http://${h}`);
  }
  return async (c: import("hono").Context, next: () => Promise<void>) => {
    const host = c.req.header("host");
    if (!host || !hosts.has(host)) return c.text("misdirected request", 421);
    const origin = c.req.header("origin");
    if (origin && !origins.has(origin)) return c.text("forbidden", 403);
    const m = c.req.method;
    if (
      m !== "GET" &&
      m !== "HEAD" &&
      !c.req.header("content-type")?.startsWith("application/json")
    ) {
      return c.text("unsupported media type", 415);
    }
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
    );
  };
}

function days(from: string, to: string, tz: string): number {
  return Math.round((dayStart(to, tz) - dayStart(from, tz)) / 86400) + 1;
}

export function createApi(deps: Deps) {
  const now = deps.now ?? nowSec;

  const range = (from: string, to: string) => {
    const end = dayStart(nextDate(to, 1, deps.tz), deps.tz);
    return buildRange(
      deps.store.eventsUntil(end),
      from,
      to,
      now(),
      deps.tz,
      deps.store.focusUntil(end),
    );
  };

  const parseRange = (q: Record<string, string>) => {
    const r = RangeQuery.safeParse(q);
    if (!r.success || days(r.data.from, r.data.to, deps.tz) > MAX_RANGE_DAYS) return null;
    return r.data;
  };

  return new Hono()
    .get("/health", (c) => c.json({ ok: true }))
    .get("/status", (c) => {
      const t = now();
      const stored = currentState(deps.store.eventsUntil(t + 60));
      const body: Status = {
        now: t,
        device: deps.live.device,
        // 端末と繋がっていれば端末の状態が正
        presence: deps.live.devicePresence ?? stored,
        sync: deps.live.sync,
      };
      return c.json(body);
    })
    .get("/presence", (c) => {
      const q = parseRange(c.req.query());
      if (!q) return c.json({ error: "bad range" }, 400);
      return c.json(range(q.from, q.to));
    })
    .get("/stats", (c) => {
      const q = parseRange(c.req.query());
      if (!q) return c.json({ error: "bad range" }, 400);
      const t = now();
      return c.json(
        buildStats(
          deps.store.eventsUntil(t + 60),
          deps.store.focusUntil(t + 60),
          q.from,
          q.to,
          t,
          deps.tz,
        ),
      );
    })
    .get("/presence/events", (c) => {
      const q = parseRange(c.req.query());
      if (!q) return c.json({ error: "bad range" }, 400);
      const from = dayStart(q.from, deps.tz);
      const to = dayStart(nextDate(q.to, 1, deps.tz), deps.tz) - 1;
      return c.json(deps.store.eventsBetween(from, to));
    })
    .post("/presence/events", async (c) => {
      const body = Edit.safeParse(await c.req.json().catch(() => null));
      if (!body.success) return c.json({ error: "bad request" }, 400);
      const t = now();
      const e = body.data;
      if (e.kind === "state" && (e.at < VALID_SINCE || e.at > t + 60)) {
        return c.json({ error: "bad time" }, 400);
      }
      if (e.kind === "void" && !deps.store.getById(e.voids)) {
        return c.json({ error: "not found" }, 404);
      }
      const ev: PresenceEvent = {
        id: newId(),
        kind: e.kind,
        state: e.kind === "state" ? e.state : undefined,
        voids: e.kind === "void" ? e.voids : undefined,
        deviceId: "pc",
        gen: 0,
        seq: deps.store.nextSeq("pc", 0),
        deviceEpoch: e.kind === "state" ? e.at : t,
        receivedAt: t,
        effectiveAt: e.kind === "state" ? e.at : t,
        source: "web",
        flags: ["manual"],
      };
      deps.store.insert(ev);
      deps.live.publish({ type: "presence", eventId: ev.id, at: ev.effectiveAt });
      return c.json(ev);
    })
    .post("/sync", (c) => {
      deps.requestSync?.();
      return c.json({ ok: true });
    })
    .get("/export.csv", (c) => {
      const q = parseRange(c.req.query());
      if (!q) return c.text("bad range", 400);
      const r = range(q.from, q.to);
      const detail = c.req.query("detail") === "interval";
      c.header("Content-Type", "text/csv; charset=utf-8");
      c.header("Content-Disposition", `attachment; filename="presence-${q.from}_${q.to}.csv"`);
      return c.body(detail ? intervalCsv(r) : dailyCsv(r));
    })
    .get("/export.json", (c) => {
      const q = parseRange(c.req.query());
      if (!q) return c.json({ error: "bad range" }, 400);
      const from = dayStart(q.from, deps.tz);
      const to = dayStart(nextDate(q.to, 1, deps.tz), deps.tz) - 1;
      c.header("Content-Disposition", `attachment; filename="presence-${q.from}_${q.to}.json"`);
      return c.json({ range: range(q.from, q.to), events: deps.store.eventsBetween(from, to) });
    })
    .get("/events", (c) =>
      streamSSE(c, async (stream) => {
        const send = (e: { id: number; msg: unknown }) =>
          stream.writeSSE({ id: String(e.id), event: "message", data: JSON.stringify(e.msg) });
        const last = Number(c.req.header("last-event-id") ?? 0);
        for (const e of deps.live.since(last)) await send(e);
        const unsubscribe = deps.live.subscribe((e) => void send(e));
        stream.onAbort(unsubscribe);
        // 接続を保つ
        while (!stream.aborted) {
          await stream.sleep(25_000);
          await stream.writeSSE({ event: "ping", data: "" });
        }
        unsubscribe();
      }),
    );
}

export type ApiType = ReturnType<typeof createApi>;

export function createApp(deps: Deps) {
  const app = new Hono();
  app.use("*", guard(deps));
  app.route("/api", createApi(deps));
  // 無い API に画面の HTML を返さない
  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  // ビルド済みの Web を同じ origin で配信する
  if (deps.webDir && existsSync(deps.webDir)) {
    app.use("/*", serveStatic({ root: deps.webDir }));
    app.get("*", serveStatic({ path: `${deps.webDir}/index.html` }));
  }
  return app;
}
