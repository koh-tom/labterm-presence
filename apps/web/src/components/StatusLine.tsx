import type { Status } from "@labterm/core";
import clsx from "clsx";
import type { ReactNode } from "react";
import { clock } from "../lib/format.ts";

export function StatusLine({
  status,
  tz,
  onSync,
  nav,
}: {
  status?: Status;
  tz: string;
  onSync?: () => void;
  nav?: ReactNode;
}) {
  const todayLabel = status
    ? new Intl.DateTimeFormat("ja-JP", {
        timeZone: tz,
        month: "numeric",
        day: "numeric",
        weekday: "short",
      }).format(new Date(status.now * 1000))
    : "";
  if (!status) return <div className="h-6" />;
  const { device, sync } = status;

  return (
    <div className="flex items-center justify-between text-sm">
      <div className="num text-xs text-faint">{todayLabel}</div>

      <div className="flex items-center gap-4 text-xs text-sub">
        {nav}
        {sync.state === "required" && (
          <button
            type="button"
            onClick={onSync}
            className="rounded-full px-2.5 py-0.5 font-medium text-warn ring-1 ring-warn/60 hover:bg-warn/10"
          >
            要同期
          </button>
        )}
        {sync.state === "syncing" && <span>同期中</span>}
        <span className="flex items-center gap-1.5">
          <span
            className={clsx(
              "size-1.5 rounded-full",
              device.state === "connected" && "bg-presence",
              device.state === "paused" && "bg-warn",
              device.state === "disconnected" && "bg-faint",
            )}
          />
          {device.state === "connected" && "接続中"}
          {device.state === "paused" && "一時停止中"}
          {device.state === "disconnected" && (
            <>
              未接続
              {device.lastSeenAt && <span className="num">{clock(device.lastSeenAt, tz)}</span>}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
