// CoreS3 とのシリアル接続
import { existsSync } from "node:fs";
import { type DeviceMessage, LineSplitter, parseLine, request } from "@labterm/core";
import type pino from "pino";
import { SerialPort } from "serialport";

export const VENDOR_ID = "303a";
export const PRODUCT_ID = "1001";

// 端末とのやりとり (テストでは偽物に差し替える)
export interface Link {
  request(command: string, timeoutMs?: number): Promise<DeviceMessage[]>;
  onEvent(fn: (msg: DeviceMessage, raw: string) => void): void;
  onClose(fn: () => void): void;
  close(): Promise<void>;
}

// by-id のパスを優先して CoreS3 を探す
export async function findPort(preferred?: string): Promise<string | null> {
  if (preferred && preferred !== "auto") return existsSync(preferred) ? preferred : null;
  const ports = await SerialPort.list();
  const s3 = ports.find(
    (p) => p.vendorId?.toLowerCase() === VENDOR_ID && p.productId?.toLowerCase() === PRODUCT_ID,
  );
  if (!s3) return null;
  const byId = s3.pnpId ? `/dev/serial/by-id/${s3.pnpId}` : null;
  return byId && existsSync(byId) ? byId : s3.path;
}

type Pending = {
  re: number;
  msgs: DeviceMessage[];
  resolve: (m: DeviceMessage[]) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
};

const TERMINAL = new Set(["hello", "state", "ok", "error", "end"]);

export class SerialLink implements Link {
  private port: SerialPort;
  private splitter = new LineSplitter();
  private pending = new Map<number, Pending>();
  private nextRe = 1;
  private eventFns: ((m: DeviceMessage, raw: string) => void)[] = [];
  private closeFns: (() => void)[] = [];
  private log: pino.Logger;

  private constructor(port: SerialPort, log: pino.Logger) {
    this.port = port;
    this.log = log;
    port.setEncoding("utf8");
    port.on("data", (chunk: string) => this.onData(chunk));
    port.on("close", () => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("port closed"));
      }
      this.pending.clear();
      for (const fn of this.closeFns) fn();
    });
    port.on("error", (e) => this.log.warn({ err: e.message }, "serial error"));
  }

  // ESP32-S3 は RTS=1 かつ DTR=0 でリセットされる。
  // 開いた直後 (Linux は DTR/RTS とも 1) から RTS だけ下げれば、リセット条件を一度も通らない
  static async open(path: string, log: pino.Logger): Promise<SerialLink> {
    const port = new SerialPort({
      path,
      baudRate: 115200,
      autoOpen: false,
      hupcl: false,
      lock: true,
    });
    await new Promise<void>((ok, ng) => port.open((e) => (e ? ng(e) : ok())));
    // 仮想シリアル (テスト用の pty) では設定できないので、失敗しても続ける
    await new Promise<void>((ok) =>
      port.set({ rts: false, dtr: true }, (e) => {
        if (e) log.debug({ err: e.message }, "could not set rts/dtr");
        ok();
      }),
    );
    return new SerialLink(port, log);
  }

  private onData(chunk: string) {
    for (const line of this.splitter.push(chunk)) {
      const r = parseLine(line);
      if (!r.ok) {
        if (r.reason !== "ignored")
          this.log.warn(
            { reason: r.reason, detail: r.detail, line: line.slice(0, 200) },
            "bad line",
          );
        continue;
      }
      const msg = r.msg;
      const re = "re" in msg ? msg.re : undefined;
      const p = re !== undefined ? this.pending.get(re) : undefined;
      if (p) {
        p.msgs.push(msg);
        if (TERMINAL.has(msg.type)) {
          clearTimeout(p.timer);
          this.pending.delete(p.re);
          p.resolve(p.msgs);
        }
      } else if (msg.type === "event") {
        for (const fn of this.eventFns) fn(msg, line);
      }
    }
  }

  request(command: string, timeoutMs = 3000): Promise<DeviceMessage[]> {
    const re = this.nextRe;
    this.nextRe = (this.nextRe % 99999999) + 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(re);
        reject(new Error(`timeout: ${command}`));
      }, timeoutMs);
      this.pending.set(re, { re, msgs: [], resolve, reject, timer });
      this.port.write(request(re, command), (e) => {
        if (e) {
          clearTimeout(timer);
          this.pending.delete(re);
          reject(e);
        }
      });
    });
  }

  onEvent(fn: (m: DeviceMessage, raw: string) => void) {
    this.eventFns.push(fn);
  }

  onClose(fn: () => void) {
    this.closeFns.push(fn);
  }

  close(): Promise<void> {
    if (!this.port.isOpen) return Promise.resolve();
    return new Promise((ok) => this.port.close(() => ok()));
  }
}
