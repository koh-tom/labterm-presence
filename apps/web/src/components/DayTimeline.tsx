import type { DayData } from "@labterm/core";
import { dayStart } from "@labterm/core";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { clock, hm, md, weekday } from "../lib/format.ts";
import { DayEditor } from "./DayEditor.tsx";

// 選んだ日を大きく1本の帯で見せる
export function DayTimeline({
  day,
  hours,
  now,
  tz,
}: {
  day?: DayData;
  hours: [number, number];
  now: number;
  tz: string;
}) {
  const [editing, setEditing] = useState(false);
  if (!day) return null;
  const ds = dayStart(day.date, tz);
  const t0 = ds + hours[0] * 3600;
  const span = (hours[1] - hours[0]) * 3600;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - t0) / span) * 100));
  const pos = (t: number) => `${pct(t)}%`;
  const width = (a: number, b: number) => `${Math.max(0.3, pct(b) - pct(a))}%`;

  const ins = day.segments.filter((s) => s.state === "in");
  const isToday = now >= ds && now < ds + 86400;
  const s = day.summary;

  const ticks: number[] = [];
  for (let h = hours[0]; h <= hours[1]; h += 2) ticks.push(h);

  const facts = [
    s.firstArrival !== null && { label: "来た", value: clock(s.firstArrival, tz) },
    s.lastDeparture !== null && !isToday && { label: "帰った", value: clock(s.lastDeparture, tz) },
    s.awaySec >= 60 && { label: "外出", value: hm(s.awaySec) },
    s.focusSec >= 60 && { label: "研究", value: hm(s.focusSec) },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <section className="flex h-full flex-col pt-4">
      <div className="flex items-end gap-6">
        <div>
          <div className="text-sm text-sub">
            <span className="num">{md(day.date)}</span> ({weekday(day.date)})
          </div>
          <div className="num mt-1 text-[40px] leading-none font-extralight tracking-tight">
            {hm(s.presenceSec)}
          </div>
        </div>
        <dl className="flex gap-6 pb-1 text-sm">
          {facts.map((f) => (
            <div key={f.label} className="flex items-baseline gap-2">
              <dt className="text-xs text-faint">{f.label}</dt>
              <dd className="num text-sub">{f.value}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          aria-label="修正"
          aria-pressed={editing}
          onClick={() => setEditing((e) => !e)}
          className={`ml-auto rounded-full p-1.5 hover:bg-cell ${editing ? "bg-cell text-fg" : "text-faint"}`}
        >
          <Pencil size={14} />
        </button>
      </div>

      <div className="relative mt-5 flex max-h-[220px] min-h-[92px] flex-1 flex-col">
        {/* 区間の始まりと終わりの時刻 */}
        <div className="relative h-5 shrink-0">
          {ins.map((seg) => (
            <span
              key={`${seg.start}-l`}
              className="num absolute bottom-1 -translate-x-1/2 text-xs text-sub"
              style={{ left: pos(seg.start) }}
            >
              {clock(seg.start, tz)}
            </span>
          ))}
          {ins.map(
            (seg) =>
              seg.end !== null && (
                <span
                  key={`${seg.start}-r`}
                  className="num absolute bottom-1 -translate-x-1/2 text-xs text-faint"
                  style={{ left: pos(seg.end) }}
                >
                  {clock(seg.end, tz)}
                </span>
              ),
          )}
        </div>

        {/* 帯 */}
        <div className="relative min-h-12 flex-1 overflow-hidden rounded-xl bg-cell">
          {day.segments.map((seg) => {
            const end = seg.end ?? now;
            return (
              <div
                key={`${seg.start}-${seg.state}`}
                className={`absolute inset-y-0 rounded-lg ${seg.state === "in" ? "bg-presence" : "bg-presence-soft"}`}
                style={{ left: pos(seg.start), width: width(seg.start, end) }}
              />
            );
          })}
          {day.segments
            .filter((seg) => seg.manual)
            .map((seg) => (
              <span
                key={`${seg.start}-m`}
                title="手動で修正"
                className="absolute top-1 size-1.5 -translate-x-1/2 rounded-full bg-bg/70"
                style={{ left: `calc(${pos(seg.start)} + 6px)` }}
              />
            ))}
        </div>

        {/* いま */}
        {isToday && now > t0 && now < t0 + span && (
          <div
            className="now-pulse pointer-events-none absolute top-5 bottom-6 w-[2px] -translate-x-1/2 rounded-full bg-fg/70"
            style={{ left: pos(now) }}
          />
        )}

        {/* 時刻の目盛り */}
        <div className="relative mt-2 h-4 shrink-0">
          {ticks.map((h) => (
            <span
              key={h}
              className="num absolute -translate-x-1/2 text-[11px] text-faint"
              style={{ left: pos(ds + h * 3600) }}
            >
              {h}
            </span>
          ))}
        </div>

        {ins.length === 0 && (
          <div className="absolute inset-x-0 top-5 bottom-6 flex items-center justify-center text-xs text-faint">
            記録なし
          </div>
        )}
      </div>

      {editing && <DayEditor day={day} tz={tz} now={now} />}
    </section>
  );
}
