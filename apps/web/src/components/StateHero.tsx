import type { Status } from "@labterm/core";
import clsx from "clsx";
import { clock } from "../lib/format.ts";

// 今の在室状態を大きく出す
export function StateHero({ status, tz }: { status?: Status; tz: string }) {
  const p = status?.presence;
  const state = p?.state ?? "out";
  const label = state === "in" ? "在室" : state === "away" ? "外出" : "不在";
  const since =
    p?.since && state !== "out"
      ? `${clock(p.since, tz)} から`
      : p?.since
        ? `${clock(p.since, tz)} に退室`
        : "";

  return (
    <div className="fade">
      <div className="flex items-center gap-3">
        <span
          className={clsx(
            "size-3.5 shrink-0 rounded-full",
            state === "in" && "now-pulse bg-presence",
            state === "away" && "bg-presence-soft ring-2 ring-presence ring-inset",
            state === "out" && "bg-cell ring-2 ring-faint ring-inset",
          )}
        />
        <span
          className={clsx(
            "text-[44px] leading-none font-light tracking-tight",
            state === "in" && "text-presence",
            state === "away" && "text-presence/70",
            state === "out" && "text-sub",
          )}
        >
          {label}
        </span>
      </div>
      <div className="num mt-2.5 pl-[26px] text-xs text-sub">{since || " "}</div>
    </div>
  );
}
