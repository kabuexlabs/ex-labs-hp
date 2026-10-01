// 「東京の夜デート」（/guide/tokyo-night-date/）と「東京のクリスマスデート」（/guide/tokyo-christmas-date/）の掲載データ。
// どちらも記事の核心は「何時に始まるか」「12月の何日に開催するか」なので、公式ページ・予約ページで
// 開始時刻・開催日を確認できた体験だけを入れる（料金の区分に「夜」があるだけでは開始時刻の確認にならない）。
// 確認できた体験が PUBLISH_MIN 件以上になるまでは下書き（noindex、記事一覧・サイトマップ・内部リンクに出さない）。
// 自社公演は src/data/events/occurrences.ts の startTime・date からも自動で数える（outingCatalog と同じ正本）。
import { occurrences } from './events/occurrences';
import { works } from './events/works';

export interface TimedInfo {
  /** src/lib/outingCatalog.ts の Outing.id（例：zettai-kukan-ikebukuro） */
  id: string;
  /** 公式に記載された開始時刻（'HH:mm'）。最終回だけ分かる場合は lastStart に */
  startTimes?: string[];
  lastStart?: string;
  /** 開催日（YYYY-MM-DD）。クリスマス記事で使う */
  dates?: string[];
  /** 記事に出す補足（公式の記載どおり） */
  note: string;
  checkedAt: string;
  checkedBy: string;
}

/** 夜（17時以降）に始まる回があると公式で確認できた体験 */
export const NIGHT_INFO: TimedInfo[] = [];
/** 12月20日〜25日の開催・営業を公式で確認できた体験 */
export const XMAS_INFO: TimedInfo[] = [];

export const PUBLISH_MIN = 3;
export const XMAS_FROM = '2026-12-20';
export const XMAS_TO = '2026-12-25';

const publishedWorkIds = new Set(works.filter((w) => w.published).map((w) => w.id));
const liveOcc = occurrences.filter((o) => o.published && !o.test && o.eventStatus !== 'cancelled' && publishedWorkIds.has(o.workId));

/** 自社公演で、開始時刻が17時以降の回がある作品 */
export const nightOwnWorkIds = [...new Set(liveOcc.filter((o) => o.startTime && o.startTime >= '17:00').map((o) => o.workId))];
/** 自社公演で、クリスマス期間に開催日がある作品 */
export const xmasOwnWorkIds = [...new Set(liveOcc.filter((o) => o.date >= XMAS_FROM && o.date <= XMAS_TO).map((o) => o.workId))];

const timed = (xs: TimedInfo[]) => xs.filter((x) => (x.startTimes?.length ?? 0) > 0 || !!x.lastStart);
export const NIGHT_PUBLISHED = timed(NIGHT_INFO).length + nightOwnWorkIds.length >= PUBLISH_MIN;
export const XMAS_PUBLISHED = XMAS_INFO.filter((x) => x.dates?.some((d) => d >= XMAS_FROM && d <= XMAS_TO)).length + xmasOwnWorkIds.length >= PUBLISH_MIN;
