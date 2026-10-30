// labterm-presence daemon
//   CoreS3 とつないでイベントを取り込み、127.0.0.1:8787 で Web と API を出す
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { DEFAULT_TZ, dateOf } from "@labterm/core";
import pino from "pino";
import { createApp } from "./app.ts";
import { backupNow, exportLastMonth, prune, scheduleBackups } from "./backup.ts";
import { startControl } from "./control.ts";
import { openDb } from "./db/index.ts";
import { findPort, SerialLink } from "./device/link.ts";
import { DeviceService } from "./device/service.ts";
import { Live } from "./live.ts";
import { BACKUP_DIR, CONTROL_SOCKET, DB_PATH, EXPORT_DIR } from "./paths.ts";
import { now, Store } from "./store.ts";

const PORT = Number(process.env.LABTERM_PORT ?? 8787);
const TZ = process.env.LABTERM_TZ ?? DEFAULT_TZ;
const DEV = process.env.NODE_ENV !== "production";
// 例: LABTERM_ALLOWED_HOSTS=koh-lila.tail1234.ts.net (tailscale serve で見る時)
const ALLOWED_HOSTS = (process.env.LABTERM_ALLOWED_HOSTS ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter((h) => /^[a-z0-9.-]+(:\d+)?$/.test(h));
const WEB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "dist");

const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.stdout.isTTY ? { transport: { target: "pino-pretty" } } : {}),
});

const { db, sqlite } = openDb(DB_PATH);
const store = new Store(db);
const live = new Live();

const device = new DeviceService(
  store,
  live,
  async () => {
    const path = await findPort(process.env.LABTERM_SERIAL);
    return path ? SerialLink.open(path, log) : null;
  },
  log,
);
device.start();

const app = createApp({
  store,
  live,
  tz: TZ,
  port: PORT,
  dev: DEV,
  allowedHosts: ALLOWED_HOSTS,
  webDir: WEB_DIR,
  requestSync: () => device.requestSync(),
});
const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: PORT }, (info) =>
  log.info(`http://127.0.0.1:${info.port}`),
);

const control = startControl(CONTROL_SOCKET, async (cmd) => {
  if (cmd.cmd === "release") {
    await device.release(cmd.seconds);
    log.info({ seconds: cmd.seconds }, "port released");
  } else if (cmd.cmd === "acquire") {
    device.acquire();
    log.info("port acquire");
  }
  return { device: live.device.state };
});

const stopBackups = scheduleBackups(
  () => {
    const today = dateOf(now(), TZ);
    const b = backupNow(sqlite, BACKUP_DIR, today);
    if (b) log.info({ file: b }, "backup");
    prune(BACKUP_DIR);
    const csv = exportLastMonth(store, EXPORT_DIR, TZ, today);
    if (csv) log.info({ file: csv }, "monthly csv");
  },
  TZ,
  log,
);

async function shutdown() {
  log.info("shutting down");
  stopBackups();
  control.close();
  server.close();
  await device.stop();
  sqlite.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
