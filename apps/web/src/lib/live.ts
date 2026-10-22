import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { DEMO } from "./api.ts";

type Message =
  | { type: "device" }
  | { type: "sync" }
  | { type: "presence"; eventId: string; at: number }
  | { type: "focus"; at: number };

// daemon からの通知 (SSE) で表示を更新する。新しいイベントの時刻を返す (マスを光らせる用)
export function useLive(): number | null {
  const qc = useQueryClient();
  const [flashAt, setFlashAt] = useState<number | null>(null);

  useEffect(() => {
    if (DEMO) return;
    const es = new EventSource("/api/events");
    let timer: ReturnType<typeof setTimeout> | undefined;
    es.onmessage = (ev) => {
      let msg: Message;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      void qc.invalidateQueries({ queryKey: ["status"] });
      if (msg.type === "presence") {
        void qc.invalidateQueries({ queryKey: ["presence"] });
        setFlashAt(msg.at);
        clearTimeout(timer);
        timer = setTimeout(() => setFlashAt(null), 1500);
      }
      if (msg.type === "sync" || msg.type === "focus") {
        void qc.invalidateQueries({ queryKey: ["presence"] });
      }
    };
    // 再接続した時は取りこぼしがあるかもしれないので読み直す
    es.onopen = () => void qc.invalidateQueries();
    return () => {
      es.close();
      clearTimeout(timer);
    };
  }, [qc]);

  return flashAt;
}
