// 漢方体質チェック（/kampo/）のロジック回帰テスト（2026-10-25 v3・フェーズ2）。
//   node --experimental-strip-types scripts/kampo-test.mjs
// マスタ検証・主訴と深掘り・回答の引き継ぎ（同じ所見を2回聞かない）・改修指示 4-1〜4-8 の個別修正・
// 安全確認タグと直ちに対応・暫定スコアの重複加点防止・二段階の漢方薬選定・旧版セッションの扱いを確認する。
import {
  QUESTIONS, STAFF_QUESTIONS, COMPLAINTS, CATEGORIES, FORMULAS, TYPE_DEFS, validateMasters, complaintById, legacyOptionText, QUESTIONNAIRE,
} from '../src/lib/kampo/masters.ts';
import { walk, normalizeAnswer, firstUnansweredStep, personalTips, primaryOf, complaintsOf, applyStaffAnswers } from '../src/lib/kampo/flow.ts';
import { score } from '../src/lib/kampo/scoring.ts';
import { safetyFlags, safetyTags, isUrgent } from '../src/lib/kampo/safety.ts';
import { computeSession, selectionOf, isLegacy } from '../src/lib/kampo/compute.ts';
import fs from 'node:fs';
import path from 'node:path';

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'OK ' : 'NG '} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const read = (f) => JSON.parse(fs.readFileSync(`src/data/kampo/${f}`, 'utf8'));
const M = ['questions.json', 'complaints.json', 'findings.json', 'safety_tags.json', 'types.json', 'formulas.json'].map(read);
const qById = (id) => QUESTIONS.find((x) => x.id === id);
const texts = (id) => (qById(id)?.options ?? []).map((o) => o.text);

// ---- マスタ検証 ----
eq('マスタ検証 合格', validateMasters(...M), []);
{
  const [qj, cj, fj, tj, ty, fo] = M.map((x) => JSON.parse(JSON.stringify(x)));
  const b1 = qj.questions.find((x) => x.id === 'B1');
  b1.options = b1.options.filter((o) => !o.exclusive);
  eq('「特にない」「わからない」を外すと検証エラー', validateMasters(qj, cj, fj, tj, ty, fo).some((e) => e.includes('B1') && e.includes('exclusive')), true);
  const [q2, c2, f2, t2, y2, o2] = M.map((x) => JSON.parse(JSON.stringify(x)));
  q2.questions.find((x) => x.id === 'B2').options[0].findings = ['no_such_finding'];
  c2.complaints[0].detail = 'missing_tpl';
  o2.formulas[0].signs.push('B99-1');
  const errs = validateMasters(q2, c2, f2, t2, y2, o2);
  eq('存在しない所見・深掘り・signs を検出', ['no_such_finding', 'missing_tpl', 'B99-1'].map((k) => errs.some((e) => e.includes(k))), [true, true, true]);
}
eq('処方 68 件・タイプ 8 件', [FORMULAS.length, Object.keys(TYPE_DEFS).length], [68, 8]);
eq('設問版', QUESTIONNAIRE.version, '2026-10-25-v3');

// ---- 主訴カテゴリーと具体的な主訴（改修計画 §4） ----
eq('大カテゴリー A〜H', CATEGORIES.map((c) => `${c.id}:${c.name}`), ['A:疲れ・体力・全身の不調', 'B:胃腸・便通', 'C:肌', 'D:髪・頭皮', 'E:睡眠・こころ', 'F:女性の健康', 'G:痛み・こり・しびれ', 'H:その他の体の不調']);
eq('K1 は複数選択・上限なし', [qById('K1').type, qById('K1').max ?? null], ['multi', null]);
eq('肌の主訴は改修指示の8項目', texts('K_C'), ['顔や上半身のほてり・熱感', 'ニキビ', '肌の乾燥', '肌のかゆみ', '湿疹・肌荒れ', '肌のくすみ', 'シミ・色素沈着', '肝斑']);
eq('肌と髪を混ぜない', [texts('K_C').some((t) => /髪|頭皮|抜け毛/.test(t)), texts('K_D').some((t) => /ニキビ|シミ|肌の/.test(t))], [false, false]);
eq('自由記入の「その他」の主訴はない', COMPLAINTS.some((c) => /その他/.test(c.name)), false);
eq('年齢による見た目（たるみ等）の主訴はない', COMPLAINTS.some((c) => /たるみ|ほうれい線|シワ|毛穴/.test(c.name)), false);
{
  const a = { A1: ['A1-1'], K1: ['K1-A', 'K1-C'], K_A: ['KA-hot_upper', 'KA-fatigue'], K_C: ['KC-hot_upper'] };
  eq('同じ主訴を2つのカテゴリーで選んでも主訴は1つ', complaintsOf(a), ['fatigue', 'hot_upper']);
  eq('主訴が2つ以上なら KM で決める', primaryOf({ ...a, KM: ['KM-hot_upper'] }), 'hot_upper');
  eq('主訴が1つならそれがいちばん改善したい主訴', primaryOf({ K1: ['K1-G'], K_G: ['KG-headache'] }), 'headache');
}

// ---- 全主訴で深掘りが出る・同じ所見を2回聞かない（改修指示 第2章 STEP4・3-1、フェーズ6） ----
const pick = (q, mode) => {
  const opts = q.options.filter((o) => !o.exclusive && !o.urgent);
  if (q.section === 'primary' || q.section === 'basic' || q.section === 'category' || q.section === 'complaint') return null;
  if (mode === 'all') return q.type === 'single' ? [opts[0]?.id] : opts.map((o) => o.id);
  const ex = q.options.find((o) => o.exclusive === (mode === 'none' ? 'none' : 'unknown')) ?? q.options.find((o) => o.exclusive);
  return [ex?.id ?? opts[0]?.id];
};
/** 主訴を1つ選び、ほかの設問はすべて mode で答えて最後まで walk する */
function simulate(cid, sex, mode) {
  const c = complaintById(cid);
  const cat = c.categories[0];
  const a = { A1: [sex === 'female' ? 'A1-1' : 'A1-2'], A2: ['A2-3'], K1: [`K1-${cat}`], [`K_${cat}`]: [`K${cat}-${cid}`] };
  if (sex === 'female') { a.A3 = ['A3-regular']; a.A3P = ['A3P-no']; }
  for (let i = 0; i < 80; i++) {
    const w = walk(a);
    const n = firstUnansweredStep(w.steps);
    if (n > w.steps.length) return { a, w };
    const st = w.steps[n - 1];
    const ids = pick(st.q, mode) ?? [st.q.options[0].id];
    a[st.q.id] = normalizeAnswer(st.q, [...ids, ...(st.q.sub ? [st.q.sub.options[0].id] : [])]);
  }
  throw new Error(`walk が終わらない: ${cid}`);
}
{
  const noDetail = [];
  const repeats = [];
  for (const c of COMPLAINTS) {
    for (const sex of c.femaleOnly ? ['female'] : ['female', 'male']) {
      for (const mode of ['all', 'none', 'unknown']) {
        const { w } = simulate(c.id, sex, mode);
        if (mode === 'all' && !w.steps.some((s) => s.q.section === 'detail' && s.q.template === c.detail)) noDetail.push(`${c.id}/${sex}`);
        const seen = new Map();
        for (const s of w.steps) {
          // 主訴の一覧は「気になるもの」を選ぶ画面なので、選ばなかった主訴は聞いたことにしない（なしにもしない）
          const shown = s.q.section === 'complaint' ? s.q.options.filter((o) => s.ids.includes(o.id)) : s.q.options;
          for (const o of shown) for (const f of o.findings ?? []) {
            if (seen.has(f) && seen.get(f) !== s.q.id) repeats.push(`${c.id}/${sex}/${mode}: ${f}（${seen.get(f)}→${s.q.id}）`);
            if (!seen.has(f)) seen.set(f, s.q.id);
          }
        }
      }
    }
  }
  eq(`すべての主訴（${COMPLAINTS.length}件）でいちばん改善したい主訴の深掘りが出る`, noDetail, []);
  eq('どの主訴・どの答え方でも、同じ所見を2つの設問で聞かない', repeats.slice(0, 5), []);
}
{
  // 疲れやすい（主訴）→ 深掘りで食欲がない → 共通問診 B1・B5 に出さない
  const a = { A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-A'], K_A: ['KA-fatigue'], Sfatigue1: ['Sfatigue1-poor_appetite'] };
  const w = walk(a);
  const t = (id) => w.steps.find((s) => s.q.id === id)?.q.options.map((o) => o.text) ?? [];
  eq('主訴「疲れやすい」は B1 に出さない（回答の引き継ぎ）', t('B1').includes('疲れやすい'), false);
  eq('深掘りで答えた「食欲がない」は B5 に出さない', t('B5').includes('食欲がない'), false);
  eq('深掘りで選ばなかった「食後に眠くなる」も B5 に出さない（なしとして引き継ぐ）', t('B5').includes('食後に眠くなる'), false);
  eq('主訴の所見は「あり」として保持', w.state.get('fatigue_easy')?.status, 'present');
  eq('未質問の所見は「なし」にしない（状態なし）', w.state.has('night_agitation'), false);
}

// ---- 改修指示 4-1〜4-8・第5章 の個別修正 ----
const patientTexts = QUESTIONS.filter((x) => ['constitution', 'lifestyle', 'safety', 'basic'].includes(x.section)).flatMap((x) => x.options.map((o) => ({ q: x.id, t: o.text })));
eq('4-1 飲酒は D4「お酒を週3回以上飲む」に一本化（体質・生活習慣で1か所）', patientTexts.filter((x) => x.t.includes('お酒')).map((x) => `${x.q}:${x.t}`), ['D4:お酒を週3回以上飲む']);
eq('4-1 D1「辛いものをよく食べる」', texts('D1').includes('辛いものをよく食べる') && !texts('D1').some((t) => t.includes('お酒')), true);
eq('4-2「食欲がない」と「少量で満腹になる」は別の選択肢', ['食欲がない', '少量で満腹になる'].every((t) => texts('B5').includes(t)) && !texts('B5').some((t) => t.includes('食が細')), true);
eq('4-3「食事を抜くことが多い」（少食を含めない）', texts('D1').includes('食事を抜くことが多い') && !texts('D1').some((t) => t.includes('少食')), true);
const allOpts = QUESTIONS.flatMap((x) => x.options.map((o) => ({ q: x, o })));
eq('4-4「冷えると体調が悪くなる」はない', allOpts.some(({ o }) => /冷えると体調が悪/.test(o.text)), false);
eq('4-4「温めると楽になる」は症状の深掘りにだけ置く', allOpts.filter(({ o }) => o.text.includes('温めると') || o.text.includes('温かいものをとると楽')).every(({ q }) => q.section === 'detail'), true);
eq('4-5 痛みの性質（刺す・張る痛み）を全員向けに聞かない', allOpts.filter(({ o }) => /(刺す|張る)ような痛み|刺すように|張るように/.test(o.text)).every(({ q }) => q.section === 'detail'), true);
eq('4-6 発症時期・頻度の質問はない', QUESTIONS.some((x) => /いつ頃から|いつごろから|どれくらいの頻度|どれくらい続いて/.test(x.title)), false);
eq('4-7「日常生活への影響」の質問はない', QUESTIONS.some((x) => x.title.includes('日常生活') || x.options.some((o) => o.text.includes('日常生活'))), false);
eq('4-8 顔色はイラストの設問 F1 にだけある', allOpts.filter(({ o }) => /顔色/.test(o.text)).map(({ q }) => q.id).filter((id, i, a) => a.indexOf(id) === i), ['F1']);
eq('F1 はいただいた6種のイラスト', qById('F1').options.map((o) => o.image?.split('/').pop()), ['normal.webp', 'pale.webp', 'dark.webp', 'red.webp', 'bluish.webp', 'unknown.webp']);
eq('3-5「体力には自信がある」はない', allOpts.some(({ o }) => o.text.includes('体力がある') || o.text.includes('体力には自信')), false);
eq('第12章 舌は患者に聞かない（薬剤師の設問にだけある）', [QUESTIONS.some((x) => x.options.some((o) => o.image?.includes('/tongue/'))), STAFF_QUESTIONS.find((x) => x.id === 'X_tongue').options.filter((o) => o.image).length], [false, 8]);
eq('5-1 患者向けの選択肢に受診勧奨フラグ（refer/consult）がない', allOpts.some(({ o }) => o.flags?.some((f) => f === 'refer' || f === 'consult')), false);
eq('5-5 直ちに対応の選択肢は主訴の深掘りの中だけ', allOpts.filter(({ o }) => o.urgent).every(({ q }) => q.section === 'detail'), true);
eq('5-6 体重減少・微熱を共通の質問で聞かない', allOpts.filter(({ q }) => q.section !== 'detail').some(({ o }) => /体重が減|微熱/.test(o.text)), false);
eq('自由記述の設問・選択肢はない', allOpts.some(({ o }) => o.freeText) || QUESTIONS.some((x) => x.type === 'text'), false);

// ---- 安全確認タグ・直ちに対応 ----
{
  const a = { A1: ['A1-2'], A2: ['A2-6'], K1: ['K1-G'], K_G: ['KG-headache'], Sheadache3: ['Sheadache3-urgent_neuro'] };
  const w = walk(a);
  const tags = safetyTags(w);
  eq('主訴「頭痛」に安全確認タグ', tags.some((t) => t.id === 'headache' && t.checks.includes('今までにない激しさか')), true);
  eq('急性の神経症状は直ちに対応', [isUrgent(w), tags.find((t) => t.id === 'neuro')?.urgent], [true, true]);
  eq('タグは証のスコアに影響しない', JSON.stringify(score(walk({ ...a, Sheadache3: ['Sheadache3-none'] }).state).pct) === JSON.stringify(score(w.state).pct), true);
  const w2 = walk({ ...a, Sheadache3: ['Sheadache3-none'] });
  eq('急性の選択肢を選ばなければ直ちに対応ではない', isUrgent(w2), false);
}

// ---- 暫定スコア：同じ所見・意味の近い所見は1回分（改修指示 8-2） ----
{
  const one = { A1: ['A1-2'], K1: ['K1-G'], K_G: ['KG-stiff_shoulder'], Sstiff_shoulder1: ['Sstiff_shoulder1-shoulder_warm_relief'] };
  const w1 = walk(one);
  const s1 = score(w1.state);
  // 同じ group（cold_sensitive）の別の所見を足しても陽虚の点は増えない
  w1.state.set('cold_warm_relief', { status: 'present', source: 'patient', question: 'test', section: 'detail' });
  const s2 = score(w1.state);
  eq('「温めると楽になる」が2か所でも陽虚は1回分', [s1.raw.yang_def, s2.raw.yang_def], [s1.raw.yang_def, s1.raw.yang_def]);
  eq('未質問・わからないは理論最大点に入れない', score(walk({ A1: ['A1-2'] }).state).max.qi_def, 0);
}

// ---- 安全フラグと漢方薬の選定 ----
{
  const a = {
    A1: ['A1-1'], A2: ['A2-7'], A3: ['A3-post'], K1: ['K1-A'], K_A: ['KA-fatigue'], Sfatigue1: ['Sfatigue1-poor_appetite', 'Sfatigue1-sob_exertion'],
    C1: ['C1-kampo', 'C1-bp'], C1K: ['C1K-F01'], C2: ['C2-1'], C3: ['C3-none'], C4: ['C4-yes'], C4K: ['C4K-F01'], C4S: ['C4S-rash'],
  };
  const c = computeSession({ answers: a });
  eq('閉経なら妊娠・授乳の設問を出さない', c.w.steps.some((s) => s.q.id === 'A3P'), false);
  eq('安全フラグ：服用中の薬・漢方・高血圧・副作用歴', ['meds', 'kampo_current', 'hypertension', 'adverse_kampo'].map((k) => c.safetyFlags.some((f) => f.code === k)), [true, true, true, true]);
  const sel = selectionOf({ answers: a }, c);
  const g = sel.groups[0];
  eq('主訴「疲れやすい」の候補に補中益気湯', g.candidates.some((x) => x.name === '補中益気湯'), true);
  const f01 = g.candidates.find((x) => x.code === 'F01');
  eq('副作用歴の漢方薬は要確認（薬剤師が判断）', f01.safety.status !== 'ok' && f01.safety.check[0].includes('体調を崩したことがある'), true);
  eq('甘草を含む候補は服用中の漢方との重複を確認', g.candidates.filter((x) => x.formula.cautionHerbs.includes('甘草')).every((x) => x.safety.check.some((t) => t.includes('甘草の重複'))), true);
  eq('候補はすべて主訴の効能に当たる（体質だけで足さない）', g.candidates.every((x) => x.matched.length > 0), true);
  // 薬剤師の観察（舌）
  const w = walk(a);
  applyStaffAnswers(w.state, { X_tongue: ['X_tongue-tongue_p1'] });
  eq('薬剤師の舌所見を所見に統合', w.state.get('tongue_p1')?.source, 'staff');
}
{
  const a = { A1: ['A1-1'], A3: ['A3-regular'], A3P: ['A3P-no'], K1: ['K1-C'], K_C: ['KC-acne'], Sacne1: ['Sacne1-acne_red', 'Sacne1-acne_pus'], C1: ['C1-none'], C2: ['C2-0'], C3: ['C3-none'], C4: ['C4-no'] };
  const c = computeSession({ answers: a });
  const names = selectionOf({ answers: a }, c).groups[0].candidates.map((x) => x.name);
  const ACNE_POOL = ['清上防風湯', '荊芥連翹湯', '桂枝茯苓丸加薏苡仁', '桂枝茯苓丸', '防風通聖散', '十味敗毒湯', '排膿散及湯'];
  eq('ニキビの候補はニキビ・化膿の効能を持つものだけ', names.length > 0 && names.every((n) => ACNE_POOL.includes(n)), true);
}

// ---- 患者向け画面に漢方薬・点数を出さない（ソースの静的確認） ----
{
  const dir = 'src/pages/kampo/check';
  const files = [];
  const walkDir = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walkDir(p); else files.push(p); } };
  walkDir(dir);
  const bad = files.filter((f) => /recommend|FORMULAS|RadarChart/.test(fs.readFileSync(f, 'utf8')));
  eq('患者向け画面（check/）は漢方薬の選定・レーダーを読み込まない', bad, []);
}

// ---- フローの細部 ----
eq('「特にない」とほかを同時に選んだらほかを残す', normalizeAnswer(qById('B1'), ['B1-none', 'B1-sob_exertion']), ['B1-sob_exertion']);
eq('単一選択は1つだけ', normalizeAnswer(qById('A2'), ['A2-1', 'A2-2']), ['A2-1']);
eq('生活習慣の一言（就寝が遅い → 血虚）', personalTips({ D2: ['D2-1', 'D2s-2'] }, 'blood_def').length, 1);
eq('男性にはカテゴリー「女性の健康」を出さない', walk({ A1: ['A1-2'] }).steps.find((s) => s.q.id === 'K1').q.options.some((o) => o.text === '女性の健康'), false);
eq('むくみの設問は関連する所見があるときだけ', [walk({ A1: ['A1-2'], K1: ['K1-A'], K_A: ['KA-fatigue'] }).steps.some((s) => s.q.id === 'B7'), walk({ A1: ['A1-2'], K1: ['K1-H'], K_H: ['KH-edema'] }).steps.some((s) => s.q.id === 'B7')], [false, true]);

// ---- 旧版セッション ----
eq('旧版（2026-10-24b・v2）は再計算しない', [isLegacy({ questionnaireVersion: '2026-10-24b' }), isLegacy({ questionnaireVersion: 'v2-draft-2026-10-25' }), isLegacy({ questionnaireVersion: QUESTIONNAIRE.version })], [true, true, false]);
eq('旧版の文言を引ける', [legacyOptionText('2026-10-24b', 'KF-easily'), legacyOptionText('2026-10-24b', 'A4s-3')], ['少し動くだけで疲れる', '大きい']);

console.log(fail ? `\n${fail} 件 NG` : '\nすべて OK');
process.exit(fail ? 1 : 0);
