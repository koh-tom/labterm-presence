import { type DayData, dayStart } from "@labterm/core";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { DEMO, postEdit } from "../lib/api.ts";
import { clock } from "../lib/format.ts";

const STATES = [
  { id: "in", label: "入室" },
  { id: "away", label: "外出" },
  { id: "out", label: "退室" },
] as const;

// 日のタイムラインの下に出す手動修正 (PC の履歴だけ直す)
export function DayEditor({ day, tz, now }: { day: DayData; tz: string; now: number }) {
  const qc = useQueryClient();
  const [state, setState] = useState<"in" | "away" | "out">("out");
  const [time, setTime] = useState("18:00");
  const [error, setError] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
      await qc.invalidateQueries();
    } catch {
      setError("できませんでした");
    }
  };

  const add = () =>
    run(async () => {
      const [h, m] = time.split(":").map(Number);
      const at = dayStart(day.date, tz) + (h ?? 0) * 3600 + (m ?? 0) * 60;
      if (at > now) throw new Error("future");
      await postEdit({ kind: "state", state, at });
    });

  const remove = (startId: string, endId?: string) =>
    run(async () => {
      await postEdit({ kind: "void", voids: startId });
      if (endId) await postEdit({ kind: "void", voids: endId });
    });

  const ins = day.segments.filter((s) => s.state === "in");

  return (
    <div className="mt-6 flex flex-wrap items-start gap-x-10 gap-y-4 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex rounded-full bg-cell p-0.5 text-xs">
          {STATES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setState(s.id)}
              aria-pressed={state === s.id}
              className={`rounded-full px-3 py-1 ${state === s.id ? "bg-bg font-medium shadow-sm" : "text-sub"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="num rounded-md bg-cell px-2 py-1"
        />
        <button
          type="button"
          disabled={DEMO || !time}
          onClick={add}
          className="rounded-md bg-fg px-3 py-1 text-bg disabled:opacity-40"
        >
          追加
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      <ul className="flex flex-wrap gap-2">
        {ins.map((s) => (
          <li
            key={s.startEventId}
            className="num flex items-center gap-1.5 rounded-full bg-cell py-1 pr-1.5 pl-3 text-xs"
          >
            {clock(s.start, tz)} – {s.end === null ? "いま" : clock(s.end, tz)}
            <button
              type="button"
              aria-label="この区間を消す"
              disabled={DEMO}
              onClick={() => remove(s.startEventId, s.endEventId)}
              className="rounded-full p-0.5 text-sub hover:bg-bg hover:text-danger disabled:opacity-40"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
