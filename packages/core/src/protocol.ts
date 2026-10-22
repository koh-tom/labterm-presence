// labterm (CoreS3) とのシリアルプロトコル proto 1
//   PC → 端末: "@q <reqId> <command>"   端末 → PC: "@labterm {json}"
import { z } from "zod";

export const PROTO = 1;
export const PREFIX = "@labterm ";
export const MAX_LINE = 2048;

const u32 = z.number().int().min(0).max(0xffffffff);
const epoch = z.number().int().min(0).max(4102444800);
const re = z.number().int().min(1).max(99999999);

const Hello = z.object({
  type: z.literal("hello"),
  re,
  proto: z.number().int(),
  device: z.string().regex(/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/),
  gen: u32,
  lastSeq: u32,
  fw: z.string().max(64),
  epoch,
  timeValid: z.boolean(),
  uptime: u32,
});

const State = z.object({
  type: z.literal("state"),
  re,
  state: z.enum(["in", "away", "out"]),
  since: epoch,
  seq: u32,
});

const Event = z
  .object({
    type: z.literal("event"),
    re: re.optional(),
    gen: u32.refine((g) => g > 0),
    seq: u32.refine((s) => s > 0),
    kind: z.enum(["state", "void"]),
    state: z.enum(["in", "away", "out"]).optional(),
    voids: u32.optional(),
    epoch,
    source: z.enum(["button", "focus"]),
  })
  .refine((e) => (e.kind === "state" ? e.state !== undefined : e.voids !== undefined), {
    message: "state event needs state, void event needs voids",
  });

const End = z.object({ type: z.literal("end"), re, count: z.number().int().min(0) });
const Ok = z.object({ type: z.literal("ok"), re });
const Err = z.object({ type: z.literal("error"), re, code: z.string().max(32) });

export const DeviceMessage = z.union([Hello, State, Event, End, Ok, Err]);
export type DeviceMessage = z.infer<typeof DeviceMessage>;
export type HelloMessage = z.infer<typeof Hello>;
export type EventMessage = z.infer<typeof Event>;

export type ParseResult =
  | { ok: true; msg: DeviceMessage }
  | { ok: false; reason: "ignored" | "bad_json" | "bad_schema" | "unknown_type"; detail?: string };

const KNOWN = new Set(["hello", "state", "event", "end", "ok", "error"]);

// 1行を解釈する。@labterm 以外の行 (人間向けの出力やESPのログ) は ignored
export function parseLine(line: string): ParseResult {
  if (!line.startsWith(PREFIX)) return { ok: false, reason: "ignored" };
  let data: unknown;
  try {
    data = JSON.parse(line.slice(PREFIX.length));
  } catch {
    return { ok: false, reason: "bad_json" };
  }
  const type = (data as { type?: unknown })?.type;
  if (typeof type !== "string" || !KNOWN.has(type)) return { ok: false, reason: "unknown_type" };
  const r = DeviceMessage.safeParse(data);
  if (!r.success) return { ok: false, reason: "bad_schema", detail: r.error.issues[0]?.message };
  return { ok: true, msg: r.data };
}

// 受信したバイト列を行に分ける。MAX_LINE を超えた行は捨てる
export class LineSplitter {
  private buf = "";
  private dropping = false;
  dropped = 0;

  push(chunk: string): string[] {
    const lines: string[] = [];
    this.buf += chunk;
    for (;;) {
      const i = this.buf.indexOf("\n");
      if (i < 0) break;
      const line = this.buf.slice(0, i).replace(/\r$/, "");
      this.buf = this.buf.slice(i + 1);
      if (this.dropping) {
        this.dropping = false;
        continue;
      }
      lines.push(line);
    }
    if (this.buf.length > MAX_LINE) {
      this.buf = "";
      this.dropping = true;
      this.dropped++;
    }
    return lines;
  }
}

// PC → 端末の要求
export function request(re: number, command: string): string {
  return `@q ${re} ${command}\n`;
}
