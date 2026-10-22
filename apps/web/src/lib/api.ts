import type { PresenceRange, Stats, Status } from "@labterm/core";
import { useQuery } from "@tanstack/react-query";
import { demoRange, demoStats, demoStatus } from "./demo.ts";
import type { Range } from "./range.ts";

export const DEMO = new URLSearchParams(location.search).has("demo");

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

export function usePresence(r: Range) {
  return useQuery({
    queryKey: ["presence", r.from, r.to],
    queryFn: () =>
      DEMO
        ? demoRange(r.from, r.to)
        : get<PresenceRange>(`/api/presence?from=${r.from}&to=${r.to}`),
    placeholderData: (prev) => prev,
    refetchInterval: 60_000,
  });
}

export function useStats(r: Range, enabled: boolean) {
  return useQuery({
    queryKey: ["stats", r.from, r.to],
    queryFn: () =>
      DEMO ? demoStats(r.from, r.to) : get<Stats>(`/api/stats?from=${r.from}&to=${r.to}`),
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: () => (DEMO ? demoStatus() : get<Status>("/api/status")),
    refetchInterval: 30_000,
  });
}

export function requestSync() {
  return fetch("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

export function exportUrl(kind: "day" | "interval" | "json", r: Range): string {
  const q = `from=${r.from}&to=${r.to}`;
  return kind === "json" ? `/api/export.json?${q}` : `/api/export.csv?${q}&detail=${kind}`;
}

export type Edit =
  | { kind: "state"; state: "in" | "away" | "out"; at: number }
  | { kind: "void"; voids: string };

export async function postEdit(e: Edit) {
  const res = await fetch("/api/presence/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(e),
  });
  if (!res.ok) throw new Error(await res.text());
}
