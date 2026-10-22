#!/usr/bin/env node
// 実機なしで試す: 偽の端末を立てて、daemon をそこにつなぐ
//   node scripts/fake-device.ts   →  表示されたコマンドで daemon を起動
//   キー: i=入室 a=外出 o=退室 u=取消 x=オフラインで入室 (PCに通知しない) q=終了
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeDevice, virtualPair } from "../src/dev/fake-device.ts";

const pair = await virtualPair(mkdtempSync(join(tmpdir(), "labterm-")));
const dev = new FakeDevice();
await dev.open(pair.device);

console.log(
  `fake device ready. 別の端末で:\n  LABTERM_SERIAL=${pair.host} pnpm --filter @labterm/daemon dev\n`,
);
console.log("i=入室 a=外出 o=退室 u=取消 x=オフラインで入室 q=終了");

process.stdin.setRawMode?.(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (k: string) => {
  if (k === "i") dev.press("in");
  else if (k === "a") dev.press("away");
  else if (k === "o") dev.press("out");
  else if (k === "u") dev.undo();
  else if (k === "x") dev.press("in", false);
  else if (k === "q" || k === "\u0003") {
    await dev.close();
    pair.stop();
    process.exit(0);
  } else return;
  console.log(`state=${dev.state} seq=${dev.events.length}`);
});
