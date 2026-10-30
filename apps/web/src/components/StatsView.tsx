import type { PeriodStats, Stats } from "@labterm/core";
import { hm } from "../lib/format.ts";

const WD = ["月", "火", "水", "木", "金", "土", "日"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-xs text-sub">{title}</h2>
      {children}
    </section>
  );
}

function tod(sec: number | null): string {
  if (sec === null) return "–";
  return `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}`;
}

function delta(a: number | null, b: number | null, fmt: (v: number) => string): string {
  if (a === null || b === null) return "";
  const d = a - b;
  if (Math.abs(d) < 60 && fmt === hm) return "±0:00";
  if (d === 0) return "±0";
  return `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}`;
}

const pct = (p: PeriodStats) => (p.totalSec ? Math.round((p.focusSec / p.totalSec) * 100) : null);

function Compare({ cur, prev }: { cur: PeriodStats; prev: PeriodStats }) {
  const rows: { label: string; a: string; b: string; d: string }[] = [
    {
      label: "在室",
      a: hm(cur.totalSec),
      b: hm(prev.totalSec),
      d: delta(cur.totalSec, prev.totalSec, hm),
    },
    {
      label: "平均",
      a: hm(cur.averageSec),
      b: hm(prev.averageSec),
      d: delta(cur.averageSec, prev.averageSec, hm),
    },
    {
      label: "在室日",
      a: String(cur.labDays),
      b: String(prev.labDays),
      d: delta(cur.labDays, prev.labDays, String),
    },
    {
      label: "研究",
      a: hm(cur.focusSec),
      b: hm(prev.focusSec),
      d: delta(cur.focusSec, prev.focusSec, hm),
    },
    {
      label: "研究の割合",
      a: pct(cur) === null ? "–" : `${pct(cur)}%`,
      b: pct(prev) === null ? "–" : `${pct(prev)}%`,
      d: delta(pct(cur), pct(prev), (v) => `${v}%`),
    },
    {
      label: "入室",
      a: tod(cur.avgArrival),
      b: tod(prev.avgArrival),
      d: delta(cur.avgArrival, prev.avgArrival, hm),
    },
    {
      label: "退室",
      a: tod(cur.avgDeparture),
      b: tod(prev.avgDeparture),
      d: delta(cur.avgDeparture, prev.avgDeparture, hm),
    },
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-faint">
          <th className="pb-2 font-normal" />
          <th className="pb-2 text-right font-normal">この期間</th>
          <th className="pb-2 text-right font-normal">前の期間</th>
          <th className="pb-2 text-right font-normal" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-t border-line">
            <td className="py-2 text-sub">{r.label}</td>
            <td className="num py-2 text-right text-lg font-light">{r.a}</td>
            <td className="num py-2 text-right text-sub">{r.b}</td>
            <td className="num w-20 py-2 text-right text-xs text-faint">{r.d}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// 割合 → 色の濃さ (同じ緑で薄い→濃い)
const STEPS = [25, 45, 65, 85, 100];
function shade(v: number): string {
  if (v <= 0.02) return "var(--cell)";
  const i = Math.min(STEPS.length - 1, Math.floor(v * STEPS.length));
  return `color-mix(in oklab, var(--presence) ${STEPS[i]}%, var(--cell))`;
}

function hoursOf(stats: Stats): [number, number] {
  let start = 7;
  for (const row of stats.heat) row.forEach((v, h) => v > 0.02 && h < start && (start = h));
  return [start, 24];
}

function Heat({ stats }: { stats: Stats }) {
  const [h0, h1] = hoursOf(stats);
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  return (
    <div>
      <div
        className="grid items-center gap-[3px]"
        style={{ gridTemplateColumns: `2rem repeat(${hours.length}, minmax(0, 1fr))` }}
      >
        <div />
        {hours.map((h) => (
          <div key={h} className="num text-[11px] text-faint">
            {h % 2 === 0 ? h : ""}
          </div>
        ))}
        {stats.heat.map((row, w) => [
          <div key={`l${WD[w]}`} className={`text-xs ${w >= 5 ? "text-faint" : "text-sub"}`}>
            {WD[w]}
          </div>,
          ...hours.map((h) => {
            const v = row[h] ?? 0;
            return (
              <div
                key={`${w}-${h}`}
                title={`${WD[w]} ${h}時台 ${Math.round(v * 100)}%`}
                className="h-6 rounded-[4px]"
                style={{ background: shade(v) }}
              />
            );
          }),
        ])}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-faint">
        少ない
        {[0, ...STEPS.map((_, i) => (i + 0.5) / STEPS.length)].map((v) => (
          <span key={v} className="size-3 rounded-[3px]" style={{ background: shade(v) }} />
        ))}
        多い
      </div>
    </div>
  );
}

function Weekdays({ stats }: { stats: Stats }) {
  const [h0, h1] = hoursOf(stats);
  const pos = (sec: number) =>
    `${Math.max(0, Math.min(100, ((sec / 3600 - h0) / (h1 - h0)) * 100))}%`;
  return (
    <div className="flex flex-col gap-2.5">
      {stats.weekdays.map((w) => {
        const a = w.avgArrival;
        const d = w.avgDeparture;
        return (
          <div key={w.weekday} className="grid grid-cols-[2rem_1fr_7rem] items-center gap-3">
            <span className={`text-xs ${w.weekday >= 5 ? "text-faint" : "text-sub"}`}>
              {WD[w.weekday]}
            </span>
            <div className="relative h-2 rounded-full bg-cell">
              {a !== null && d !== null && d > a && (
                <div
                  title={`${tod(a)} – ${tod(d)}`}
                  className="absolute inset-y-0 rounded-full bg-presence"
                  style={{ left: pos(a), width: `calc(${pos(d)} - ${pos(a)})` }}
                />
              )}
            </div>
            <span className="num text-right text-xs text-sub">
              {w.labDays ? (
                <>
                  {tod(a)}–{tod(d)} <span className="text-faint">{hm(w.avgSec)}</span>
                </>
              ) : (
                <span className="text-faint">–</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Bars({ items }: { items: { key: string; label: string; tip: string; sec: number }[] }) {
  const max = Math.max(3600, ...items.map((i) => i.sec));
  const maxIdx = items.findIndex((i) => i.sec === max);
  return (
    <div>
      <div className="flex h-32 items-end gap-[3px] border-b border-line">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <div key={it.key} className="relative flex h-full flex-1 items-end" title={it.tip}>
              {(last || i === maxIdx) && it.sec > 0 && (
                <span
                  className="num absolute inset-x-0 text-center text-[11px] text-sub"
                  style={{ bottom: `calc(${(it.sec / max) * 100}% + 4px)` }}
                >
                  {Math.round(it.sec / 3600)}h
                </span>
              )}
              <div
                className={`w-full rounded-t-[4px] ${last ? "bg-presence" : "bg-presence/45"}`}
                style={{ height: `${(it.sec / max) * 100}%`, minHeight: it.sec > 0 ? 2 : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {items.map((it, i) => (
          <span key={it.key} className="num flex-1 text-center text-[10px] text-faint">
            {i % 3 === items.length % 3 || i === items.length - 1 ? it.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatsView({ stats }: { stats?: Stats }) {
  if (!stats) return null;
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;
  return (
    <div className="flex flex-col gap-14">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <Section title="前の期間と比べる">
          <Compare cur={stats.current} prev={stats.previous} />
        </Section>
        <Section title="曜日ごとの平均 (入室 – 退室)">
          <Weekdays stats={stats} />
        </Section>
      </div>

      <Section title="いつもの在室 (曜日×時間)">
        <Heat stats={stats} />
      </Section>

      <div className="grid gap-14 md:grid-cols-2">
        <Section title="週ごと (直近12週)">
          <Bars
            items={stats.weeks.map((w) => ({
              key: w.start,
              label: md(w.start),
              tip: `${md(w.start)}の週 ${hm(w.sec)}`,
              sec: w.sec,
            }))}
          />
        </Section>
        <Section title="月ごと (直近12か月)">
          <Bars
            items={stats.months.map((m) => ({
              key: m.month,
              label: `${Number(m.month.slice(5))}月`,
              tip: `${m.month.replace("-", "年")}月 ${hm(m.sec)}`,
              sec: m.sec,
            }))}
          />
        </Section>
      </div>
    </div>
  );
}
