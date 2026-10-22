import { describe, expect, it } from "vitest";
import { LineSplitter, MAX_LINE, parseLine } from "../src/protocol.ts";

const hello =
  '@labterm {"type":"hello","re":1,"proto":1,"device":"48:27:e2:66:5d:18","gen":2894712,"lastSeq":57,"fw":"abc","epoch":1792633111,"timeValid":true,"uptime":523}';

describe("parseLine", () => {
  it("reads each message type", () => {
    expect(parseLine(hello)).toMatchObject({ ok: true, msg: { type: "hello", gen: 2894712 } });
    expect(
      parseLine('@labterm {"type":"state","re":2,"state":"in","since":1792630711,"seq":57}'),
    ).toMatchObject({ ok: true });
    expect(
      parseLine(
        '@labterm {"type":"event","gen":1,"seq":2,"kind":"state","state":"out","epoch":1792651312,"source":"button"}',
      ),
    ).toMatchObject({ ok: true, msg: { type: "event", state: "out" } });
    expect(
      parseLine(
        '@labterm {"type":"event","gen":1,"seq":3,"kind":"void","voids":2,"epoch":1792651315,"source":"button"}',
      ),
    ).toMatchObject({ ok: true, msg: { kind: "void", voids: 2 } });
    expect(parseLine('@labterm {"type":"end","re":3,"count":0}')).toMatchObject({ ok: true });
    expect(parseLine('@labterm {"type":"error","re":5,"code":"bad_args"}')).toMatchObject({
      ok: true,
    });
  });

  it("ignores human output and esp logs", () => {
    expect(parseLine("[  3087][E][sd_diskio.cpp:199] sdCommand(): Card Failed!")).toEqual({
      ok: false,
      reason: "ignored",
    });
    expect(parseLine("time  2026-10-22 09:00:00").ok).toBe(false);
  });

  it("rejects broken lines", () => {
    expect(parseLine("@labterm {not json")).toMatchObject({ reason: "bad_json" });
    expect(parseLine('@labterm {"type":"weather"}')).toMatchObject({ reason: "unknown_type" });
    // state 無しの state イベント
    expect(
      parseLine(
        '@labterm {"type":"event","gen":1,"seq":2,"kind":"state","epoch":1792651312,"source":"button"}',
      ),
    ).toMatchObject({ reason: "bad_schema" });
    // 不正な state
    expect(
      parseLine(
        '@labterm {"type":"event","gen":1,"seq":2,"kind":"state","state":"sleep","epoch":1792651312,"source":"button"}',
      ),
    ).toMatchObject({ reason: "bad_schema" });
    // 未来すぎる時刻
    expect(
      parseLine(
        '@labterm {"type":"event","gen":1,"seq":2,"kind":"state","state":"in","epoch":9999999999,"source":"button"}',
      ),
    ).toMatchObject({ reason: "bad_schema" });
  });
});

describe("LineSplitter", () => {
  it("splits chunks into lines", () => {
    const s = new LineSplitter();
    expect(s.push("ab")).toEqual([]);
    expect(s.push("c\r\nde\nf")).toEqual(["abc", "de"]);
    expect(s.push("\n")).toEqual(["f"]);
  });

  it("drops oversized lines", () => {
    const s = new LineSplitter();
    expect(s.push("x".repeat(MAX_LINE + 10))).toEqual([]);
    expect(s.push("still long\nok\n")).toEqual(["ok"]);
    expect(s.dropped).toBe(1);
  });

  it("keeps events interleaved with a since response", () => {
    const s = new LineSplitter();
    const lines = s.push(
      '@labterm {"type":"event","re":3,"gen":1,"seq":1,"kind":"state","state":"in","epoch":1792600000,"source":"button"}\n' +
        '@labterm {"type":"event","gen":1,"seq":3,"kind":"state","state":"out","epoch":1792651312,"source":"button"}\n' +
        '@labterm {"type":"end","re":3,"count":1}\n',
    );
    expect(lines.map((l) => parseLine(l).ok)).toEqual([true, true, true]);
  });
});
