import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// イベントログ。これが正で、区間や集計は毎回ここから作る
export const presenceEvents = sqliteTable(
  "presence_events",
  {
    id: text("id").primaryKey(), // ULID
    kind: text("kind", { enum: ["state", "void"] }).notNull(),
    state: text("state", { enum: ["in", "away", "out"] }),
    voids: text("voids"),
    deviceId: text("device_id").notNull(),
    gen: integer("gen").notNull(),
    seq: integer("seq").notNull(),
    deviceEpoch: integer("device_epoch").notNull(),
    receivedAt: integer("received_at").notNull(),
    effectiveAt: integer("effective_at").notNull(),
    source: text("source", { enum: ["button", "focus", "web"] }).notNull(),
    flags: text("flags", { mode: "json" }).$type<string[]>().notNull().default([]),
    raw: text("raw"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("presence_events_device_seq").on(t.deviceId, t.gen, t.seq),
    index("presence_events_effective_at").on(t.effectiveAt),
  ],
);

// 端末ごとにどこまで取り込んだか
export const deviceSync = sqliteTable(
  "device_sync",
  {
    deviceId: text("device_id").notNull(),
    gen: integer("gen").notNull(),
    lastSeq: integer("last_seq").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    fw: text("fw"),
  },
  (t) => [primaryKey({ columns: [t.deviceId, t.gen] })],
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
