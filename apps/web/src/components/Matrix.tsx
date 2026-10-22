import { type Cell, type DayData, toCells } from "@labterm/core";
import clsx from "clsx";
import { memo, useMemo } from "react";
import { clock, hm, isWeekend, weekday } from "../lib/format.ts";

const KIND_LABEL: Record<Cell["kind"], string> = {
  in: "在室",
  partial: "",
  away: "外出",
  empty: "",
  future: "",
};

const Square = memo(function Square({ c, tz, flash }: { c: Cell; tz: string; flash: boolean }) {
  const title = KIND_LABEL[c.kind]
    ? `${clock(c.start, tz)}–${clock(c.end, tz)} ${KIND_LABEL[c.kind]}`
    : undefined;
  return (
    <div
      role="gridcell"
      title={title}
      className={clsx(
        "cursor-pointer",
        "relative h-[18px] overflow-hidden rounded-[4px]",
        c.kind === "in" && "bg-presence",
        (c.kind === "partial" || c.kind === "empty") && "bg-cell",
        c.kind === "away" && "bg-presence-soft",
        c.kind === "future" && "bg-cell/35",
        c.now && "now-pulse ring-[1.5px] ring-fg/50",
        flash && "flash",
      )}
    ></div>
  );
});

export function Matrix({
  days,
  hours,
  resolution,
  now,
  tz,
  today,
  selected,
  onSelect,
  flashAt,
}: {
  days: DayData[];
  hours: [number, number];
  resolution: number;
  now: number;
  tz: string;
  today: string;
  selected: string;
  onSelect: (date: string) => void;
  flashAt?: number | null;
}) {
  const perHour = 60 / resolution;
  const cols = (hours[1] - hours[0]) * perHour;
  const rows = useMemo(
    () =>
      days.map((d) => ({
        date: d.date,
        total: d.summary.presenceSec,
        cells: toCells(d.date, d.segments, { resolutionMin: resolution, hours, now, tz }),
      })),
    [days, hours, resolution, now, tz],
  );
  const empty = days.every((d) => d.segments.length === 0);

  const labels: number[] = [];
  for (let h = hours[0]; h < hours[1]; h += 2) labels.push(h);

  return (
    <div className="relative overflow-x-auto">
      <div
        role="grid"
        aria-label="在室のマス目"
        className="grid min-w-[760px] items-center gap-y-[3px]"
        style={{
          gridTemplateColumns: `3.75rem repeat(${cols}, minmax(0, 1fr)) 3.25rem`,
          columnGap: 2,
        }}
      >
        <div />
        {labels.map((h) => (
          <div
            key={h}
            className="num pb-1 text-[11px] text-faint"
            style={{
              // 最後のラベルが端からはみ出すと列が増えて行がずれるので切る
              gridColumn: `${(h - hours[0]) * perHour + 2} / span ${Math.min(2 * perHour, (hours[1] - h) * perHour)}`,
            }}
          >
            {h}
          </div>
        ))}

        <div />

        {rows.map(({ date, cells, total }, ri) => {
          const isSel = date === selected;
          const day = Number(date.slice(8));
          // 期間が月をまたぐときは、月の頭に小さく月を出す
          const monthHead =
            ri > 0 && date.slice(0, 7) !== rows[ri - 1]?.date.slice(0, 7) ? (
              <div
                key={`${date}-m`}
                className="num pt-3 pb-1 text-xs text-sub"
                style={{ gridColumn: "1 / -1" }}
              >
                {Number(date.slice(5, 7))}月
              </div>
            ) : null;
          return [
            monthHead,
            <div key={date} role="row" className="contents" onClick={() => onSelect(date)}>
              <button
                type="button"
                role="rowheader"
                className={clsx(
                  "num flex items-center gap-1.5 pr-2 text-left text-xs",
                  isSel ? "font-semibold text-fg" : isWeekend(date) ? "text-faint" : "text-sub",
                )}
              >
                <span
                  className={clsx(
                    "size-1 rounded-full",
                    date === today ? "bg-presence" : "bg-transparent",
                  )}
                />
                <span className="w-4 text-right">{day}</span>
                <span className="font-sans">{weekday(date)}</span>
              </button>
              {cells.map((c) => (
                <Square
                  key={c.start}
                  c={c}
                  tz={tz}
                  flash={flashAt != null && c.start <= flashAt && flashAt < c.end}
                />
              ))}
              <span className="num pl-2 text-right text-[11px] text-faint">
                {total >= 60 ? hm(total) : ""}
              </span>
            </div>,
          ];
        })}
      </div>
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-faint">
          記録なし
        </div>
      )}
    </div>
  );
}
