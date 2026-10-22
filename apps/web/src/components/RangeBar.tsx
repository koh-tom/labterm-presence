import { ChevronLeft, ChevronRight } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { type Preset, type Range, rangeLabel } from "../lib/range.ts";
import { ExportMenu } from "./ExportMenu.tsx";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "week", label: "今週" },
  { id: "month", label: "今月" },
  { id: "3m", label: "3か月" },
  { id: "custom", label: "期間" },
];

function Seg<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-full bg-cell p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`fade rounded-full px-3 py-1 ${
            value === o.id ? "bg-bg font-medium shadow-sm" : "text-sub hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RangeBar({
  range,
  resolution,
  onPreset,
  onShift,
  onCustom,
  onResolution,
}: {
  range: Range;
  resolution: number;
  onPreset: (p: Exclude<Preset, "custom">) => void;
  onShift: (dir: -1 | 1) => void;
  onCustom: (from: string, to: string) => void;
  onResolution: (r: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="前へ"
          onClick={() => onShift(-1)}
          className="rounded-full p-1.5 text-sub hover:bg-cell hover:text-fg"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="num min-w-36 text-center text-sm">{rangeLabel(range)}</span>
        <button
          type="button"
          aria-label="次へ"
          onClick={() => onShift(1)}
          className="rounded-full p-1.5 text-sub hover:bg-cell hover:text-fg"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Popover.Root
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) {
              setFrom(range.from);
              setTo(range.to);
            }
          }}
        >
          <Seg
            value={range.preset}
            options={PRESETS}
            onChange={(p) => (p === "custom" ? setOpen(true) : onPreset(p))}
          />
          <Popover.Anchor />
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={8}
              className="z-10 flex items-center gap-2 rounded-xl bg-bg p-3 text-sm shadow-lg ring-1 ring-line"
            >
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="num rounded-md bg-cell px-2 py-1"
              />
              <span className="text-sub">–</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="num rounded-md bg-cell px-2 py-1"
              />
              <button
                type="button"
                disabled={!from || !to || from > to}
                onClick={() => {
                  onCustom(from, to);
                  setOpen(false);
                }}
                className="rounded-md bg-fg px-3 py-1 text-bg disabled:opacity-40"
              >
                表示
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Seg
          value={resolution}
          options={[
            { id: 30, label: "30分" },
            { id: 15, label: "15分" },
          ]}
          onChange={onResolution}
        />
        <ExportMenu range={range} />
      </div>
    </div>
  );
}
