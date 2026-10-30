import { Maximize, Minimize } from "lucide-react";
import { useEffect, useState } from "react";

// ブラウザのタブやアドレスバーを消して全画面にする (f キーでも切り替え)
export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => {});
}

export function FullscreenButton() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const update = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  if (!document.fullscreenEnabled) return null;
  return (
    <button
      type="button"
      aria-label={on ? "全画面を終了" : "全画面"}
      title={on ? "全画面を終了 (f)" : "全画面 (f)"}
      onClick={toggleFullscreen}
      className="rounded-full p-1 text-sub hover:bg-cell hover:text-fg"
    >
      {on ? <Minimize size={14} /> : <Maximize size={14} />}
    </button>
  );
}
