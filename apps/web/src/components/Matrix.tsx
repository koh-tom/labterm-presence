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
  const label = KIND_LABEL[c.kind];
  const title = label ? `${clock(c.start, tz)}–${clock(c.end, tz)} ${label}` : undefined;
  return (
    <div
      role="gridcell"
      title={title}
      className={clsx(
        "cursor-pointer",
        "relative h-full overflow-hidden rounded-[4px]",
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
        cells: toCells(d.date, d.segments, {
          resolutionMin: resolution,
          hours,
          now,
          tz,
          focus: d.focus ?? [],
        }),
      })),
    [days, hours, resolution, now, tz],
  );
  const empty = days.every((d) => d.segments.length === 0);
  const multiMonth = days.length > 0 && days[0]?.date.slice(0, 7) !== days.at(-1)?.date.slice(0, 7);

  const labels: number[] = [];
  for (let h = hours[0]; h < hours[1]; h += 2) labels.push(h);

  // 行ごとに同じ列の並びにして、行の高さは画面の高さに合わせて伸び縮みさせる
  const template = {
    gridTemplateColumns: `3.75rem repeat(${cols}, minmax(0, 1fr)) 3.25rem`,
    columnGap: 2,
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-x-auto">
      <div
        role="grid"
        aria-label="在室のマス目"
        className="flex h-full min-h-0 min-w-[760px] flex-col"
      >
        <div className="grid shrink-0" style={template}>
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
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto">
          {rows.map(({ date, cells, total }, ri) => {
            const isSel = date === selected;
            const day = Number(date.slice(8));
            // 期間が月をまたぐときは、月の頭に小さく月を出す
            const monthHead =
              (ri > 0 && date.slice(0, 7) !== rows[ri - 1]?.date.slice(0, 7)) ||
              (ri === 0 && multiMonth) ? (
                <div
                  key={`${date}-m`}
                  className={`num shrink-0 pb-1 text-xs text-sub ${ri === 0 ? "" : "pt-3"}`}
                >
                  {Number(date.slice(5, 7))}月
                </div>
              ) : null;
            return [
              monthHead,
              <div
                key={date}
                role="row"
                tabIndex={-1}
                onClick={() => onSelect(date)}
                onKeyDown={undefined}
                className="grid min-h-[18px] max-h-28 flex-1 items-stretch"
                style={template}
              >
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
                <span className="num flex items-center justify-end pl-2 text-[11px] text-faint">
                  {total >= 60 ? hm(total) : ""}
                </span>
              </div>,
            ];
          })}
        </div>
      </div>
      {empty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-faint">
          記録なし
        </div>
      )}
    </div>
  );
}
