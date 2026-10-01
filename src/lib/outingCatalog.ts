// デート・お出かけ記事（休日・付き合う前・夜・クリスマスなど）が共通で使う「確認済みの体験」の一覧。
// 正本はそれぞれのデータで、ここでは1つの型にそろえるだけ（料金・人数・時間を手書きしない）。
//  - 自社・制作協力の公演：src/data/events/（終了した公演は自動で外れる）
//  - HACKTALE（頭脳戦）：src/data/hacktale.ts の作品データ
//  - UNLIMITED MYSTERY（マダミス）：src/data/toudaimurderWorks.ts（料金・人数・時間がそろった作品だけ）
//  - 他社：src/data/nazoDate.ts・src/data/experienceDate.ts の published 分
// 確認できていない値は UNKNOWN（「公式で確認」）のまま出す。
import { buildGuideRows, fmtYen, type GuideRow } from './tokyoGuide';
import { bookingUrl } from './priceLabel';
import { ownDateRow, UNKNOWN, type DateRow } from './dateGuide';
import { shows } from '../data/shows';
import { htWorks } from '../data/hacktale';
import { tmWorks, TM_LINE_URL } from '../data/toudaimurderWorks';
import { publishedNazoItems, type NazoItem } from '../data/nazoDate';
import { publishedItems, GENRE_LABEL, type ExperienceItem } from '../data/experienceDate';
import { jstDateString } from './thisWeek';
import { isKvConfigured, getSessions, getWorks as getHtWorks, bookedSeatsMap, availability, sessionFormat, formatStartJa, jstNow, AVAILABILITY_LABEL } from './hacktaleBooking';

export type OutingKind = 'story' | 'escape' | 'craft' | 'art' | 'madamis' | 'zunousen';
export const KIND_LABEL: Record<OutingKind, string> = {
  story: '物語参加型（キャストと交流）',
  escape: '謎解き・脱出ゲーム',
  craft: 'ものづくり',
  art: '没入型アート・展示',
  madamis: 'マーダーミステリー',
  zunousen: '頭脳戦・心理戦ゲーム',
};

/** 体験中にどんな会話が生まれるか（記事で「会話量」を説明するための分類。各データの記載から決める） */
export type TalkStyle = 'cast' | 'pair' | 'group' | 'craft';
export const TALK_LABEL: Record<TalkStyle, string> = {
  cast: 'キャストとの会話が進行の一部',
  pair: '二人（仲間内）で相談しながら進める',
  group: '参加者同士の会話・交渉・推理が中心',
  craft: '手を動かしながら話せる（講師とのやり取りが中心）',
};

export interface Outing {
  id: string;
  name: string;
  kind: OutingKind;
  /** 株式会社ex Labs が企画・制作・運営に関わるもの */
  own: boolean;
  ownLabel?: string;
  area: string;
  /** 申し込める人数 */
  partyText: string;
  min?: number;
  max?: number;
  /** 一人で申し込めるか（true／false／未確認） */
  solo?: boolean;
  /** 体験中に知らない人と一緒になるか（true＝一緒、false＝自分たちだけ、undefined＝未確認） */
  strangers?: boolean;
  privacyText: string;
  /** 人数ごとの総額（円）。計算できなければ undefined */
  totalFor: (n: number) => number | undefined;
  /** 料金の短い表示（1人あたり・1組あたりなど、データの記載どおり） */
  priceText: string;
  minutes?: number;
  timeText: string;
  setting: string;
  talk: TalkStyle;
  talkText: string;
  beginner: string;
  ageRule?: string;
  scary?: string;
  /** 予約の方法と必要性 */
  reserveText: string;
  reserveHref?: string;
  reserveLabel: string;
  /** サイト内の詳細ページ（なければ予約先） */
  detailHref: string;
  /** 今日以降の確認済みの開催日（日時指定の公演だけ。常設・随時は空） */
  dates: string[];
  /** 開催の形 */
  schedule: 'dated' | 'permanent' | 'on-request';
  scheduleText: string;
  checked: string;
  /** 共通の比較表（DateCompare）の行 */
  row: DateRow;
}

const yen = (n: number) => `${n.toLocaleString('ja-JP')}円`;
const num = (s?: string) => (s ? Number(s.replace(/[^\d]/g, '')) || undefined : undefined);

function fromEvent(r: GuideRow, today: string): Outing {
  const area = shows.find((s) => s.id === r.w.id)?.area ?? r.venue?.listName ?? '東京';
  const row = ownDateRow(r, area);
  const fmt = r.w.party.format;
  return {
    id: r.w.id, name: r.w.title, kind: 'story', own: r.own, ownLabel: r.organizer.relationLabel,
    area: row.area, partyText: r.w.party.text, min: r.w.party.min, max: r.w.party.max, solo: r.w.party.soloAllowed,
    strangers: fmt === 'private' ? false : fmt === 'shared' ? true : undefined, privacyText: row.privacy,
    totalFor: (n) => r.totalFor(n), priceText: r.w.price.unit === 'per-group' ? '1組料金・税込、手数料別' : r.w.price.unit === 'per-person' && r.w.price.amount !== undefined ? `1人${yen(r.w.price.amount)}・税込、手数料別` : r.w.price.text,
    minutes: r.w.duration.minutes, timeText: row.time, setting: row.setting,
    talk: r.w.info.actorInteraction ? 'cast' : 'group', talkText: r.w.info.participation ?? UNKNOWN, beginner: r.w.info.beginner ?? UNKNOWN,
    ageRule: r.w.info.ageRule, scary: r.w.info.scary,
    reserveText: '日時指定の予約制（予約サイトで回を選ぶ）。受付時間に遅れると参加できない公演があります',
    reserveHref: bookingUrl(r.w, r.ticketUrl), reserveLabel: '予約サイトで空席を見る', detailHref: `/events/${r.w.slug}/`,
    dates: r.futureDates.filter((d) => d >= today),
    schedule: 'dated', scheduleText: r.futureDates.length ? `開催日 ${r.datesText}` : (r.w.period?.text ?? UNKNOWN),
    checked: r.w.verified.at.slice(0, 10), row,
  };
}

function fromHacktale(w: (typeof htWorks)[number]): Outing | undefined {
  const price = num(/([\d,]+)円/.exec(w.meta)?.[1]);
  if (!price) return undefined; // 「詳細は近日公開」の作品は載せない
  const beginner = /ルールを知らなくても/.test(w.desc) ? '人狼のルールを知らなくても遊べると案内' : UNKNOWN;
  const total = (n: number) => price * n;
  const row: DateRow = {
    id: `hacktale-${w.slug}`, name: `${w.title}（HACKTALE）`, sub: '株式会社ex Labs制作', href: '/hacktale/', area: '東京（会場は公演回ごとに予約ページで案内）',
    pair: `${yen(total(2))}（1人${yen(price)}×2）`, time: `約${w.minutes}分`, privacy: `相席（${w.players}人で1卓。他の参加者と同じ卓）`, setting: '屋内（店舗公演）',
    talk: TALK_LABEL.group, beginner, reserveHref: '/hacktale/reservation/', reserveLabel: '公演予約ページ', own: true, siteId: `hacktale-${w.slug}`, checked: '',
  };
  return {
    id: row.id, name: row.name, kind: 'zunousen', own: true, ownLabel: '株式会社ex Labs制作', area: row.area,
    partyText: `${w.players}人で1卓（1人から予約。開催に必要な人数が集まると開催決定）`, min: 1, max: w.players, solo: true, strangers: true, privacyText: row.privacy,
    totalFor: (n) => (n <= w.players ? total(n) : undefined), priceText: `1人${yen(price)}`, minutes: w.minutes, timeText: row.time, setting: row.setting,
    talk: 'group', talkText: w.desc, beginner, reserveText: '公演予約ページで日程を選んで予約。開催に必要な人数が集まった時点で開催決定。貸切は公式LINE・フォームで相談',
    reserveHref: '/hacktale/reservation/', reserveLabel: '公演予約ページ', detailHref: '/hacktale/', dates: [], schedule: 'dated', scheduleText: '公演回は予約ページのカレンダーで公開',
    checked: '', row,
  };
}

function fromTm(w: (typeof tmWorks)[number]): Outing | undefined {
  const d = (re: RegExp) => w.details?.find((x) => re.test(x.label))?.value;
  const priceS = d(/料金/); const peopleS = d(/人数/); const timeS = d(/時間/);
  const price = num(/([\d,]+)円/.exec(priceS ?? '')?.[1]);
  const people = (peopleS?.match(/\d+/g) ?? []).map(Number);
  const minutes = num(timeS);
  // 料金・人数・時間がそろい、経験者向けでない8人以下の作品だけ（/guide/madamis/ と同じ基準）
  if (!price || !people.length || !minutes || /経験者|高難度/.test(`${w.play}${w.specs.join('')}${w.desc}`) || Math.min(...people) > 8) return undefined;
  const total = (n: number) => (people.includes(n) ? price * n : undefined);
  const row: DateRow = {
    id: `tm-${w.slug}`, name: `${w.title}（マダミス）`, sub: 'UNLIMITED MYSTERY', href: `/toudaimurder/works/${w.slug}/`, area: '東京（会場は予約時に案内）',
    pair: '2人では遊べません（作品ごとに人数が決まっています）', time: timeS ?? UNKNOWN, privacy: `貸切（${peopleS}で1卓）`, setting: '屋内（店舗公演）',
    talk: TALK_LABEL.group, beginner: w.specs.includes('GM必須') ? '進行役（GM）がルール説明から進行まで担当' : UNKNOWN,
    reserveHref: TM_LINE_URL, reserveLabel: '公式LINEで予約', own: true, siteId: `tm-${w.slug}`, checked: '',
  };
  return {
    id: row.id, name: row.name, kind: 'madamis', own: true, ownLabel: 'UNLIMITED MYSTERY（東大マーダーミステリーサークル）', area: row.area,
    partyText: `${peopleS}`, min: Math.min(...people), max: Math.max(...people), solo: false, strangers: false, privacyText: row.privacy,
    totalFor: total, priceText: `1人${priceS}`, minutes, timeText: timeS ?? UNKNOWN, setting: row.setting,
    talk: 'group', talkText: '登場人物になりきり、会話と推理で真相を探す', beginner: row.beginner,
    reserveText: '貸し切りでの予約が基本。公式LINE・お問い合わせフォームで日程を相談', reserveHref: TM_LINE_URL, reserveLabel: '公式LINEで予約',
    detailHref: `/toudaimurder/works/${w.slug}/`, dates: [], schedule: 'on-request', scheduleText: '貸切で日程を相談', checked: '', row,
  };
}

function fromNazo(i: NazoItem): Outing {
  const n2 = i.perPerson2 ? i.perPerson2.low * 2 : i.pairPriceMin;
  const players = (i.players.match(/\d+/g) ?? []).map(Number);
  const row: DateRow = {
    id: i.id, name: i.name, sub: i.format, href: '/guide/tokyo-nazo-date/', area: i.area,
    pair: `${i.pairPrice}。${i.tax}`, time: `${/^\d/.test(i.timeLimit) ? `制限時間${i.timeLimit}` : i.timeLimit}／${i.totalTime}`,
    privacy: i.privacy === 'room' ? '二人だけ（部屋を一組で貸切）' : i.privacy === 'team' ? '二人で1チーム（知らない人と組まない。部屋の貸切ではない）' : i.privacy === 'shared' ? '相席（他の参加者と一緒）' : UNKNOWN,
    setting: i.indoor, talk: TALK_LABEL.pair, beginner: i.beginner.replace('公式ページで確認', UNKNOWN),
    reserveHref: i.officialUrl || undefined, reserveLabel: '公式ページで予約', own: false, siteId: i.siteId, checked: i.checkedAt,
  };
  return {
    id: i.id, name: i.name, kind: 'escape', own: false, area: i.area, partyText: i.players, min: players[0], max: players[1],
    solo: players[0] === 1 ? true : players[0] >= 2 ? false : undefined,
    strangers: i.privacy === 'room' || i.privacy === 'team' ? false : i.privacy === 'shared' ? true : undefined, privacyText: row.privacy,
    totalFor: (n) => (n === 2 ? n2 : undefined), priceText: i.pairPrice, minutes: i.totalMinutes ?? i.gameMinutes, timeText: row.time, setting: i.indoor,
    talk: 'pair', talkText: '仲間内で相談しながら謎を解く', beginner: row.beginner,
    reserveText: '予約制（受付時刻は作品ページで確認）', reserveHref: row.reserveHref, reserveLabel: row.reserveLabel ?? '公式ページで予約',
    detailHref: `/guide/tokyo-nazo-date/#item-${i.id}`, dates: [], schedule: 'permanent', scheduleText: '店舗で開催（営業日・時間は公式で確認）', checked: i.checkedAt, row,
  };
}

function fromExperience(i: ExperienceItem): Outing | undefined {
  if (!i.compare) return undefined;
  const c = i.compare;
  const href = i.urlChecked ? (i.bookingUrl ?? i.officialUrl) : `https://www.google.com/search?q=${encodeURIComponent(`${i.name.replace(/（[^）]*）/g, '').trim()} 公式`)}`;
  const kind: OutingKind = i.genre === 'puzzle' ? 'escape' : i.genre === 'art' ? 'art' : i.genre === 'story' ? 'story' : 'craft';
  const talk: TalkStyle = kind === 'escape' ? 'pair' : kind === 'craft' ? 'craft' : 'group';
  const row: DateRow = {
    id: i.id, name: i.name, sub: GENRE_LABEL[i.genre], href: `/guide/tokyo-experience-date/#item-${i.id}`, area: c.place, pair: c.pairTotal, time: c.time,
    privacy: c.together, setting: c.outdoor, talk: TALK_LABEL[talk], beginner: UNKNOWN, reserveHref: href,
    reserveLabel: i.urlChecked ? '公式ページで予約' : '公式サイトを検索', own: false, siteId: i.siteId, checked: i.checkedAt,
  };
  return {
    id: i.id, name: i.name, kind, own: false, area: c.place, partyText: i.forTwo, solo: undefined,
    strangers: c.privateForTwo === true ? false : c.privateForTwo === false ? true : undefined, privacyText: c.together,
    totalFor: (n) => (n === 2 ? c.pairTotalMin : undefined), priceText: c.pairTotal, minutes: c.minutes, timeText: c.time, setting: c.outdoor,
    talk, talkText: TALK_LABEL[talk], beginner: UNKNOWN, reserveText: '予約制（空き状況は公式予約ページで確認）', reserveHref: href, reserveLabel: row.reserveLabel!,
    detailHref: row.href, dates: [], schedule: 'permanent', scheduleText: i.status, checked: i.checkedAt, row,
  };
}

/** 確認済みの体験をすべて返す（同じ施設が複数のデータにある場合は先に出たものを使う） */
export function buildOutings(now: Date): Outing[] {
  const today = jstDateString(now);
  const events = buildGuideRows(now).filter((r) => !r.w.guideOnly && (r.status === 'ongoing' || r.status === 'upcoming')).map((r) => fromEvent(r, today));
  const list = [
    ...events,
    ...htWorks.map(fromHacktale).filter((o): o is Outing => !!o),
    ...tmWorks.map(fromTm).filter((o): o is Outing => !!o),
    ...publishedNazoItems.map(fromNazo),
    ...publishedItems.map(fromExperience).filter((o): o is Outing => !!o),
  ];
  const seen = new Set<string>();
  return list.filter((o) => { const k = o.id; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** 指定人数で申し込めるか（人数条件が分からなければ undefined） */
export function fitsParty(o: Outing, n: number): boolean | undefined {
  if (o.min === undefined && o.max === undefined) return undefined;
  if (o.kind === 'madamis') return o.totalFor(n) !== undefined;
  return (o.min ?? 1) <= n && (o.max === undefined || o.max >= n);
}

export { yen, fmtYen };

// --- HACKTALE の公演回（予約システムに登録された日時。開始時刻まで確認できる唯一の自社データ） ---

export interface HtSlot { id: string; title: string; start: string; startText: string; venue: string; price: string; online: boolean; status: string; open: boolean; href: string }

/** 今後の公開中の公演回（非公開・中止は除く）。KV 未設定・取得失敗のときは空 */
export async function hacktaleSlots(filter: (start: string) => boolean = () => true): Promise<HtSlot[]> {
  if (!isKvConfigured()) return [];
  try {
    const now = jstNow();
    const [sessions, works] = await Promise.all([getSessions(), getHtWorks()]);
    const wm = new Map(works.map((w) => [w.id, w]));
    const ss = sessions.filter((s) => s.status !== 'draft' && s.status !== 'cancelled' && s.start > now && filter(s.start)).sort((a, b) => a.start.localeCompare(b.start));
    const seats = await bookedSeatsMap(ss.map((s) => s.id));
    return ss.map((s) => {
      const w = wm.get(s.workId) ?? null;
      const a = availability(s, seats.get(s.id) ?? 0, now);
      return {
        id: s.id, title: w?.title ?? s.workId, start: s.start, startText: formatStartJa(s.start), venue: sessionFormat(s, w) === 'online' ? 'オンライン' : s.venue,
        price: s.price, online: sessionFormat(s, w) === 'online', status: AVAILABILITY_LABEL(a), open: a.state === 'open', href: `/hacktale/reservation/${s.id}/`,
      };
    });
  } catch {
    return [];
  }
}
