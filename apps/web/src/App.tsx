import { dateOf, datesBetween, nextDate } from "@labterm/core";
import { useCallback, useEffect, useState } from "react";
import { DayTimeline } from "./components/DayTimeline.tsx";
import { FullscreenButton, toggleFullscreen } from "./components/FullscreenButton.tsx";
import { Matrix } from "./components/Matrix.tsx";
import { RangeBar } from "./components/RangeBar.tsx";
import { StateHero } from "./components/StateHero.tsx";
import { Stats } from "./components/Stats.tsx";
import { StatsView } from "./components/StatsView.tsx";
import { StatusLine } from "./components/StatusLine.tsx";
import { requestSync, usePresence, useStats, useStatus } from "./lib/api.ts";
import { hm } from "./lib/format.ts";
import { useLive } from "./lib/live.ts";
import { presetRange, type Range, readUrl, shiftRange, writeUrl } from "./lib/range.ts";

const TZ = "Asia/Tokyo";

// 前の同じ長さの期間。今日を含む期間なら、今日までと同じ日数だけで比べる
function previousRange(r: Range, today: string): Range {
  const prev = shiftRange(r, -1, TZ);
  if (today < r.from || today > r.to) return prev;
  const elapsed = datesBetween(r.from, today, TZ).length;
  const to = nextDate(prev.from, elapsed - 1, TZ);
  return { ...prev, to: to < prev.to ? to : prev.to };
}

type View = "grid" | "stats";
const readView = (): View =>
  new URLSearchParams(location.search).get("view") === "stats" ? "stats" : "grid";

function loadResolution(): number {
  try {
    return localStorage.getItem("resolution") === "15" ? 15 : 30;
  } catch {
    return 30;
  }
}

export function App() {
  const [range, setRangeState] = useState<Range>(() => readUrl(new Date()));
  const [resolution, setResolutionState] = useState(loadResolution);
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => {
    setViewState(v);
    const q = new URLSearchParams(location.search);
    if (v === "stats") q.set("view", "stats");
    else q.delete("view");
    history.replaceState(null, "", `?${q}`);
  };
  const presence = usePresence(range);
  const stats = useStats(range, view === "stats");
  const prev = usePresence(previousRange(range, dateOf(Math.floor(Date.now() / 1000), TZ)));
  const status = useStatus();
  const flashAt = useLive();
  const data = presence.data;
  const now = data?.now ?? Math.floor(Date.now() / 1000);
  const today = dateOf(now, TZ);

  const [selected, setSelected] = useState(today);
  const setRange = useCallback(
    (r: Range) => {
      setRangeState(r);
      writeUrl(r);
      setSelected((s) => (s >= r.from && s <= r.to ? s : r.to < today ? r.to : today));
    },
    [today],
  );

  const setResolution = (r: number) => {
    setResolutionState(r);
    try {
      localStorage.setItem("resolution", String(r));
    } catch {}
  };

  // タブの名前に状態と今日の時間を出す
  useEffect(() => {
    const p = status.data?.presence.state;
    const t = data ? hm(data.today.presenceSec) : "";
    document.title =
      p === "in" ? `● ${t} 在室` : p === "away" ? `○ ${t} 外出` : t ? `${t} · 在室` : "在室";
  }, [status.data, data]);

  // ↑↓ で日、←→ で期間を移動、t で今日
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "f" && !e.ctrlKey && !e.metaKey) {
        toggleFullscreen();
        return;
      }
      if (e.key === "t" && !e.ctrlKey && !e.metaKey) {
        const p = range.preset === "custom" ? "month" : range.preset;
        setRange(presetRange(p, new Date()));
        setSelected(today);
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        setRange(shiftRange(range, e.key === "ArrowLeft" ? -1 : 1, TZ));
      } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && data) {
        const i = data.days.findIndex((d) => d.date === selected);
        const next = data.days[i + (e.key === "ArrowUp" ? -1 : 1)];
        if (next) {
          setSelected(next.date);
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [range, data, selected, setRange, today]);

  const day = data?.days.find((d) => d.date === selected) ?? data?.days.at(-1);
  // 記録の画面は画面の高さぴったりにして、マス目の行の高さで調整する
  const fit = view === "grid";

  return (
    <main
      className={`mx-auto flex max-w-[1240px] flex-col px-6 py-6 sm:px-10 sm:py-8 ${fit ? "sm:h-dvh" : ""}`}
    >
      <StatusLine
        status={status.data}
        tz={TZ}
        onSync={() => void requestSync()}
        nav={
          <nav className="flex items-center gap-3 text-xs max-sm:hidden">
            <FullscreenButton />
            {(
              [
                ["grid", "記録"],
                ["stats", "統計"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={view === v ? "font-medium text-fg" : "text-sub hover:text-fg"}
              >
                {label}
              </button>
            ))}
            <span className="text-line">|</span>
          </nav>
        }
      />

      <div className="mt-8 grid shrink-0 grid-cols-2 gap-y-6 sm:grid-cols-5">
        <StateHero status={status.data} tz={TZ} />
        {view === "grid" && <Stats data={data} prev={prev.data} />}
      </div>

      <div className="mt-8 shrink-0 max-sm:hidden">
        <RangeBar
          range={range}
          resolution={resolution}
          onPreset={(p) => setRange(presetRange(p, new Date()))}
          onShift={(dir) => setRange(shiftRange(range, dir, TZ))}
          onCustom={(from, to) => setRange({ preset: "custom", from, to })}
          onResolution={setResolution}
          showResolution={view === "grid"}
        />
      </div>

      {view === "stats" && (
        <div className="mt-10 max-sm:hidden">
          <StatsView stats={stats.data} />
        </div>
      )}

      <div className={`mt-4 min-h-0 flex-1 max-sm:hidden ${view === "stats" ? "hidden" : ""}`}>
        {data && (
          <Matrix
            days={data.days}
            hours={data.hours}
            resolution={resolution}
            now={now}
            tz={TZ}
            today={today}
            selected={day?.date ?? ""}
            onSelect={setSelected}
            flashAt={flashAt}
          />
        )}
      </div>

      <div className={`mt-6 shrink-0 max-sm:hidden ${view === "stats" ? "hidden" : ""}`}>
        {data && <DayTimeline day={day} hours={data.hours} now={now} tz={TZ} />}
      </div>
    </main>
  );
}
