#!/usr/bin/env node
// labterm コマンド
//   labterm release [--seconds N] [-- <command...>]   daemon にポートを空けてもらう
//   labterm status
//   labterm install-service                         systemd の user unit を入れる
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTROL_SOCKET } from "./paths.ts";

function send(msg: object): Promise<{ ok: boolean; error?: string } | null> {
  return new Promise((done) => {
    if (!existsSync(CONTROL_SOCKET)) return done(null);
    const sock = connect(CONTROL_SOCKET);
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("connect", () => sock.write(`${JSON.stringify(msg)}\n`));
    sock.on("data", (d: string) => {
      buf += d;
    });
    sock.on("end", () => {
      try {
        done(JSON.parse(buf));
      } catch {
        done(null);
      }
    });
    sock.on("error", () => done(null));
  });
}

async function release(args: string[]) {
  const sep = args.indexOf("--");
  const opts = sep >= 0 ? args.slice(0, sep) : args;
  const cmd = sep >= 0 ? args.slice(sep + 1) : [];
  const i = opts.indexOf("--seconds");
  const seconds = i >= 0 ? Number(opts[i + 1]) : cmd.length ? 600 : 120;

  const res = await send({ cmd: "release", seconds });
  if (res && !res.ok) throw new Error(res.error);
  if (!res) console.error("labterm: daemon が動いていないのでそのまま実行します");
  else await new Promise((r) => setTimeout(r, 300)); // ポートが閉じるのを待つ

  if (!cmd.length) {
    if (res) console.error(`labterm: ${seconds}秒ポートを空けました`);
    return;
  }
  const code = await new Promise<number>((done) => {
    const p = spawn(cmd[0] as string, cmd.slice(1), { stdio: "inherit" });
    p.on("exit", (c) => done(c ?? 1));
    p.on("error", (e) => {
      console.error(e.message);
      done(127);
    });
  });
  if (res) await send({ cmd: "acquire" });
  process.exit(code);
}

function installService() {
  const here = dirname(fileURLToPath(import.meta.url));
  const main = resolve(here, "main.ts");
  const unitDir = join(homedir(), ".config", "systemd", "user");
  mkdirSync(unitDir, { recursive: true });
  writeFileSync(
    join(unitDir, "labterm-presence.service"),
    `[Unit]
Description=labterm presence daemon

[Service]
ExecStart=${process.execPath} ${main}
Environment=NODE_ENV=production
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
`,
  );
  // labterm コマンドを PATH に置く
  const bin = join(homedir(), ".local", "bin");
  mkdirSync(bin, { recursive: true });
  const link = join(bin, "labterm");
  if (existsSync(link)) unlinkSync(link);
  symlinkSync(resolve(here, "cli.ts"), link);
  console.log(
    "installed. 次で起動:\n  systemctl --user daemon-reload\n  systemctl --user enable --now labterm-presence",
  );
}

const [sub, ...rest] = process.argv.slice(2);
if (sub === "release") {
  await release(rest);
} else if (sub === "status") {
  const res = await send({ cmd: "status" });
  console.log(res ? JSON.stringify(res) : "daemon is not running");
} else if (sub === "install-service") {
  installService();
} else {
  console.log("usage: labterm release [--seconds N] [-- <command...>] | status | install-service");
  process.exit(sub ? 1 : 0);
}
