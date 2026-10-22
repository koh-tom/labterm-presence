import type { PresenceRange } from "@labterm/core";
import { hm } from "../lib/format.ts";

export function Stats({ data, inLab }: { data?: PresenceRange; inLab: boolean }) {
  const items = [
    { label: "今日", value: data ? hm(data.today.presenceSec) : "–", accent: inLab },
    { label: "期間", value: data ? hm(data.range.totalSec) : "–" },
    { label: "平均", value: data ? hm(data.range.averageSec) : "–" },
    { label: "在室日", value: data ? String(data.range.labDays) : "–" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-y-6 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label}>
          <dd
            className={`num text-[44px] leading-none font-extralight tracking-[-0.02em] ${it.accent ? "text-presence" : ""}`}
          >
            {it.value}
          </dd>
          <dt className="mt-2.5 text-xs text-sub">{it.label}</dt>
        </div>
      ))}
    </dl>
  );
}
