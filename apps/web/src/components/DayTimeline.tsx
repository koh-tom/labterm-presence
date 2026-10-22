import type { DayData } from "@labterm/core";
import { dayStart } from "@labterm/core";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { clock, hm, md, weekday } from "../lib/format.ts";
import { DayEditor } from "./DayEditor.tsx";

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
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - t0) / span) * 100))}%`;
  const width = (a: number, b: number) => `${Math.max(0.3, ((b - a) / span) * 100)}%`;

  const ins = day.segments.filter((s) => s.state === "in");

  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h2 className="num text-sm">
          {md(day.date)} <span className="font-sans text-sub">({weekday(day.date)})</span>
        </h2>
        <span className="num text-sm text-sub">{hm(day.summary.presenceSec)}</span>
        <button
          type="button"
          aria-label="修正"
          aria-pressed={editing}
          onClick={() => setEditing((e) => !e)}
          className={`ml-auto rounded-full p-1.5 hover:bg-cell ${editing ? "bg-cell text-fg" : "text-faint"}`}
        >
          <Pencil size={13} />
        </button>
      </div>

      <div className="relative mt-4 h-10">
        <div className="absolute inset-x-0 top-[7px] h-px bg-line" />
        {day.segments.map((s) => {
          const end = s.end ?? now;
          return s.state === "in" ? (
            <div
              key={`${s.start}-in`}
              className="absolute top-[4px] h-[7px] rounded-full bg-presence"
              style={{ left: pos(s.start), width: width(s.start, end) }}
            />
          ) : (
            <div
              key={`${s.start}-away`}
              className="absolute top-[6px] h-0 border-t-[3px] border-dotted border-presence/50"
              style={{ left: pos(s.start), width: width(s.start, end) }}
            />
          );
        })}
        {/* 研究していた時間は在室の線の上に濃い色で重ねる */}
        {day.focus.map((f) => (
          <div
            key={`${f.start}-f`}
            className="absolute top-[4px] h-[7px] rounded-full bg-presence-deep"
            style={{ left: pos(f.start), width: width(f.start, f.end) }}
          />
        ))}
        {day.segments.some((s) => s.end === null) && (
          <div
            className="now-pulse absolute top-[2px] size-[11px] -translate-x-1/2 rounded-full bg-presence ring-2 ring-bg"
            style={{ left: pos(now) }}
          />
        )}
        {ins.map((s) => (
          <span
            key={`${s.start}-l`}
            className="num absolute top-5 -translate-x-1/2 text-[11px] text-sub"
            style={{ left: pos(s.start) }}
          >
            {clock(s.start, tz)}
          </span>
        ))}
        {ins.map(
          (s) =>
            s.end !== null && (
              <span
                key={`${s.start}-r`}
                className="num absolute top-5 -translate-x-1/2 text-[11px] text-faint"
                style={{ left: pos(s.end) }}
              >
                {clock(s.end, tz)}
              </span>
            ),
        )}
        {ins.length === 0 && (
          <span className="absolute top-5 text-[11px] text-faint">記録なし</span>
        )}
        {day.segments
          .filter((s) => s.manual)
          .map((s) => (
            <span
              key={`${s.start}-m`}
              title="手動で修正"
              className="absolute -top-1.5 size-1 -translate-x-1/2 rounded-full bg-sub"
              style={{ left: pos(s.start) }}
            />
          ))}
      </div>
      {editing && <DayEditor day={day} tz={tz} now={now} />}
    </section>
  );
}
