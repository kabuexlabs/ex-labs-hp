// 日程調整リマインドメールの画像対応（lib/yoyakuImages.ts）の回帰テスト。
//   node --experimental-strip-types scripts/yoyaku-mail-test.mjs
import { sniffImage, stripImageMarkers, splitNotes, buildReminderMail, cidOf, MAX_IMAGES } from '../src/lib/yoyakuImages.ts';

let ng = 0;
const ok = (cond, label, extra = '') => { if (!cond) { ng++; console.log('NG ', label, extra); } else console.log('ok ', label); };

// --- 形式の判定（先頭バイト） ---
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]), Buffer.from([0, 0, 1, 0x2c, 0, 0, 0, 0xc8]), Buffer.alloc(8)]);
ok(JSON.stringify(sniffImage(png)) === JSON.stringify({ type: 'image/png', width: 300, height: 200 }), 'PNG の形式と寸法');
const gif = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from([0x40, 0x01, 0xf0, 0x00]), Buffer.alloc(8)]);
ok(JSON.stringify(sniffImage(gif)) === JSON.stringify({ type: 'image/gif', width: 320, height: 240 }), 'GIF の形式と寸法');
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58]), Buffer.alloc(16)]);
ok(JSON.stringify(sniffImage(jpg)) === JSON.stringify({ type: 'image/jpeg', width: 600, height: 300 }), 'JPEG の形式と寸法（APP0 を飛ばして SOF0 を読む）');
const webp = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0x30, 0, 0, 0]), Buffer.from('WEBPVP8X', 'latin1'), Buffer.from([10, 0, 0, 0, 0, 0, 0, 0]), Buffer.from([0x1f, 0x03, 0x00, 0xc7, 0x01, 0x00]), Buffer.alloc(4)]);
ok(JSON.stringify(sniffImage(webp)) === JSON.stringify({ type: 'image/webp', width: 800, height: 456 }), 'WebP(VP8X) の形式と寸法');
ok(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')) === null, 'SVG は受け付けない');
ok(sniffImage(Buffer.from('<!doctype html><html><body>x</body></html>')) === null, 'HTML は受け付けない');
ok(sniffImage(Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00')) === null, '実行ファイルは受け付けない');
ok(sniffImage(Buffer.alloc(4)) === null, '短すぎるデータは受け付けない');

// --- マーカー ---
ok(stripImageMarkers('集合は2階\n[画像1]\n注意') === '集合は2階\n注意', '[画像1] だけの行は行ごと消える');
ok(stripImageMarkers('地図 ［画像１］ です') === '地図  です', '全角の［画像１］も消える（文中は文字だけ消す）');
ok(stripImageMarkers('A\n\n[画像2]\n\nB') === 'A\n\nB', 'マーカーで空行が3つ以上並ばない');
ok(stripImageMarkers('【画像3】') === '', 'マーカーだけなら空');
ok(JSON.stringify(splitNotes('前[画像2]後')) === JSON.stringify([{ kind: 'text', text: '前' }, { kind: 'image', n: 2 }, { kind: 'text', text: '後' }]), '文字と画像N に分割');

ok(stripImageMarkers('集合\r\n[画像1]\r\n注意') === '集合\n注意', 'フォーム由来の CRLF 改行でもマーカーの行が消える（LF にそろう）');

// --- 画像なし：従来とまったく同じテキスト・HTML なし ---
const base = { name: '山田', title: 'テスト公演 日程調整', when: '2026年11月5日(木) 14:00〜16:00', adminMail: 'info@kabuexlabs.com' };
const legacy = (notes) => `${base.name} 様\n\n明日のご予約のリマインドです。\n\n■ イベント\n${base.title}\n\n■ 日程\n${base.when}\n\n${notes ? `■ ご案内\n${notes}\n\n` : ''}ご不明な点や変更のご希望がありましたら、このメールへの返信、または ${base.adminMail} までご連絡ください。\n\n当日はどうぞよろしくお願いいたします。\n\n株式会社 ex Labs`;
let m = buildReminderMail({ ...base, notes: '【集合場所】\nビル2F', images: [] });
ok(m.text === legacy('【集合場所】\nビル2F') && m.html === undefined && m.images.length === 0, '画像なし＋ご案内文：従来と同じテキスト・HTML なし');
m = buildReminderMail({ ...base, notes: undefined, images: [] });
ok(m.text === legacy('') && m.html === undefined, '画像なし・ご案内文なし：従来と同じテキスト');
m = buildReminderMail({ ...base, notes: '集合\r\n注意', images: [] });
ok(m.text === legacy('集合\n注意'), 'CRLF のご案内文は LF にそろう（表示は同じ）');
m = buildReminderMail({ ...base, notes: '集合\n[画像1]\n注意', images: [] });
ok(m.text === legacy('集合\n注意') && !m.text.includes('画像'), '画像なしでマーカーだけ残っていても本文に出ない');

// --- 画像あり ---
const img = (id, alt, w, h) => ({ id, alt, type: 'image/jpeg', data: Buffer.from('x'), width: w, height: h });
const imgs = [img('aaa111', '会場の地図', 1000, 500), img('bbb222', '', 300, 300), img('ccc333', '入口の写真', undefined, undefined)];
m = buildReminderMail({ ...base, notes: '【集合場所】\nビル2F\n[画像1]\n【注意】\n時間厳守\n［画像２］', images: imgs });
ok(m.html && m.html.startsWith('<!doctype html>'), '画像あり：HTML メールになる');
ok(m.html.includes(`src="cid:${cidOf(imgs[0])}"`) && m.html.includes(`src="cid:${cidOf(imgs[1])}"`) && m.html.includes(`src="cid:${cidOf(imgs[2])}"`), '3枚とも cid で参照される（書かなかった3枚目は後ろに入る）');
const idx = (s) => m.html.indexOf(s);
ok(idx('ビル2F') < idx(cidOf(imgs[0])) && idx(cidOf(imgs[0])) < idx('【注意】') && idx('時間厳守') < idx(cidOf(imgs[1])) && idx(cidOf(imgs[1])) < idx(cidOf(imgs[2])), 'マーカーの位置に画像が入り、残りは末尾に順に入る');
ok(m.html.includes('width="520" height="260"') && m.html.includes('width="300" height="300"'), 'width 属性は本文幅520pxを上限に、縦横比を保つ（Outlook 対策）');
ok(m.html.includes('会場の地図</div>') && m.html.includes('alt="会場の地図"') && m.html.includes('入口の写真</div>'), 'キャプションは alt と画像下の文字に入る');
ok(!/\[画像|［画像|【画像/.test(m.html) && !/\[画像|［画像１|【画像/.test(m.text.replace(/［画像：[^］]*］/g, '')), 'マーカーの文字が本文に残らない');
ok(m.text.includes('［画像：会場の地図］') && m.text.includes('時間厳守') && m.text.includes('明日のご予約のリマインドです。'), 'テキスト版にも本文と［画像：…］が入る');
ok(m.images.length === 3, '埋め込む画像の一覧が返る');
// 同じマーカーの重複・範囲外
m = buildReminderMail({ ...base, notes: '[画像1]\n[画像1]\n[画像9]', images: [imgs[0]] });
ok((m.html.match(/<img /g) ?? []).length === 1, '同じ画像は1回だけ・範囲外のマーカーは無視');
// エスケープ
m = buildReminderMail({ name: '<b>山田</b>', title: 'A&B "公演"', when: base.when, notes: '<script>alert(1)</script>\n[画像1]', adminMail: base.adminMail, images: [img('zzz', '<i>x</i>', 100, 100)] });
ok(!m.html.includes('<script>') && !m.html.includes('<b>山田') && m.html.includes('&lt;script&gt;') && m.html.includes('A&amp;B &quot;公演&quot;') && m.html.includes('alt="&lt;i&gt;x&lt;/i&gt;"'), '名前・タイトル・案内文・キャプションの HTML は無効化される');
// 上限
m = buildReminderMail({ ...base, images: [imgs[0], imgs[1], imgs[2], img('ddd', 'x', 10, 10)] });
ok(m.images.length === MAX_IMAGES, `画像は最大${MAX_IMAGES}枚`);

console.log(ng ? `\n${ng} 件失敗` : '\nすべて成功');
process.exit(ng ? 1 : 0);
