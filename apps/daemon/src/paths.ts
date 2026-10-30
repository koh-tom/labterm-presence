import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// DBやバックアップはリポジトリの外 (XDG) に置く
const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
const runtimeDir = process.env.XDG_RUNTIME_DIR || join(homedir(), ".cache");

export const DATA_DIR = process.env.LABTERM_DATA_DIR || join(dataHome, "labterm");
export const DB_PATH = join(DATA_DIR, "labterm.db");
export const BACKUP_DIR = join(DATA_DIR, "backups");
export const EXPORT_DIR = join(DATA_DIR, "exports");
export const SLACK_TOKEN_FILE =
  process.env.LABTERM_SLACK_TOKEN_FILE || join(homedir(), ".config", "labterm", "slack-token");
export const CONTROL_SOCKET =
  process.env.LABTERM_CONTROL_SOCKET || join(runtimeDir, "labterm", "control.sock");

export function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}
