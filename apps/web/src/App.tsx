import { dateOf } from "@labterm/core";
import { useCallback, useEffect, useState } from "react";
import { DayTimeline } from "./components/DayTimeline.tsx";
import { Matrix } from "./components/Matrix.tsx";
import { RangeBar } from "./components/RangeBar.tsx";
import { Stats } from "./components/Stats.tsx";
import { StatusLine } from "./components/StatusLine.tsx";
import { requestSync, usePresence, useStatus } from "./lib/api.ts";
import { useLive } from "./lib/live.ts";
import { presetRange, type Range, readUrl, shiftRange, writeUrl } from "./lib/range.ts";

const TZ = "Asia/Tokyo";

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
  const presence = usePresence(range);
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

  // ↑↓ で日、←→ で期間を移動
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
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
  }, [range, data, selected, setRange]);

  const day = data?.days.find((d) => d.date === selected) ?? data?.days.at(-1);
  const inLab = status.data?.presence.state === "in";

  return (
    <main className="mx-auto max-w-[1240px] px-6 py-8 sm:px-10 sm:py-10">
      <StatusLine status={status.data} tz={TZ} onSync={() => void requestSync()} />

      <div className="mt-10">
        <Stats data={data} inLab={inLab} />
      </div>

      <div className="mt-12 max-sm:hidden">
        <RangeBar
          range={range}
          resolution={resolution}
          onPreset={(p) => setRange(presetRange(p, new Date()))}
          onShift={(dir) => setRange(shiftRange(range, dir, TZ))}
          onCustom={(from, to) => setRange({ preset: "custom", from, to })}
          onResolution={setResolution}
        />
      </div>

      <div className="mt-5 max-h-[62vh] overflow-y-auto max-sm:hidden">
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

      <div className="mt-10 max-sm:hidden">
        {data && <DayTimeline day={day} hours={data.hours} now={now} tz={TZ} />}
      </div>
    </main>
  );
}
