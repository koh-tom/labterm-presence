import pino from "pino";
import { describe, expect, it } from "vitest";
import { SlackStatus } from "../src/slack.ts";

const log = pino({ level: "silent" });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Slack API の代わり
function fakeSlack(current = { status_emoji: "", status_text: "" }, fail = 0) {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  let failing = fail;
  const f = (async (url: string, init: RequestInit) => {
    const method = url.split("/").pop() as string;
    const body = JSON.parse(String(init.body));
    calls.push({ method, body });
    if (failing > 0) {
      failing--;
      return new Response(JSON.stringify({ ok: false, error: "fatal_error" }));
    }
    if (method === "users.profile.get")
      return new Response(JSON.stringify({ ok: true, profile: current }));
    if (method === "users.profile.set") Object.assign(current, body.profile);
    return new Response(JSON.stringify({ ok: true }));
  }) as unknown as typeof fetch;
  return { f, calls, current };
}

describe("slack status", () => {
  it("sets status and presence for each state", async () => {
    const s = fakeSlack();
    const slack = new SlackStatus("xoxp-test", log, { fetch: s.f, delayMs: 5 });
    slack.set("in");
    await wait(30);
    expect(s.current).toMatchObject({ status_emoji: ":office:", status_text: "研究室" });
    expect(s.calls.at(-1)).toEqual({ method: "users.setPresence", body: { presence: "auto" } });

    slack.set("out");
    await wait(30);
    expect(s.current).toMatchObject({ status_emoji: ":house:", status_text: "不在" });
    expect(s.calls.at(-1)?.body).toEqual({ presence: "away" });
    slack.stop();
  });

  it("waits so that an undo does not send anything", async () => {
    const s = fakeSlack();
    const slack = new SlackStatus("xoxp-test", log, { fetch: s.f, delayMs: 40 });
    slack.set("in");
    await wait(60);
    slack.set("out");
    await wait(10);
    slack.set("in"); // 取消で戻った
    await wait(80);
    expect(s.calls.filter((c) => c.method === "users.profile.set")).toHaveLength(1);
    slack.stop();
  });

  it("does not overwrite a status set by hand", async () => {
    const s = fakeSlack({ status_emoji: ":spiral_calendar_pad:", status_text: "会議中" });
    const slack = new SlackStatus("xoxp-test", log, { fetch: s.f, delayMs: 5 });
    slack.set("away");
    await wait(30);
    expect(s.current.status_text).toBe("会議中");
    expect(s.calls.some((c) => c.method === "users.profile.set")).toBe(false);
    expect(s.calls.at(-1)?.method).toBe("users.setPresence");
    slack.stop();
  });

  it("retries after an error", async () => {
    const s = fakeSlack(undefined, 1);
    const slack = new SlackStatus("xoxp-test", log, { fetch: s.f, delayMs: 5, retryMs: 20 });
    slack.set("in");
    await wait(80);
    expect(s.current.status_text).toBe("研究室");
    slack.stop();
  });
});
