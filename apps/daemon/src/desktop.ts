// 在室の時だけ PC のデスクトップを使えるようにする
//   在室 → 自分のデスクトップのロックを外して表示
//   外出・不在 → ロックして、全画面の表示 (キオスク) の VT に切り替える
//   LABTERM_KIOSK_VT=8 のように VT を指定した時だけ動く。切り替えは sudo -n chvt (sudoers で許可しておく)
import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import { promisify } from "node:util";
import type { PresenceState } from "@labterm/core";
import type pino from "pino";

export type Run = (cmd: string, args: string[]) => Promise<string>;

const execFileP = promisify(execFile);
const run: Run = async (cmd, args) => (await execFileP(cmd, args, { timeout: 5000 })).stdout;

type Session = { id: string; vt: number };

// 自分の画面のセッション (seat0 の wayland / x11)
export async function findSession(r: Run, user: string): Promise<Session | null> {
  const list = await r("loginctl", ["list-sessions", "--no-legend"]);
  for (const line of list.split("\n")) {
    const id = line.trim().split(/\s+/)[0];
    if (!id) continue;
    const out = await r("loginctl", [
      "show-session",
      id,
      "-p",
      "Name",
      "-p",
      "Type",
      "-p",
      "Seat",
      "-p",
      "VTNr",
      "-p",
      "State",
    ]);
    const p = Object.fromEntries(out.split("\n").map((l) => l.split("=", 2) as [string, string]));
    if (p.Name !== user || p.Seat !== "seat0" || !["wayland", "x11"].includes(p.Type ?? ""))
      continue;
    if (p.State === "closing") continue;
    return { id, vt: Number(p.VTNr) };
  }
  return null;
}

export class DesktopLock {
  private kioskVt: number;
  private log: pino.Logger;
  private run: Run;
  private user: string;
  private delayMs: number;
  private checkMs: number;
  private state: PresenceState | null = null;
  private timer: NodeJS.Timeout | null = null;
  private check: NodeJS.Timeout;

  constructor(
    kioskVt: number,
    log: pino.Logger,
    opt: { run?: Run; user?: string; delayMs?: number; checkMs?: number } = {},
  ) {
    this.kioskVt = kioskVt;
    this.log = log;
    this.run = opt.run ?? run;
    this.user = opt.user ?? userInfo().username;
    // 取消 (5秒) で戻ることがあるので、ロックは少し待つ
    this.delayMs = opt.delayMs ?? 6000;
    // 不在の間は、誰かが VT を切り替えても戻す
    this.checkMs = opt.checkMs ?? 30000;
    this.check = setInterval(() => {
      if (this.state && this.state !== "in") void this.apply();
    }, this.checkMs);
  }

  set(state: PresenceState) {
    this.state = state;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.apply(), state === "in" ? 0 : this.delayMs);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    clearInterval(this.check);
  }

  private async chvt(vt: number) {
    await this.run("sudo", ["-n", "/usr/bin/chvt", String(vt)]);
  }

  async apply() {
    const state = this.state;
    if (!state) return;
    try {
      const s = await findSession(this.run, this.user);
      if (state === "in") {
        if (s) {
          await this.run("loginctl", ["unlock-session", s.id]);
          await this.chvt(s.vt);
        } else {
          await this.chvt(1); // ログイン画面
        }
        this.log.info({ session: s?.id ?? null }, "desktop unlocked");
      } else {
        if (s) await this.run("loginctl", ["lock-session", s.id]);
        await this.chvt(this.kioskVt);
      }
    } catch (e) {
      this.log.warn({ err: (e as Error).message }, "desktop switch failed");
    }
  }
}
