// 在室状態を Slack のステータスに出す
//   トークンは ~/.config/labterm/slack-token (権限 0600) に置く。無ければ何もしない
import { readFileSync, statSync } from "node:fs";
import type { PresenceState } from "@labterm/core";
import type pino from "pino";

type Status = { emoji: string; text: string; presence: "auto" | "away" };

export const STATUSES: Record<PresenceState, Status> = {
  in: { emoji: ":office:", text: "研究室", presence: "auto" },
  away: { emoji: ":walking:", text: "外出中", presence: "auto" },
  out: { emoji: ":house:", text: "不在", presence: "away" },
};

// この連携が付けたステータスかどうか (手で付けた「会議中」などは上書きしない)
function isOurs(emoji: string, text: string): boolean {
  if (!emoji && !text) return true;
  return Object.values(STATUSES).some((s) => s.emoji === emoji && s.text === text);
}

export function readToken(path: string, log: pino.Logger): string | null {
  try {
    const st = statSync(path);
    if (st.mode & 0o077) {
      log.warn({ path }, "slack token file should be chmod 600");
    }
    const token = readFileSync(path, "utf8").trim();
    if (!/^xoxp-[A-Za-z0-9-]+$/.test(token)) {
      log.warn("slack token must be a user token (xoxp-)");
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

type Fetch = typeof fetch;

export class SlackStatus {
  private token: string;
  private log: pino.Logger;
  private fetch: Fetch;
  private delayMs: number;
  private retryMs: number;
  private wanted: PresenceState | null = null;
  private applied: PresenceState | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    token: string,
    log: pino.Logger,
    opt: { fetch?: Fetch; delayMs?: number; retryMs?: number } = {},
  ) {
    this.token = token;
    this.log = log;
    this.fetch = opt.fetch ?? fetch;
    // 取消 (5秒) で戻ることがあるので少し待ってから送る
    this.delayMs = opt.delayMs ?? 6000;
    this.retryMs = opt.retryMs ?? 60000;
  }

  set(state: PresenceState) {
    this.wanted = state;
    this.schedule(this.delayMs);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  private async call(method: string, body: object): Promise<Record<string, unknown>> {
    const res = await this.fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      throw new RetryLater(Number(res.headers.get("retry-after") ?? 60) * 1000);
    }
    const json = (await res.json()) as Record<string, unknown>;
    if (!json.ok) throw new Error(`slack ${method}: ${String(json.error)}`);
    return json;
  }

  async flush() {
    const state = this.wanted;
    if (state === null || state === this.applied) return;
    const want = STATUSES[state];
    try {
      const cur = await this.call("users.profile.get", {});
      const profile = (cur.profile ?? {}) as { status_emoji?: string; status_text?: string };
      if (isOurs(profile.status_emoji ?? "", profile.status_text ?? "")) {
        await this.call("users.profile.set", {
          profile: { status_emoji: want.emoji, status_text: want.text, status_expiration: 0 },
        });
      } else {
        this.log.info("slack status was set by hand; leaving it");
      }
      await this.call("users.setPresence", { presence: want.presence });
      this.applied = state;
      this.log.info({ state }, "slack status updated");
    } catch (e) {
      const wait = e instanceof RetryLater ? e.ms : this.retryMs;
      this.log.warn({ err: (e as Error).message, retryInMs: wait }, "slack update failed");
      this.schedule(wait);
    }
  }
}

class RetryLater extends Error {
  ms: number;
  constructor(ms: number) {
    super("rate limited");
    this.ms = ms;
  }
}
