// 実機の代わりに labterm のプロトコルを話す偽の端末 (開発・テスト用)
//   socat で作った仮想シリアルの片側を開いて、@q の要求に答える
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { SerialPort } from "serialport";

type State = "in" | "away" | "out";
type Ev = {
  seq: number;
  kind: "state" | "void";
  state?: State;
  voids?: number;
  epoch: number;
  source: string;
};

export class FakeDevice {
  gen = Math.floor(Math.random() * 0xfffffff) + 1;
  state: State = "out";
  since = 0;
  events: Ev[] = [];
  focus: { start: number; end: number; sec: number; done: boolean }[] = [];
  epoch = () => Math.floor(Date.now() / 1000) + this.clockOffset;
  clockOffset = 0;
  private port: SerialPort | null = null;
  private buf = "";

  async open(path: string) {
    this.port = new SerialPort({ path, baudRate: 115200 });
    await new Promise<void>((ok, ng) => this.port?.once("open", ok).once("error", ng));
    this.port.setEncoding("utf8");
    this.port.on("data", (d: string) => this.onData(d));
  }

  async close() {
    const p = this.port;
    this.port = null;
    if (p?.isOpen) await new Promise<void>((ok) => p.close(() => ok()));
  }

  private write(obj: object) {
    this.port?.write(`@labterm ${JSON.stringify(obj)}\n`);
  }

  private eventJson(e: Ev, re?: number) {
    return {
      type: "event",
      ...(re ? { re } : {}),
      gen: this.gen,
      seq: e.seq,
      kind: e.kind,
      ...(e.kind === "state" ? { state: e.state } : { voids: e.voids }),
      epoch: e.epoch,
      source: e.source,
    };
  }

  // ボタンを押したのと同じ。online=false なら通知を出さない (PCが落ちていた想定)
  press(state: State, online = true) {
    if (state === this.state) return;
    if (this.state === "out" && state === "away") return;
    const e: Ev = {
      seq: this.events.length + 1,
      kind: "state",
      state,
      epoch: this.epoch(),
      source: "button",
    };
    this.events.push(e);
    this.state = state;
    this.since = e.epoch;
    if (online) this.write(this.eventJson(e));
  }

  // 研究タイマーで1区間研究した (今から minutes 分前まで)
  research(minutes: number, endedAgoMin = 0, online = true) {
    const end = this.epoch() - endedAgoMin * 60;
    const f = { start: end - minutes * 60, end, sec: minutes * 60, done: minutes >= 50 };
    this.focus.push(f);
    if (online) this.write({ type: "focus", ...f });
  }

  undo(online = true) {
    const last = [...this.events].reverse().find((e) => e.kind === "state");
    if (!last) return;
    const prev = [...this.events].reverse().find((e) => e.kind === "state" && e.seq < last.seq);
    const e: Ev = {
      seq: this.events.length + 1,
      kind: "void",
      voids: last.seq,
      epoch: this.epoch(),
      source: "button",
    };
    this.events.push(e);
    this.state = prev?.state ?? "out";
    this.since = prev?.epoch ?? 0;
    if (online) this.write(this.eventJson(e));
  }

  private onData(d: string) {
    this.buf += d;
    for (;;) {
      const i = this.buf.indexOf("\n");
      if (i < 0) break;
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      const m = /^@q (\d+) (.+)$/.exec(line);
      if (m) this.handle(Number(m[1]), m[2] as string);
    }
  }

  private handle(re: number, cmd: string) {
    if (cmd === "hello") {
      this.write({
        type: "hello",
        re,
        proto: 1,
        device: "02:00:00:00:00:01",
        gen: this.gen,
        lastSeq: this.events.length,
        fw: "fake",
        epoch: this.epoch(),
        timeValid: true,
        uptime: Math.floor(process.uptime()),
      });
    } else if (cmd === "state") {
      this.write({
        type: "state",
        re,
        state: this.state,
        since: this.since,
        seq: this.events.length,
      });
    } else if (cmd.startsWith("since ")) {
      const [g, s] = cmd.slice(6).split(" ").map(Number);
      const list = g === this.gen ? this.events.filter((e) => e.seq > (s ?? 0)) : [];
      for (const e of list) this.write(this.eventJson(e, re));
      this.write({ type: "end", re, count: list.length });
    } else if (cmd.startsWith("focus ")) {
      const after = Number(cmd.slice(6));
      const list = this.focus.filter((f) => f.start > after);
      for (const f of list) this.write({ type: "focus", re, ...f });
      this.write({ type: "end", re, count: list.length });
    } else if (cmd.startsWith("time ")) {
      this.clockOffset = Number(cmd.slice(5)) - Math.floor(Date.now() / 1000);
      this.write({ type: "ok", re });
    } else {
      this.write({ type: "error", re, code: "unknown" });
    }
  }
}

// socat で仮想シリアルのペアを作る。片方を端末役、もう片方を daemon が開く
export async function virtualPair(
  dir: string,
): Promise<{ device: string; host: string; stop: () => void }> {
  const device = `${dir}/fake-device`;
  const host = `${dir}/fake-host`;
  const p: ChildProcess = spawn("socat", [
    `pty,raw,echo=0,link=${device}`,
    `pty,raw,echo=0,link=${host}`,
  ]);
  for (let i = 0; i < 50 && !(existsSync(device) && existsSync(host)); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!existsSync(device)) throw new Error("socat failed");
  return { device, host, stop: () => p.kill() };
}
