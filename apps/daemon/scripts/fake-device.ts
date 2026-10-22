#!/usr/bin/env node
// 実機なしで試す: 偽の端末を立てて、daemon をそこにつなぐ
//   node scripts/fake-device.ts          →  表示されたコマンドで daemon を起動
//   node scripts/fake-device.ts --auto   →  今朝からの記録を入れて、あとは自動で押し続ける
//   キー: i=入室 a=外出 o=退室 u=取消 x=オフラインで入室 (PCに通知しない) q=終了
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeDevice, virtualPair } from "../src/dev/fake-device.ts";

const auto = process.argv.includes("--auto");
const dir = mkdtempSync(join(tmpdir(), "labterm-"));
const pair = await virtualPair(dir);
const dev = new FakeDevice();
await dev.open(pair.device);

if (auto) {
  // PC が落ちていた間の記録として今朝の分を入れておく
  const h = (x: number) => Math.round(x * 3600);
  const back = (hours: number, state: "in" | "away" | "out") => {
    dev.clockOffset = -h(hours);
    dev.press(state, false);
  };
  back(9, "in");
  back(6, "away");
  back(5, "in");
  dev.clockOffset = 0;
  dev.research(50, 8 * 60, false);
  dev.research(50, 7 * 60, false);
  dev.research(35, 4 * 60, false);
  dev.research(50, 60, false);
}

// 試すときは本物のデータを汚さないように一時フォルダを使う
console.log(
  `fake device ready. 別の端末で:\n  LABTERM_SERIAL=${pair.host} LABTERM_DATA_DIR=${dir}/data LABTERM_CONTROL_SOCKET=${dir}/control.sock pnpm --filter @labterm/daemon start\n`,
);

const show = () => console.log(`state=${dev.state} seq=${dev.events.length}`);

if (auto) {
  const cycle: ("in" | "away" | "out")[] = ["away", "in", "away", "in"];
  let i = 0;
  setInterval(() => {
    dev.press(cycle[i % cycle.length] as "in" | "away" | "out");
    if (dev.state === "in") dev.research(1);
    i++;
    show();
  }, 20000);
} else {
  console.log("i=入室 a=外出 o=退室 u=取消 r=研究を1区間 x=オフラインで入室 q=終了");
}

process.stdin.setRawMode?.(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (k: string) => {
  if (k === "i") dev.press("in");
  else if (k === "a") dev.press("away");
  else if (k === "o") dev.press("out");
  else if (k === "u") dev.undo();
  else if (k === "r") dev.research(25);
  else if (k === "x") dev.press("in", false);
  else if (k === "q" || k === "\u0003") {
    await dev.close();
    pair.stop();
    process.exit(0);
  } else return;
  show();
});
