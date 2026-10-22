// 毎日のバックアップと、月ごとの CSV
import { chmodSync, existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildRange, dateOf, dayStart, nextDate } from "@labterm/core";
import type Database from "better-sqlite3";
import type pino from "pino";
import { dailyCsv } from "./csv.ts";
import { ensureDir } from "./paths.ts";
import { now, type Store } from "./store.ts";

const KEEP_DAILY = 14;
const KEEP_MONTHLY = 12;

export function backupNow(sqlite: Database.Database, dir: string, date: string): string | null {
  ensureDir(dir);
  const file = join(dir, `labterm-${date.replaceAll("-", "")}.db`);
  if (existsSync(file)) return null;
  sqlite.prepare("VACUUM INTO ?").run(file);
  chmodSync(file, 0o600);
  return file;
}

// 日次は新しい14個、月初の分は新しい12個を残す
export function prune(dir: string) {
  const files = readdirSync(dir)
    .filter((f) => /^labterm-\d{8}\.db$/.test(f))
    .sort()
    .reverse();
  const keep = new Set(files.slice(0, KEEP_DAILY));
  for (const f of files.filter((f) => f.slice(14, 16) === "01").slice(0, KEEP_MONTHLY)) keep.add(f);
  for (const f of files) if (!keep.has(f)) unlinkSync(join(dir, f));
}

// 前月の CSV が無ければ作る
export function exportLastMonth(
  store: Store,
  dir: string,
  tz: string,
  today: string,
): string | null {
  ensureDir(dir);
  const first = `${today.slice(0, 7)}-01`;
  const last = nextDate(first, -1, tz);
  const from = `${last.slice(0, 7)}-01`;
  const file = join(dir, `${last.slice(0, 7)}.csv`);
  if (existsSync(file)) return null;
  const events = store.eventsUntil(now());
  const r = buildRange(events, from, last, now(), tz);
  if (r.range.totalSec === 0) return null;
  writeFileSync(file, dailyCsv(r), { mode: 0o600 });
  return file;
}

// 起動時と毎日 4:00 に実行する
export function scheduleBackups(run: () => void, tz: string, log: pino.Logger): () => void {
  let timer: NodeJS.Timeout;
  const loop = () => {
    try {
      run();
    } catch (e) {
      log.error({ err: (e as Error).message }, "backup failed");
    }
    const t = now();
    const today = dateOf(t, tz);
    const next4 = dayStart(nextDate(today, 1, tz), tz) + 4 * 3600;
    timer = setTimeout(loop, Math.max(60, next4 - t) * 1000);
  };
  loop();
  return () => clearTimeout(timer);
}
