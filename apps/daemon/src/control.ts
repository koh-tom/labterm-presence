// 制御用の Unix socket。labterm release がポートを一時的に空けてもらうのに使う
import { chmodSync, existsSync, unlinkSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { dirname } from "node:path";
import { z } from "zod";
import { ensureDir } from "./paths.ts";

const Command = z.discriminatedUnion("cmd", [
  z.object({ cmd: z.literal("release"), seconds: z.number().int().min(1).max(3600) }),
  z.object({ cmd: z.literal("acquire") }),
  z.object({ cmd: z.literal("status") }),
]);
export type Command = z.infer<typeof Command>;

export function startControl(path: string, handle: (c: Command) => Promise<unknown>): Server {
  ensureDir(dirname(path));
  if (existsSync(path)) unlinkSync(path);
  const server = createServer((sock) => {
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", async (d: string) => {
      buf += d;
      if (buf.length > 4096) return sock.destroy();
      const i = buf.indexOf("\n");
      if (i < 0) return;
      let reply: unknown;
      try {
        const cmd = Command.parse(JSON.parse(buf.slice(0, i)));
        reply = { ok: true, result: await handle(cmd) };
      } catch (e) {
        reply = { ok: false, error: (e as Error).message };
      }
      sock.end(`${JSON.stringify(reply)}\n`);
    });
    sock.on("error", () => {});
  });
  server.listen(path, () => chmodSync(path, 0o600));
  return server;
}
