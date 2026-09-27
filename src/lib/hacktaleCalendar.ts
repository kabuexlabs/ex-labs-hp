// HACKTALE 公演カレンダーのデータ（公開してよい情報だけ）。
// トップページ（静的）は /api/hacktale/calendar から、予約ページ（SSR）は
// ページに埋め込んで、同じ HacktaleCalendar コンポーネントで描画する。
// 予約者の情報は一切含めない（人数は残席数だけ）。
import {
  getWorks,
  getSessions,
  bookedSeatsMap,
  availability,
  sessionFormat,
  workFormats,
  jstNow,
  type HtWorkRec,
} from './hacktaleBooking';
import { FORMAT_LABEL } from './hacktaleTemplates';

export interface CalSession {
  id: string;
  workId: string;
  title: string;
  /** 対面・オンラインの両方がある作品だけ「対面」「オンライン」を付ける */
  tag?: string;
  date: string; // 'YYYY-MM-DD'（JST）
  start: string; // 'HH:mm'
  end?: string; // 'HH:mm'（所要時間から算出）
  state: 'open' | 'full' | 'closed' | 'cancelled';
  remaining: number;
  go: boolean;
  flop: boolean;
}

export interface CalData {
  today: string;
  works: { id: string; title: string; color: string }[];
  sessions: CalSession[];
}

// 作品ごとの色（キービジュアルの色味に合わせる）。未登録の作品は順番に割り当てる。
const WORK_COLORS: Record<string, string> = {
  'present-poker': '#8e44ad',
  'werewolf-theorem': '#c0392b',
  'dice-box': '#2e5aa8',
};
const FALLBACK_COLORS = ['#1f8a70', '#b7791f', '#6b7a8f', '#a3346b'];

export function workColor(w: HtWorkRec, index: number): string {
  return WORK_COLORS[w.id] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function addMinutes(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + min;
  // 日付をまたぐ回は 24:00・25:00 表記（公演案内で一般的な書き方）
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** 今日以降の公開中（非公開以外）の公演回を、カレンダー用に組み立てる。 */
export async function buildCalendarData(filter?: (workId: string, format: 'offline' | 'online') => boolean): Promise<CalData> {
  const now = jstNow();
  const today = now.slice(0, 10);
  const works = await getWorks();
  const workMap = new Map(works.map((w) => [w.id, w]));
  const sessions = (await getSessions()).filter((s) => s.status !== 'draft' && s.start.slice(0, 10) >= today);
  const seats = await bookedSeatsMap(sessions.map((s) => s.id));

  const out: CalSession[] = [];
  for (const s of sessions) {
    const w = workMap.get(s.workId) ?? null;
    const format = sessionFormat(s, w);
    if (filter && !filter(s.workId, format)) continue;
    const a = availability(s, seats.get(s.id) ?? 0, now);
    const start = s.start.slice(11, 16);
    out.push({
      id: s.id,
      workId: s.workId,
      title: w?.title ?? s.workId,
      tag: workFormats(w).length > 1 ? FORMAT_LABEL[format] : undefined,
      date: s.start.slice(0, 10),
      start,
      end: w?.durationMin ? addMinutes(start, w.durationMin) : undefined,
      state: a.state,
      remaining: a.state === 'open' ? a.remaining : 0,
      go: !!s.go,
      flop: !!s.flop,
    });
  }
  return {
    today,
    works: works.map((w, i) => ({ id: w.id, title: w.title, color: workColor(w, i) })),
    sessions: out,
  };
}
