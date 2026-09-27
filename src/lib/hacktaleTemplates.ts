// HACKTALE 公演予約のメール文面テンプレート。
//
// 公演回を作るとき、ここの既定文面が公演回にコピーされ、管理画面で
// 公演回ごとに手直しできる。本文中の {作品名} {日時} などの差し込みは
// 送信時に自動で置き換わる（日時を後から変えても文面を直す必要がない）。
//
// 振込先の口座情報はこのリポジトリが公開のためコードに書かず、管理画面の
// 設定（KV）に保存して {振込先} で差し込む。

export type HtFormat = 'offline' | 'online';
export const FORMAT_LABEL: Record<HtFormat, string> = { offline: '対面', online: 'オンライン' };

export type GoKind = 'offline' | 'offline-prep' | 'online';
export const GO_KIND_LABEL: Record<GoKind, string> = {
  offline: '対面',
  'offline-prep': '対面＋事前読み込み（Discordサーバー案内つき）',
  online: 'オンライン（Discord・振込）',
};

/** 管理画面に出す差し込みの一覧 */
export const PLACEHOLDERS: { key: string; desc: string }[] = [
  { key: '{作品名}', desc: '例: 人狼定理' },
  { key: '{日時}', desc: '例: 10月12日(日) 19:00' },
  { key: '{日付}', desc: '例: 10月12日(日)' },
  { key: '{開始時刻}', desc: '例: 19:00' },
  { key: '{料金}', desc: '公演回の料金欄' },
  { key: '{お名前}', desc: '予約者のお名前' },
  { key: '{人数}', desc: '例: 2名' },
  { key: '{予約番号}', desc: '例: HT-261012-AB3D' },
  { key: '{Discordリンク}', desc: '公演回のDiscordリンク欄' },
  { key: '{振込先}', desc: '設定の振込先欄' },
];

const ACCEPT_BASE = (flopTiming: string) => `お世話になっております。

この度は、{日時}「{作品名}」の公演にお申し込みいただき、誠にありがとうございます。
ご予約を承りました。

開催人数に達しましたら改めて当日の詳細をご案内いたしますので、今しばらくお待ちください。

なお、人数未達により開催を見送る場合は、${flopTiming}にご連絡いたします。

それでは、当日までどうぞよろしくお願いいたします。`;

/** 申し込み時（受付）メール。人狼定理だけ流卓連絡が1週間前。 */
export function defaultAcceptTemplate(workId: string): string {
  return ACCEPT_BASE(workId === 'werewolf-theorem' ? '1週間前' : '前日の20時頃');
}

export const FLOP_TEMPLATE = `お世話になっております。

先日お申し込みいただきました{日付}「{作品名}」の公演につきまして、ご連絡いたします。

残念ながら、開催に必要な人数に達しなかったため、今回は開催を見送ることとなりました。

せっかくお申し込みいただいたところ、このようなご案内となり申し訳ございません。

また別の機会にご参加いただけましたら幸いです。
今後ともどうぞよろしくお願いいたします。`;

const CANCEL_POLICY = `★キャンセル料金は以下の通りです。いかなる理由であっても同料金の免除は致しかねます。
【公演日3日前以降のキャンセル】50％(公演全体費用)
【公演日1日前以降のキャンセル】100％(公演全体費用)`;

const GO_ONLINE = `お世話になっております。

先日お申し込みいただきました{日付}「{作品名}」の公演につきまして、無事人数が集まりましたので開催の運びとなりました。

当日の詳細は以下のとおりですので、ご確認をお願いいたします。

◆公演日時
🟥{日時}開始
※開始10分前に、ディスコードチャンネルに集合

◆公演費用
🟥{料金}

以下の銀行口座宛に上記の全額を【公演の1日前まで】にご入金ください。

⚠️ご入金が完了いたしましたら、確認のため、振込時の名義がわかる明細を撮影もしくはスクリーンショットしてこのメールにご返信ください。

{振込先}

◆公演会場
以下のディスコードチャンネルにご入室ください。

🟥{Discordリンク}

◆注意事項
本公演には【ココフォリア】と【ディスコード】を使用いたします。
PCが必須となります。
遊んでいただいた際のディスコードチャンネルは一定期間後に削除いたします。何卒ご了承くださいませ。

【ご予約は、下記規約に同意したものとみなします】
★注意事項 ※必ずご確認ください
・貸切料金は各公演の最大人数分でございます。当日の参加人数に関わらず、上記の料金を頂戴いたします。
・当日の緊急のご連絡は公式LINEまたはXにて承ります。
・回線等、お客様の都合による公演不成立の場合には、キャンセル規定と同じ対価をいただくケースがございます。

${CANCEL_POLICY}

それでは、当日を楽しみにお待ちしております。
よろしくお願いいたします。`;

const OFFLINE_HEAD = `お世話になっております。

先日お申し込みいただきました{日付}「{作品名}」の公演につきまして、無事人数が集まりましたので開催の運びとなりました。

当日の詳細は以下のとおりですので、ご確認のほど何卒よろしくお願いいたします。

◆公演日時
🟥{日時}開始
※開場10分前、5分前集合

◆公演費用
🟥{料金}/名

◆公演場所
〒101-0061
東京都千代田区神田三崎町3-2-10
風水神田三崎ビル5階

◆お支払い方法
当日お支払い、現金のみ`;

const PREP_BLOCK = `◆discordサーバーのご案内
本作品は事前読み込みを行いますので、以下のdiscordサーバーへご入室くださいませ。
ご案内をさせていただく都合上、遅くとも開催1週間前までには必ずご入室いただきますようお願い申し上げます。

また、確認のためご入室がお済みになられましたらdiscordネームをご返信くださいませ。

🟥{Discordリンク}`;

const OFFLINE_TAIL = `【ご予約は、下記規約に同意したものとみなします】
★持ち物
特に必要はありません。 蓋つきの飲み物はお持ち込みいただけます。

★注意事項 ※必ずご確認ください
・貸切料金は各公演の最大人数分でございます。当日の参加人数に関わらず、上記の料金を頂戴いたします。
・ゲーム開始の10分前より受付開始となります。会場にはゲームの開始時間の5分前までにお集まりください。
・受付時にご本人様確認のため、ご予約名をお伺いします。
・当日の緊急のご連絡は公式LINEまたはXにて承ります。
・靴を脱いでいただきます。
・現地は階段が存在します。上り下りが困難な方は、事前にご連絡ください。

${CANCEL_POLICY}`;

/** 開催決定（立卓）メール */
export function defaultGoTemplate(kind: GoKind): string {
  if (kind === 'online') return GO_ONLINE;
  if (kind === 'offline-prep') return `${OFFLINE_HEAD}\n\n${PREP_BLOCK}\n\n${OFFLINE_TAIL}`;
  return `${OFFLINE_HEAD}\n\n${OFFLINE_TAIL}`;
}

// 一覧では「対面（会場）」「オンライン（会場）」と表示するので、形式名は含めない
export const DEFAULT_OFFLINE_VENUE = '東京都千代田区神田三崎町3-2-10 風水神田三崎ビル5階';
export const DEFAULT_ONLINE_VENUE = 'Discord・ココフォリア';

export const SUBJECTS = {
  accept: '【HACKTALE】ご予約を承りました（{日付}「{作品名}」）',
  go: '【HACKTALE】開催決定のご案内（{日付}「{作品名}」）',
  flop: '【HACKTALE】開催見送りのご連絡（{日付}「{作品名}」）',
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export interface RenderVars {
  workTitle: string;
  start: string; // 'YYYY-MM-DDTHH:mm'（JST）
  price: string;
  discordUrl?: string;
  bankInfo?: string;
  name?: string;
  count?: number;
  reservationId?: string;
}

function dateParts(start: string): { date: string; time: string } {
  const m = start.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/);
  if (!m) return { date: start, time: '' };
  const wd = WEEKDAYS[new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getUTCDay()];
  return { date: `${Number(m[2])}月${Number(m[3])}日(${wd})`, time: m[4] };
}

/** 差し込みを置き換える。値が空の差し込みはそのまま残す（missingPlaceholders で検出する）。 */
export function renderTemplate(tpl: string, v: RenderVars): string {
  const { date, time } = dateParts(v.start);
  const map: Record<string, string | undefined> = {
    '{作品名}': v.workTitle,
    '{日時}': time ? `${date} ${time}` : date,
    '{日付}': date,
    '{開始時刻}': time,
    '{料金}': v.price,
    '{お名前}': v.name,
    '{人数}': v.count ? `${v.count}名` : undefined,
    '{予約番号}': v.reservationId,
    '{Discordリンク}': v.discordUrl,
    '{振込先}': v.bankInfo,
  };
  return tpl.replace(/\{[^{}\s]{1,12}\}/g, (k) => map[k] || k);
}

/** 送る前に埋まっていない差し込み（Discordリンク・振込先）を返す。空なら送信可。 */
export function missingPlaceholders(tpl: string, v: Pick<RenderVars, 'discordUrl' | 'bankInfo'>): string[] {
  const out: string[] = [];
  if (tpl.includes('{Discordリンク}') && !v.discordUrl) out.push('Discordリンク（公演回の編集欄）');
  if (tpl.includes('{振込先}') && !v.bankInfo) out.push('振込先（管理画面トップの設定欄）');
  return out;
}
