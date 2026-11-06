import pino from "pino";
import { describe, expect, it } from "vitest";
import { DesktopLock, type Run } from "../src/desktop.ts";

const log = pino({ level: "silent" });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// loginctl / sudo chvt の代わり
function fakeRun(sessions: Record<string, string>) {
  const calls: string[] = [];
  const run: Run = async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    if (args[0] === "list-sessions")
      return Object.keys(sessions)
        .map((id) => `${id} 1000 koh`)
        .join("\n");
    if (args[0] === "show-session") return sessions[args[1] as string] ?? "";
    return "";
  };
  return { run, calls };
}

const gui = "Name=koh\nType=wayland\nSeat=seat0\nVTNr=2\nState=active\n";
const ssh = "Name=koh\nType=tty\nSeat=\nVTNr=0\nState=active\n";

describe("desktop lock", () => {
  it("locks and shows the kiosk when out, unlocks when in", async () => {
    const f = fakeRun({ c84: ssh, "3": gui });
    const d = new DesktopLock(8, log, { run: f.run, user: "koh", delayMs: 5, checkMs: 60000 });
    d.set("out");
    await wait(30);
    expect(f.calls).toContain("loginctl lock-session 3");
    expect(f.calls.at(-1)).toBe("sudo -n /usr/bin/chvt 8");

    f.calls.length = 0;
    d.set("in");
    await wait(30);
    expect(f.calls).toContain("loginctl unlock-session 3");
    expect(f.calls.at(-1)).toBe("sudo -n /usr/bin/chvt 2");
    d.stop();
  });

  it("waits for undo before locking", async () => {
    const f = fakeRun({ "3": gui });
    const d = new DesktopLock(8, log, { run: f.run, user: "koh", delayMs: 50, checkMs: 60000 });
    d.set("out");
    await wait(10);
    d.set("in");
    await wait(80);
    expect(f.calls.some((c) => c.startsWith("loginctl lock-session"))).toBe(false);
    d.stop();
  });

  it("goes to the login screen when not logged in", async () => {
    const f = fakeRun({ c84: ssh });
    const d = new DesktopLock(8, log, { run: f.run, user: "koh", delayMs: 5, checkMs: 60000 });
    d.set("in");
    await wait(30);
    expect(f.calls.at(-1)).toBe("sudo -n /usr/bin/chvt 1");
    d.stop();
  });
});
