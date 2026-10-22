import { chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { ensureDir } from "../paths.ts";
import * as schema from "./schema.ts";

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

export function openDb(path: string) {
  if (path !== ":memory:") {
    ensureDir(dirname(path));
    const fresh = !existsSync(path);
    const sqlite = new Database(path);
    if (fresh) chmodSync(path, 0o600);
    return setup(sqlite);
  }
  return setup(new Database(":memory:"));
}

function setup(sqlite: Database.Database) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, sqlite };
}

export type Db = ReturnType<typeof openDb>["db"];
export { schema };
