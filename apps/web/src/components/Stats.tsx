import type { PresenceRange } from "@labterm/core";
import { hm } from "../lib/format.ts";

function diff(sec: number): string {
  if (Math.abs(sec) < 60) return "±0:00";
  return `${sec > 0 ? "+" : "−"}${hm(Math.abs(sec))}`;
}

export function Stats({ data, prev }: { data?: PresenceRange; prev?: PresenceRange }) {
  const items = [
    { label: "今日", value: data ? hm(data.today.presenceSec) : "–" },
    {
      label: "期間",
      value: data ? hm(data.range.totalSec) : "–",
      // 前の同じ長さの期間との差
      note: data && prev ? diff(data.range.totalSec - prev.range.totalSec) : undefined,
    },
    { label: "平均", value: data ? hm(data.range.averageSec) : "–" },
    { label: "在室日", value: data ? String(data.range.labDays) : "–" },
  ];
  return (
    <dl className="contents">
      {items.map((it) => (
        <div key={it.label}>
          <dd className={`num text-[44px] leading-none font-extralight tracking-[-0.02em] `}>
            {it.value}
          </dd>
          <dt className="mt-2.5 flex items-baseline gap-2 text-xs text-sub">
            {it.label}
            {"note" in it && it.note && <span className="num text-faint">前の期間 {it.note}</span>}
          </dt>
        </div>
      ))}
    </dl>
  );
}
