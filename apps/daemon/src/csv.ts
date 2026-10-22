import { TZDate } from "@date-fns/tz";
import type { PresenceRange } from "@labterm/core";
import { format } from "date-fns";

// "2026-10-22T09:18:31+09:00"
function iso(epoch: number | null, tz: string): string {
  if (epoch === null) return "";
  return format(new TZDate(epoch * 1000, tz), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

export function dailyCsv(r: PresenceRange): string {
  const lines = ["date,first_arrival,last_departure,presence_minutes,away_minutes"];
  for (const d of r.days) {
    const s = d.summary;
    lines.push(
      [
        d.date,
        iso(s.firstArrival, r.tz),
        iso(s.lastDeparture, r.tz),
        Math.round(s.presenceSec / 60),
        Math.round(s.awaySec / 60),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function intervalCsv(r: PresenceRange): string {
  const lines = ["date,start,end,minutes"];
  for (const d of r.days) {
    for (const s of d.segments) {
      if (s.state !== "in") continue;
      const end = s.end ?? r.now;
      lines.push(
        [d.date, iso(s.start, r.tz), iso(s.end, r.tz), Math.round((end - s.start) / 60)].join(","),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
