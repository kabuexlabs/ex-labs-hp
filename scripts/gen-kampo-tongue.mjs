// 舌の項目別イラスト（1枚に1つの要素だけを描く）を public/assets/kampo/tongue/e-*.svg に書き出す。
//   node scripts/gen-kampo-tongue.mjs
// 体質チェックの舌（ご本人入力・薬剤師入力）の選択肢に使う（2026-10-31 第4弾 2-8）。
// 色の項目では形や苔を描かず、形の項目では色をふつう（淡いピンク）にそろえ、苔の項目では舌の色・形をふつうにそろえる。
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'assets', 'kampo', 'tongue');
fs.mkdirSync(OUT, { recursive: true });

const W = 120, H = 130;
const NORMAL = { top: '#F7CACB', mid: '#F0B0B3', edge: '#D98E94' };
// 舌の輪郭（上が奥・下が舌先）。w は幅の倍率、h は長さの倍率
const outline = (w = 1, h = 1) => {
  const x0 = 60 - 38 * w, x1 = 60 + 38 * w, tip = 14 + 104 * h, r = 26 * w;
  return `M${x0} 32 C${x0} 12 ${x1} 12 ${x1} 32 L${x1} ${tip - 40} C${x1} ${tip - 8} ${60 + r} ${tip} 60 ${tip} C${60 - r} ${tip} ${x0} ${tip - 8} ${x0} ${tip - 40} Z`;
};
const defs = (id, c) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.top}"/><stop offset="1" stop-color="${c.mid}"/></linearGradient></defs>`;
const groove = (c = '#D98E94') => `<path d="M60 26 L60 ${H - 22}" stroke="${c}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".55"/>`;
const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">${inner}</svg>\n`;
const tongue = (c = NORMAL, { w = 1, h = 1, extra = '', id = 'g' } = {}) =>
  svg(`${defs(id, c)}<path d="${outline(w, h)}" fill="url(#${id})" stroke="${c.edge}" stroke-width="2.4" stroke-linejoin="round"/>${groove(c.edge)}${extra}`);

const files = {};

// ---- 色（形・苔は描かない。ふつうの形）----
files['color-normal'] = tongue(NORMAL);
files['color-pale'] = tongue({ top: '#FBE8E6', mid: '#F6D8D6', edge: '#E3B9B8' });
files['color-red'] = tongue({ top: '#EA6A70', mid: '#D9444F', edge: '#B52F3B' });
files['color-purple'] = tongue({ top: '#B88AA3', mid: '#9A6486', edge: '#7B4A6B' });
// 色の追加
const edgeBand = `<path d="${outline()}" fill="none" stroke="#D93B49" stroke-width="9" stroke-linejoin="round" opacity=".8" clip-path="url(#clipE)"/>`;
files['color-edge'] = svg(`${defs('g', NORMAL)}<clipPath id="clipE"><path d="${outline()}"/></clipPath><path d="${outline()}" fill="url(#g)" stroke="${NORMAL.edge}" stroke-width="2.4" stroke-linejoin="round"/>${edgeBand}${groove()}`);
const dots = [[44, 46], [72, 54], [52, 70], [78, 82], [42, 88], [62, 100], [70, 40]]
  .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3.2" ry="2.5" fill="#5A2E58" opacity=".9"/>`).join('');
files['color-spots'] = tongue(NORMAL, { extra: dots });

// ---- 形（色はふつう）----
files['shape-normal'] = tongue(NORMAL);
// 歯の跡：両縁にぎざぎざ（背景色の小さな円をふちに重ねる）
const marks = [40, 54, 68, 82, 96].flatMap((y) => {
  const dx = y > 84 ? (y - 84) * 0.45 : 0;
  return [`<circle cx="${(22 + dx).toFixed(1)}" cy="${y}" r="5" fill="#fff"/>`, `<circle cx="${(98 - dx).toFixed(1)}" cy="${y}" r="5" fill="#fff"/>`];
}).join('');
files['shape-teeth'] = tongue(NORMAL, { extra: marks });
files['shape-swollen'] = tongue(NORMAL, { w: 1.2, h: 0.96, extra: '<ellipse cx="50" cy="52" rx="10" ry="20" fill="#fff" opacity=".35"/>' });
files['shape-thin'] = tongue(NORMAL, { w: 0.74, h: 0.82 });
const cracks = '<g stroke="#9A4A55" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M60 32 L60 108"/><path d="M60 52 L48 62"/><path d="M60 70 L72 80"/><path d="M60 88 L50 96"/><path d="M46 44 L42 58"/><path d="M74 46 L79 60"/></g>';
files['shape-cracked'] = tongue(NORMAL, { extra: cracks });
files['shape-deviation'] = svg(`${defs('g', NORMAL)}<g transform="rotate(14 60 20)"><path d="${outline()}" fill="url(#g)" stroke="${NORMAL.edge}" stroke-width="2.4" stroke-linejoin="round"/>${groove(NORMAL.edge)}</g><g stroke="#8A8A8A" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"><path d="M14 64 q-4 4 0 8"/><path d="M8 62 q-6 6 0 12"/><path d="M106 60 q4 4 0 8"/><path d="M112 58 q6 6 0 12"/></g>`);

// ---- 苔（舌の色・形はふつう）----
const coatPath = (inset) => `M${60 - 38 + inset} 34 C${60 - 38 + inset} 22 ${60 + 38 - inset} 22 ${60 + 38 - inset} 34 L${60 + 38 - inset} 74 C${60 + 38 - inset} 98 ${60 + 22} 110 60 110 C${60 - 22} 110 ${60 - 38 + inset} 98 ${60 - 38 + inset} 74 Z`;
const coated = (fill, opacity, extra = '') => tongue(NORMAL, { extra: `<path d="${coatPath(7)}" fill="${fill}" opacity="${opacity}"/>${extra}` });
files['coat-thin'] = coated('#fff', 0.45);
files['coat-thick'] = coated('#fff', 0.97);
files['coat-yellow'] = coated('#E9C24A', 0.92);
files['coat-grayblack'] = coated('#5E5A58', 0.82);
files['coat-little'] = tongue({ top: '#EC9AA0', mid: '#E27F88', edge: '#C45F6B' }, { extra: '<path d="M46 34 L74 34 L70 46 L50 46 Z" fill="#fff" opacity=".35"/>' });
files['coat-mirror'] = tongue({ top: '#E88A92', mid: '#DE6F7A', edge: '#C05562' }, { extra: '<ellipse cx="48" cy="56" rx="10" ry="26" fill="#fff" opacity=".55" transform="rotate(-8 48 56)"/><ellipse cx="74" cy="80" rx="5" ry="10" fill="#fff" opacity=".4"/>' });
// 苔の追加：潤い
files['coat-moist'] = coated('#fff', 0.6, '<g fill="#fff" opacity=".95"><circle cx="48" cy="50" r="3.4"/><circle cx="68" cy="44" r="2.6"/><circle cx="58" cy="66" r="3.8"/><circle cx="76" cy="78" r="3"/><circle cx="46" cy="86" r="2.8"/><circle cx="62" cy="98" r="2.6"/></g><g stroke="#B4CFEA" stroke-width="1.2" fill="none" opacity=".9"><circle cx="48" cy="50" r="3.4"/><circle cx="58" cy="66" r="3.8"/><circle cx="76" cy="78" r="3"/></g>');
files['coat-dry'] = coated('#F4E6C8', 0.55, '<g stroke="#B78C5A" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"><path d="M44 46 l8 4 l-4 8"/><path d="M70 44 l-6 6 l6 6"/><path d="M52 76 l10 2 l-2 8"/><path d="M74 88 l-8 4"/><path d="M48 98 l8 -4"/></g>');

// ---- 舌の裏（舌下静脈）：舌を持ち上げて裏から見た図 ----
const under = (veins) => svg(`<defs><linearGradient id="u" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4C0C0"/><stop offset="1" stop-color="#EEA9AC"/></linearGradient></defs>`
  + `<path d="M28 32 C28 14 92 14 92 32 L92 78 C92 104 82 118 60 118 C38 118 28 104 28 78 Z" fill="url(#u)" stroke="#D98E94" stroke-width="2.4" stroke-linejoin="round"/>`
  + '<path d="M60 30 L60 98" stroke="#E7A9AE" stroke-width="5" stroke-linecap="round"/><path d="M60 30 L60 98" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>'
  + veins);
files['vein-normal'] = under('<g stroke="#B9A0C6" stroke-width="2" fill="none" stroke-linecap="round" opacity=".75"><path d="M52 38 C46 56 46 78 52 96"/><path d="M68 38 C74 56 74 78 68 96"/></g>');
files['vein-distended'] = under('<g stroke="#5E3C86" stroke-width="6.5" fill="none" stroke-linecap="round" opacity=".92"><path d="M50 36 C38 54 38 80 50 98"/><path d="M70 36 C82 54 82 80 70 98"/></g><g fill="#5E3C86" opacity=".9"><circle cx="40" cy="62" r="5"/><circle cx="80" cy="62" r="5"/><circle cx="44" cy="84" r="4"/><circle cx="76" cy="84" r="4"/></g>');

for (const [k, v] of Object.entries(files)) fs.writeFileSync(path.join(OUT, `e-${k}.svg`), v);
console.log(`wrote ${Object.keys(files).length} files to ${OUT}`);
