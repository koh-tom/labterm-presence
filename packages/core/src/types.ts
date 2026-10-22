export type PresenceState = "in" | "away" | "out";
export type EventSource = "button" | "focus" | "web";

// PC側に保存するイベント。区間や集計はすべてここから作り直せる
export type PresenceEvent = {
  id: string;
  kind: "state" | "void";
  state?: PresenceState;
  voids?: string; // 取り消すイベントの id
  deviceId: string;
  gen: number;
  seq: number;
  deviceEpoch: number;
  receivedAt: number;
  effectiveAt: number; // 集計に使う時刻 (UNIX秒)
  source: EventSource;
  flags: string[];
};

// 在室 / 外出の連続した区間。end が null なら進行中
export type Segment = {
  state: "in" | "away";
  start: number;
  end: number | null;
  startEventId: string;
  endEventId?: string;
  manual?: boolean; // Web から手で直したイベントが含まれる
};

// 研究タイマーで研究していた区間
export type FocusSession = {
  start: number;
  end: number;
};

export type DailySummary = {
  date: string; // "2026-10-22"
  firstArrival: number | null;
  lastDeparture: number | null; // 在室中なら null
  presenceSec: number;
  awaySec: number;
  focusSec: number;
  intervalCount: number;
};

export type RangeSummary = {
  totalSec: number;
  focusSec: number;
  averageSec: number; // 在室日1日あたり
  labDays: number;
};

// マス目の1マス
export type Cell = {
  start: number;
  end: number;
  kind: "in" | "partial" | "away" | "empty" | "future";
  focus: boolean; // 在室で、半分以上研究していた
  // 在室していた部分 (マスの中の 0..1)。partial のときの塗る範囲
  from: number;
  to: number;
  now: boolean;
};
