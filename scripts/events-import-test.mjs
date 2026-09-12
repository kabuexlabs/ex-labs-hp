// 外部ページからの候補抽出（JSON-LD／本文推定）の回帰テスト。
//   node --experimental-strip-types scripts/events-import-test.mjs
import { extractJsonLd, extractFromText, extractCandidates, stripHtml, parseDateJa, parseTimeJa, parsePriceJa, parseRemainingJa, candidateToListing, fetchPage } from '../src/lib/events-import.ts';
import { validateListings } from '../src/lib/events.ts';

let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); console.log(`${ok ? 'OK ' : 'NG '} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`); if (!ok) fail++; };
const now = new Date('2026-09-13T01:00:00+09:00');

// ---- 日付・時刻・料金・残席の読み取り ----
eq('9/20（土）', parseDateJa('9/20（土）19:00', now), '2026-09-20');
eq('9月20日', parseDateJa('9月20日(土) 19時', now), '2026-09-20');
eq('2026-10-03', parseDateJa('2026-10-03', now), '2026-10-03');
eq('2026/10/3', parseDateJa('2026/10/3 13:00〜', now), '2026-10-03');
eq('年なし・30日以上過去は翌年', parseDateJa('1/10', now), '2027-01-10');
eq('年なし・直近過去は今年', parseDateJa('9/1', now), '2026-09-01');
eq('全角', parseDateJa('９／２０', now), '2026-09-20');
eq('不正な日付', parseDateJa('13/45', now), undefined);
eq('時刻 19:00', parseTimeJa('9/20（土）19:00〜22:30'), '19:00');
eq('時刻 19時', parseTimeJa('19時開演'), '19:00');
eq('時刻 19時30分', parseTimeJa('19時30分'), '19:30');
eq('時刻なし', parseTimeJa('9/20'), undefined);
eq('料金 ¥4,500', parsePriceJa('参加費 ¥4,500（税込）'), { text: '¥4,500', amount: 4500 });
eq('料金 4500円', parsePriceJa('4500円/人'), { text: '¥4,500', amount: 4500 });
eq('残り2席', parseRemainingJa('🈳2'), { text: '残り2席', status: 'open' });
eq('残り3名', parseRemainingJa('残り3名'), { text: '残り3席', status: 'open' });
eq('満席', parseRemainingJa('満席御礼'), { text: '満席', status: 'soldout' });
eq('中止', parseRemainingJa('本公演は中止'), { text: '中止', status: 'cancelled' });

// ---- JSON-LD ----
const html = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"TheaterEvent","name":"作品X","startDate":"2026-09-20T19:00:00+09:00","endDate":"2026-09-20T22:00:00+09:00","location":{"@type":"Place","name":"店舗A 渋谷店"},"organizer":{"@type":"Organization","name":"店舗A"},"offers":{"@type":"Offer","price":"4500","priceCurrency":"JPY","availability":"https://schema.org/InStock","url":"https://example.com/book/1"}},{"@type":"Event","name":"作品Y","startDate":"2026-09-21","eventStatus":"https://schema.org/EventCancelled"},{"@type":"Event","name":"作品Z","startDate":"2026-09-21T10:00:00Z","offers":{"availability":"https://schema.org/SoldOut"}}]}</script></head><body></body></html>`;
const ld = extractJsonLd(html, 'https://example.com/page');
eq('JSON-LD 件数', ld.length, 3);
eq('JSON-LD 作品X', [ld[0].title, ld[0].date, ld[0].startTime, ld[0].endTime, ld[0].durationMinutes, ld[0].venueName, ld[0].organizerName, ld[0].url, ld[0].priceText, ld[0].amount, ld[0].status], ['作品X', '2026-09-20', '19:00', '22:00', 180, '店舗A 渋谷店', '店舗A', 'https://example.com/book/1', '¥4,500', 4500, 'open']);
eq('JSON-LD 中止', [ld[1].date, ld[1].startTime, ld[1].status], ['2026-09-21', undefined, 'cancelled']);
eq('JSON-LD UTC→JST', [ld[2].date, ld[2].startTime, ld[2].status], ['2026-09-21', '19:00', 'soldout']);
eq('JSON-LD 無しなら本文推定へ', extractCandidates('<p>9/20(土) 19:00 ¥4,500</p>', 'https://example.com/', now).via, 'text');
eq('何も無い', extractCandidates('<p>こんにちは</p>', 'https://example.com/', now).via, 'none');

// ---- 本文推定 ----
const txt = stripHtml(`<h2>黒い森の獣</h2><ul><li>9/20(土) 19:00〜 参加費 ¥5,000 🈳2</li><li>9/21(日) 13:00〜 満席</li></ul><h2>違人</h2><p>10/3（土）18時30分 4000円 残り1名</p><p>10/3（土）18時30分 4000円 残り1名</p>`);
const tc = extractFromText(txt, now, 'https://example.com/s');
eq('本文推定 件数（重複除去）', tc.length, 3);
eq('本文推定 1件目', [tc[0].title, tc[0].date, tc[0].startTime, tc[0].priceText, tc[0].remainingText, tc[0].status, tc[0].via], ['黒い森の獣', '2026-09-20', '19:00', '¥5,000', '残り2席', 'open', 'text']);
eq('本文推定 満席', [tc[1].title, tc[1].status], ['黒い森の獣', 'soldout']);
eq('本文推定 見出し切替', [tc[2].title, tc[2].startTime, tc[2].priceText, tc[2].remainingText], ['違人', '18:30', '¥4,000', '残り1席']);
eq('本文推定は料金単位を決めない', [tc[0].priceUnit, tc[0].amount], [undefined, undefined]);

// ---- Listing 化と検証 ----
const l = candidateToListing(ld[0], { id: 'x1', siteId: 'rabbithole', regionId: 'tokyo', areaId: 'shibuya', genres: ['murder-mystery'], organizerName: '店舗A', url: 'https://example.com/book/1', checkedBy: '管理者', now });
eq('Listing 化', [l.id, l.title, l.date, l.startTime, l.priceUnit, l.amount, l.status, l.published, l.fetchedVia, l.checkedAt], ['x1', '作品X', '2026-09-20', '19:00', 'per-person', 4500, 'open', true, 'jsonld', '2026-09-13T01:00:00+09:00']);
eq('Listing 検証OK', validateListings([l], new Set(['rabbithole'])), []);
const l2 = candidateToListing(tc[0], { id: 'x2', siteId: 'queens-waltz', regionId: 'tokyo', areaId: 'roppongi', genres: ['murder-mystery'], organizerName: 'クインズワルツ', url: 'https://example.com/s', checkedBy: '管理者', now });
eq('本文推定は料金単位が無いので検証で止まる（管理画面で選ぶ）', validateListings([l2], new Set(['queens-waltz'])).length > 0, true);

// ---- 取得の安全側 ----
const r = await fetchPage('http://example.com/');
eq('http は拒否', [r.ok, r.error], [false, 'https の URL だけ取得できます']);
const r2 = await fetchPage('https://example.com/x', async () => new Response('<p>hi</p>', { status: 404, headers: { 'content-type': 'text/html' } }));
eq('404 はエラー', [r2.ok, r2.status, r2.error], [false, 404, 'HTTP 404']);
const r3 = await fetchPage('https://example.com/x', async () => new Response('<p>ok</p>', { status: 200, headers: { 'content-type': 'text/html' } }));
eq('200 は本文', [r3.ok, r3.body], [true, '<p>ok</p>']);

console.log(fail ? `\n取り込みテスト: ${fail} 件失敗` : '\n取り込みテスト: 全件OK');
process.exit(fail ? 1 : 0);
