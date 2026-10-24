// 漢方体質チェック（/kampo/）のロジック回帰テスト。
//   node --experimental-strip-types scripts/kampo-test.mjs
// マスタ検証・スコアリング（仕様書 第6節の検算例）・安全確認・二段階の漢方薬選定・設問フローを確認する。
import { QUESTIONS, TYPES, FORMULAS, validateMasters, TYPE_DEFS } from '../src/lib/kampo/masters.ts';
import { score, classify, zero } from '../src/lib/kampo/scoring.ts';
import { safetyFlags } from '../src/lib/kampo/safety.ts';
import { selectFormulas, customerPicks, complaintGroups, buildReasons } from '../src/lib/kampo/recommend.ts';
import { visibleQuestions, normalizeAnswer, isAnswered, firstUnansweredStep, personalTips, sexFromAnswers } from '../src/lib/kampo/flow.ts';
import fs from 'node:fs';

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'OK ' : 'NG '} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const q = (id) => QUESTIONS.find((x) => x.id === id);

// ---- マスタ検証 ----
const qj = JSON.parse(fs.readFileSync('src/data/kampo/questions.json', 'utf8'));
const tj = JSON.parse(fs.readFileSync('src/data/kampo/types.json', 'utf8'));
const fj = JSON.parse(fs.readFileSync('src/data/kampo/formulas.json', 'utf8'));
eq('マスタ検証 合格', validateMasters(qj, tj, fj), []);
eq('設問数 40（基本27＋主訴の詳細13）', QUESTIONS.length, 40);
eq('B設問に none あり', QUESTIONS.filter((x) => x.block === 'B').every((x) => x.options.some((o) => o.flags?.includes('none'))), true);
{
  const broken = JSON.parse(JSON.stringify(qj));
  broken.questions.find((x) => x.id === 'B1').options.pop();
  eq('none を外すと検証エラー', validateMasters(broken, tj, fj).some((e) => e.includes('どれもあてはまらない')), true);
  const dup = JSON.parse(JSON.stringify(qj));
  dup.questions[1].options[0].id = 'A1-1';
  eq('選択肢ID重複を検出', validateMasters(dup, tj, fj).some((e) => e.includes('重複')), true);
  const badF = JSON.parse(JSON.stringify(fj));
  badF.formulas[0].signs.push('B99-1');
  eq('存在しない signs を検出', validateMasters(qj, tj, badF).some((e) => e.includes('B99-1')), true);
  const badT = JSON.parse(JSON.stringify(fj));
  badT.formulas[0].indications[0].term = '存在しない語';
  eq('効能の語が efficacy 本文にないと検出', validateMasters(qj, tj, badT).some((e) => e.includes('存在しない語')), true);
  const badS = JSON.parse(JSON.stringify(fj));
  badS.formulas[0].indications[0].symptom = 'unknown_symptom';
  eq('未定義の症状コードを検出', validateMasters(qj, tj, badS).some((e) => e.includes('unknown_symptom')), true);
}
eq('処方 68 件', FORMULAS.length, 68);
eq('全処方に承認効能・使用目標・漢方の考え方', FORMULAS.every((f) => f.efficacy && f.useTarget && f.action && f.indications.length > 0), true);
eq('タイプ 8 件', Object.keys(TYPE_DEFS).length, 8);

// ---- スコアリング ----
const noneAll = Object.fromEntries(QUESTIONS.filter((x) => x.scored).map((x) => [x.id, [x.options.find((o) => o.flags?.includes('none')).id]]));
{
  const r = score(noneAll, QUESTIONS, { sex: 'female', tongueMode: 'self' });
  eq('全問 none → 全タイプ 0%', TYPES.every((t) => r.pct[t] === 0), true);
  eq('全問 none → isBalanced', r.isBalanced, true);
  eq('全問 none → mainTypes 空', r.mainTypes, []);
  eq('全問 none → 指数 0（ゼロ除算なし）', [r.defExcIndex, r.thermalIndex], [0, 0]);
}
{
  const ids = ['B1-1', 'B1-2', 'B2-1', 'B3-1', 'B4-1', 'B4-2', 'B5-1', 'B6-1', 'B7-1', 'B8-1', 'B9-1', 'B10-1', 'B12-1', 'B13-1', 'D1-1'];
  const answers = {};
  for (const id of ids) (answers[id.split('-')[0]] ??= []).push(id);
  const r = score(answers, QUESTIONS, { sex: 'male', tongueMode: 'self' });
  eq('気虚を全問で選ぶ → qi_def 100%', r.pct.qi_def, 100);
  eq('気虚 → mainTypes', r.mainTypes, ['qi_def']);
  eq('気虚 → defExcLabel def', r.defExcLabel, 'def');
  eq('気虚 → thermalLabel cold', r.thermalLabel, 'cold');
  const rf = score(answers, QUESTIONS, { sex: 'female', tongueMode: 'self' });
  eq('女性だと B11 の分だけ max が増える', rf.max.qi_def, r.max.qi_def + 1);
}
{
  const pct = { ...zero(), blood_def: 60, qi_stag: 100, blood_stasis: 80, yin_def: 100 };
  const c = classify(pct);
  eq('参考例 mainTypes', c.mainTypes, ['qi_stag', 'yin_def']);
  eq('参考例 subTypes', c.subTypes, ['blood_stasis', 'blood_def']);
  eq('参考例 defExcIndex +0.06 mid', [c.defExcIndex, c.defExcLabel], [0.06, 'mid']);
  eq('参考例 thermalIndex +1 hot', [c.thermalIndex, c.thermalLabel], [1, 'hot']);
}
{
  const r = score({}, QUESTIONS, { sex: 'male', tongueMode: 'staff' });
  const b11 = q('B11').options.reduce((s, o) => s + (o.weights?.qi_def ?? 0), 0);
  const b13 = q('B13').options.reduce((s, o) => s + (o.weights?.qi_def ?? 0), 0);
  const all = score({}, QUESTIONS, { sex: 'female', tongueMode: 'self' });
  eq('男性・スタッフ舌・未入力 → B11/B13 が max に入らない', all.max.qi_def - r.max.qi_def, b11 + b13);
  const r2 = score({}, QUESTIONS, { sex: 'male', tongueMode: 'staff', tongueOverride: ['B13-1'] });
  eq('スタッフ舌所見を入れると B13 が加算される', [r2.raw.qi_def, r2.max.qi_def - r.max.qi_def], [1, b13]);
}
{
  const base = score({}, QUESTIONS, { sex: 'female', tongueMode: 'self' });
  const r = score({ B11: ['B11-9'] }, QUESTIONS, { sex: 'female', tongueMode: 'self' });
  eq('B11 閉経 → max から B11 を除く', base.max.qi_def - r.max.qi_def, 1);
  eq('B11 閉経 → raw は増えない', TYPES.every((t) => r.raw[t] === 0), true);
}
{
  const r = score({ B1: ['B1-3'] }, QUESTIONS, { sex: 'male', tongueMode: 'self' });
  eq('2タイプにまたがる選択肢 raw 0.5 ずつ', [r.raw.blood_def, r.raw.yin_def], [0.5, 0.5]);
  const b1 = q('B1').options.reduce((s, o) => s + (o.weights?.blood_def ?? 0), 0);
  eq('max にも 0.5 が積まれている', b1, 0.5);
}
{
  // セルフ回答があっても薬剤師の所見が優先
  const r = score({ B13: ['B13-8'] }, QUESTIONS, { sex: 'male', tongueMode: 'self', tongueOverride: ['B13-1'] });
  eq('舌の上書きはセルフ回答より優先', [r.raw.qi_def, r.raw.yang_exc], [1, 0]);
}

// ---- 安全確認 ----
{
  eq('安全：何もなし', safetyFlags({ C1: ['C1-2'], C2: ['C2-0'], C3: ['C3-4'], C4: ['C4-2'], A4: ['A4-3', 'A4s-1'] }), []);
  const f = safetyFlags({ C1: ['C1-1'], C2: ['C2-1', 'C2-8'], C3: ['C3-3'], C4: ['C4-1'], A4: ['A4-4', 'A4s-3'] }, { 'C1-1': 'インターフェロン注射、ロキソニン', 'C4-1': '卵' });
  eq('安全：コード一覧（refer→warn→info 順）', f.map((x) => x.code), ['severe', 'meds', 'interferon', 'hypertension', 'gi_weak', 'pregnancy', 'allergy']);
  eq('安全：薬名がそのまま detail', f.find((x) => x.code === 'meds').detail, 'インターフェロン注射、ロキソニン');
  eq('安全：影響大でも1〜2週間は severe にしない', safetyFlags({ A4: ['A4-2', 'A4s-3'] }).map((x) => x.code), []);
  eq('安全：急性は info', safetyFlags({ A4: ['A4-1', 'A4s-1'] }).map((x) => [x.code, x.level]), [['acute', 'info']]);
  eq('安全：舌の重症サイン（セルフ）', safetyFlags({ B13: ['B13-10'] }).map((x) => x.code), ['tongue_refer']);
  eq('安全：舌の重症サイン（スタッフ入力）', safetyFlags({}, {}, ['B13-10']).map((x) => x.code), ['tongue_refer']);
  eq('安全：抑うつ・不眠が半年以上', safetyFlags({ B9: ['B9-2'], B8: ['B8-3'], A4: ['A4-5', 'A4s-2'] }).map((x) => x.code), ['long_mood']);
  eq('安全：抑うつ・不眠でも半年以内は出さない', safetyFlags({ B9: ['B9-2'], B8: ['B8-3'], A4: ['A4-4', 'A4s-2'] }).map((x) => x.code), []);
  eq('安全：軟便＋食が細い → gi_weak', safetyFlags({ B6: ['B6-1'], B5: ['B5-1'] }).map((x) => x.code), ['gi_weak']);
  eq('安全：授乳は info', safetyFlags({ C3: ['C3-2'] }).map((x) => [x.code, x.level]), [['lactation', 'info']]);
}

// ---- 五臓・熱の種類 ----
{
  const r = score({ B5: ['B5-1'], B6: ['B6-1'] }, QUESTIONS, { sex: 'male', tongueMode: 'self' });
  eq('五臓：胃腸の回答で脾が上がる', r.organPct.spleen > 0 && r.organPct.liver === 0, true);
  const h1 = classify({ ...zero(), yang_exc: 80, yin_def: 20 });
  eq('熱寄り・陽盛が主 → 実熱', [h1.thermalLabel, h1.heatKind], ['hot', 'excess']);
  const h2 = classify({ ...zero(), yang_exc: 20, yin_def: 80 });
  eq('熱寄り・陰虚が主 → 虚熱', [h2.thermalLabel, h2.heatKind], ['hot', 'deficient']);
}

// ---- 二段階の漢方薬選定 ----
const mk = (ids) => { const a = {}; for (const id of ids) { const q = id.replace(/-[^-]+$/, ''); (a[q] ??= []).push(id); } return a; };
const BASE = ['A1-1', 'A2-3', 'A4-4', 'A4s-2', 'A5-2', 'C1-2', 'C2-0', 'C3-4', 'C4-2'];
const sel = (ids, texts = {}) => {
  const a = mk([...BASE.filter((b) => !ids.some((x) => x.split('-')[0] === b.split('-')[0])), ...ids]);
  const r = score(a, QUESTIONS, { sex: 'female', tongueMode: 'self' });
  const fl = safetyFlags(a, texts);
  return { a, r, fl, s: selectFormulas(r, a, texts, fl, FORMULAS) };
};
const HEAT = ['B1-9', 'B2-10', 'B3-9', 'B5-9', 'B6-9', 'B9-9', 'B8-8', 'B13-8', 'D1-6', 'B4-7', 'B12-8'];
const STASIS = ['B1-5', 'B2-5', 'B2-6', 'B3-4', 'B10-4', 'B11-4', 'B12-4', 'B7-3', 'B9-5', 'B13-4', 'B6-4'];
const QIDEF = ['B1-1', 'B1-2', 'B2-1', 'B3-1', 'B4-1', 'B5-1', 'B6-1', 'B8-1', 'B9-1', 'B10-1', 'B12-1', 'B13-1', 'D1-1', 'B3-8'];
const ACNE_POOL = ['清上防風湯', '荊芥連翹湯', '桂枝茯苓丸加薏苡仁', '桂枝茯苓丸', '防風通聖散'];
{
  // STEP 1：主訴で候補群を決める（体質で無関係な漢方薬を足さない）
  const { s } = sel(['A3-3', 'A3c-1', ...QIDEF]);
  const pool = s.groups[0].candidates.map((c) => c.name);
  eq('STEP1 ニキビの候補群は効能に「にきび」を持つものだけ', pool.every((n) => ACNE_POOL.includes(n)) && ACNE_POOL.every((n) => pool.includes(n)), true);
  eq('STEP1 気虚が強くても補中益気湯を候補に足さない', pool.includes('補中益気湯'), false);
  // 合う候補がなければ推薦しない
  eq('冷え・虚証の人のニキビ → 体質に合う候補なし（推薦しない）', [s.groups[0].outcome, s.groups[0].pick?.name], ['no_fit', undefined]);
  eq('不適合の理由（寒熱が逆）を記録', s.groups[0].candidates.find((c) => c.name === '清上防風湯').mismatches.some((m) => m.axis === '寒熱'), true);
}
{
  // STEP 2〜3：同じニキビでも体質で選ぶ漢方薬が変わる
  eq('炎症・赤み＋体力あり（実熱）→ 清上防風湯', sel(['A3-3', 'A3c-1', ...HEAT]).s.groups[0].pick?.name, '清上防風湯');
  eq('慢性に繰り返す・皮膚が浅黒い → 荊芥連翹湯', sel(['A3-3', 'A3c-2', 'A4-5', 'B2-5', 'B4-3', 'B12-5', 'B2-10', 'B3-9', 'B9-3', 'B5-10']).s.groups[0].pick?.name, '荊芥連翹湯');
  const st = sel(['A3-3', 'A3c-3', 'A3-10', 'A3j-2', ...STASIS]).s;
  eq('月経不順・のぼせを伴う（瘀血）→ 桂枝茯苓丸加薏苡仁', st.groups.map((g) => g.pick?.name), ['桂枝茯苓丸加薏苡仁', '桂枝茯苓丸加薏苡仁']);
  eq('2つの主訴を1つでカバーする漢方薬は1枚にまとめる', customerPicks(st, sel(['A3-3', 'A3c-3', 'A3-10', 'A3j-2', ...STASIS]).r).picks.length, 1);
}
{
  // 条件つきの効能（高血圧や肥満に伴う便秘）は条件を満たすときだけ候補
  const no = sel(['A3-5', 'A3e-1', ...HEAT]).s.groups[0].candidates.map((c) => c.name);
  const yes = sel(['A3-5', 'A3e-1', 'A3-11', 'A3k-1', ...HEAT]).s.groups[0].candidates.map((c) => c.name);
  eq('防風通聖散の「肥満に伴う便秘」は肥満の主訴がないと候補にしない', [no.includes('防風通聖散'), yes.includes('防風通聖散')], [false, true]);
}
{
  // STEP 4：安全性
  const preg = sel(['A3-3', 'A3c-3', ...STASIS, 'C3-1']).s.groups[0];
  eq('妊娠中 → 桂枝茯苓丸系は除外され、推薦されない', [preg.candidates.find((c) => c.name === '桂枝茯苓丸加薏苡仁').safety.status, ['桂枝茯苓丸', '桂枝茯苓丸加薏苡仁'].includes(preg.pick?.name)], ['excluded', false]);
  const meds = sel(['A3-1', 'A3a-1', ...QIDEF, 'C1-1'], { 'C1-1': '' }).s.groups[0];
  eq('服用薬の名前が未記入 → 推薦を確定せず要確認', [meds.outcome, meds.pick?.name, meds.pick?.safety.check.some((x) => x.includes('情報不足'))], ['pick_check', '補中益気湯', true]);
  const hyp = sel(['A3-1', 'A3a-1', ...QIDEF, 'C2-1']).s.groups[0];
  eq('高血圧 × 甘草 → 要確認（理由つき）', hyp.pick?.safety.check.some((x) => x.startsWith('甘草を含むため、高血圧')), true);
  const ok = sel(['A3-1', 'A3a-1', ...QIDEF]).s.groups[0];
  eq('安全上の問題がなければ確定の推薦', [ok.outcome, ok.pick?.name], ['pick', '補中益気湯']);
  const refer = sel(['A3-1', 'A3a-1', ...QIDEF, 'A4-5', 'A4s-3']);
  eq('受診勧奨 → 来店客向けの推薦は出さない', [refer.s.refer, customerPicks(refer.s, refer.r).picks.length], [true, 0]);
}
{
  // STEP 5：推薦理由の順序と内容
  const x = sel(['A3-3', 'A3c-1', ...HEAT]);
  const g = x.s.groups[0];
  const rs = buildReasons(g, g.pick, x.r, { forCustomer: true });
  eq('理由① 主訴：選んだ症状と承認効能の語', rs.complaint.includes('赤く腫れる・化膿しやすいニキビ') && rs.complaint.includes('「にきび」') && rs.complaint.includes('効能・効果'), true);
  eq('理由② 体質：気血水・寒熱・虚実を実際の点数で', ['【気血水】', '【寒熱】', '【虚実】'].every((a) => rs.constitution.some((c) => c.startsWith(a))) && rs.constitution.some((c) => /陽盛 \d+点/.test(c)), true);
  eq('理由② 使用目標と漢方の考え方は別の欄', [rs.useTarget.startsWith('体力中等度以上'), rs.action.includes('清熱')], [true, true]);
  eq('理由③ 他の候補との比較（便秘があるので麻子仁丸も候補＝6種類）', rs.comparison.length >= 2 && rs.comparison[0].includes('候補6種類') && rs.comparison.some((c) => c.startsWith('荊芥連翹湯')), true);
  eq('理由④ 服用前の注意（含まれる生薬）', rs.cautions.some((c) => c.startsWith('山梔子を含みます')) && rs.cautions.some((c) => c.startsWith('黄芩を含みます')), true);
}
{
  // 主訴の詳細なし・候補なし・その他
  const nd = sel(['A3-3', 'A3c-0', ...HEAT]).s.groups[0];
  eq('詳細で「このなかにはない」→ 候補を絞らない', nd.outcome, 'no_detail');
  const hair = sel(['A3-3', 'A3c-8', ...HEAT]).s.groups[0];
  eq('抜け毛・白髪 → 承認効能に該当なし（候補なし）', hair.outcome, 'no_pool');
  eq('主訴グループは A3 の選択順', complaintGroups(mk(['A3-10', 'A3-3', 'A3c-1', 'A3j-1'])).map((g) => g.key), ['A3-3', 'A3-10']);
}

// ---- 設問フロー ----
eq('表示設問：女性・セルフ 27', visibleQuestions({ A1: ['A1-1'] }, 'self').length, 27);
eq('表示設問：男性・スタッフ 24', visibleQuestions({ A1: ['A1-2'] }, 'staff').length, 24);
eq('表示設問：性別未回答・セルフ 25（B11・C3 なし）', visibleQuestions({}, 'self').length, 25);
eq('主訴「肌・髪」を選ぶと詳細 A3c が出る', visibleQuestions({ A1: ['A1-1'], A3: ['A3-3'] }, 'self').map((q) => q.id).includes('A3c'), true);
eq('主訴の詳細は A3 の直後', visibleQuestions({ A1: ['A1-1'], A3: ['A3-3', 'A3-7'] }, 'self').slice(2, 6).map((q) => q.id), ['A3', 'A3c', 'A3g', 'A4']);
eq('性別の読み取り', [sexFromAnswers({ A1: ['A1-1'] }), sexFromAnswers({ A1: ['A1-3'] }), sexFromAnswers({})], ['female', 'none', undefined]);
{
  const b1 = q('B1');
  eq('normalize: none があれば他を外す', normalizeAnswer(b1, ['B1-1', 'B1-0', 'B1-4'], {}).ids, ['B1-0']);
  eq('normalize: 不正IDを捨てる', normalizeAnswer(b1, ['B1-1', 'X-1', 'B2-2'], {}).ids, ['B1-1']);
  eq('normalize: A3 は最大3つ', normalizeAnswer(q('A3'), ['A3-1', 'A3-2', 'A3-3', 'A3-4'], {}).ids.length, 3);
  eq('normalize: 自由記入は選んだ選択肢だけ', normalizeAnswer(q('C1'), ['C1-1'], { 'C1-1': ' ロキソニン ', 'C1-2': 'x' }).texts, { 'C1-1': 'ロキソニン' });
  eq('normalize: single は1つ＋sub1つ', normalizeAnswer(q('A4'), ['A4-1', 'A4-2', 'A4s-2', 'A4s-3'], {}).ids, ['A4-1', 'A4s-2']);
  eq('normalize: text 型', normalizeAnswer(q('C5'), [], { C5: '補中益気湯を半年' }), { ids: [], texts: { C5: '補中益気湯を半年' } });
  eq('isAnswered: sub 必須', [isAnswered(q('A4'), ['A4-1'], {}), isAnswered(q('A4'), ['A4-1', 'A4s-1'], {})], [false, true]);
  eq('isAnswered: C5 は任意', isAnswered(q('C5'), undefined, {}), true);
  eq('isAnswered: multi 未選択', isAnswered(b1, [], {}), false);
  const vis = visibleQuestions({ A1: ['A1-2'] }, 'staff');
  eq('firstUnanswered: A1 だけ回答 → 2', firstUnansweredStep(vis, { A1: ['A1-2'] }, {}), 2);
}
eq('tips: 24時以降 × 血虚', personalTips({ D2: ['D2-2', 'D2s-2'] }, 'blood_def'), ['就寝時刻を23時に前倒しするだけで変化が出ます。']);
eq('tips: 該当なし', personalTips({ D2: ['D2-2', 'D2s-1'] }, 'blood_def'), []);

console.log(fail ? `\n${fail} 件失敗` : '\nすべて OK');
process.exit(fail ? 1 : 0);
