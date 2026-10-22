import { Download } from "lucide-react";
import { Popover } from "radix-ui";
import { exportUrl } from "../lib/api.ts";
import type { Range } from "../lib/range.ts";

const ITEMS = [
  { kind: "day", label: "CSV 日ごと" },
  { kind: "interval", label: "CSV 区間" },
  { kind: "json", label: "JSON" },
] as const;

export function ExportMenu({ range }: { range: Range }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label="書き出し"
        className="rounded-full p-1.5 text-sub hover:bg-cell hover:text-fg"
      >
        <Download size={15} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-10 flex min-w-32 flex-col rounded-xl bg-bg p-1.5 text-sm shadow-lg ring-1 ring-line"
        >
          {ITEMS.map((it) => (
            <a
              key={it.kind}
              href={exportUrl(it.kind, range)}
              download
              className="rounded-md px-3 py-1.5 hover:bg-cell"
            >
              {it.label}
            </a>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
