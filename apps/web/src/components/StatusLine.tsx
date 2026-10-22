import type { Status } from "@labterm/core";
import clsx from "clsx";
import { clock } from "../lib/format.ts";

export function StatusLine({
  status,
  tz,
  onSync,
}: {
  status?: Status;
  tz: string;
  onSync?: () => void;
}) {
  if (!status) return <div className="h-6" />;
  const { presence, device, sync } = status;

  const text =
    presence.state === "in"
      ? "在室"
      : presence.state === "away"
        ? "外出"
        : presence.since
          ? "退室"
          : "不在";
  const time =
    presence.since && presence.state !== "out"
      ? `${clock(presence.since, tz)}〜`
      : presence.since
        ? clock(presence.since, tz)
        : "";

  return (
    <div className="flex items-center justify-between text-sm">
      <div className="fade flex items-center gap-2.5">
        <span
          className={clsx(
            "size-2.5 rounded-full",
            presence.state === "in" && "bg-presence",
            presence.state === "away" && "bg-presence-soft ring-1 ring-presence ring-inset",
            presence.state === "out" && "bg-cell ring-1 ring-faint ring-inset",
          )}
        />
        <span className="font-medium">{text}</span>
        <span className="num text-sub">{time}</span>
      </div>

      <div className="flex items-center gap-4 text-xs text-sub">
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
