// 漢方体質チェック（/kampo/）のロジック回帰テスト。
//   node --experimental-strip-types scripts/kampo-test.mjs
// マスタ検証・スコアリング（仕様書 第6節の検算例）・安全確認・候補提示・設問フローを確認する。
import { QUESTIONS, TYPES, FORMULAS, validateMasters, TYPE_DEFS } from '../src/lib/kampo/masters.ts';
import { score, classify, zero } from '../src/lib/kampo/scoring.ts';
import { safetyFlags } from '../src/lib/kampo/safety.ts';
import { recommend, recommendForCustomer, conflictsOf, primaryType, defExcMatch, thermalMatch } from '../src/lib/kampo/recommend.ts';
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
eq('設問数 27', QUESTIONS.length, 27);
eq('B設問に none あり', QUESTIONS.filter((x) => x.block === 'B').every((x) => x.options.some((o) => o.flags?.includes('none'))), true);
{
  const broken = JSON.parse(JSON.stringify(qj));
  broken.questions.find((x) => x.id === 'B1').options.pop();
  eq('none を外すと検証エラー', validateMasters(broken, tj, fj).some((e) => e.includes('どれもあてはまらない')), true);
  const dup = JSON.parse(JSON.stringify(qj));
  dup.questions[1].options[0].id = 'A1-1';
  eq('選択肢ID重複を検出', validateMasters(dup, tj, fj).some((e) => e.includes('重複')), true);
  const badF = JSON.parse(JSON.stringify(fj));
  badF.formulas[0].keySigns.push('B99-1');
  eq('存在しない keySigns を検出', validateMasters(qj, tj, badF).some((e) => e.includes('B99-1')), true);
}
eq('処方 36 件', FORMULAS.length, 36);
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

// ---- 候補提示 ----
eq('虚実一致 +0.3', defExcMatch('def', 'def'), 0.3);
eq('虚実隣接 +0.1', [defExcMatch('def', 'mid'), defExcMatch('mid', 'exc')], [0.1, 0.1]);
eq('虚実逆 -0.3', defExcMatch('def', 'exc'), -0.3);
eq('寒熱 warm×cold +0.2', thermalMatch('warm', 'cold'), 0.2);
eq('寒熱 warm×hot -0.3', thermalMatch('warm', 'hot'), -0.3);
eq('寒熱 neutral 0', [thermalMatch('neutral', 'hot'), thermalMatch('cool', 'neutral')], [0, 0]);
{
  const ids = ['B1-1', 'B1-2', 'B2-1', 'B3-1', 'B4-1', 'B4-2', 'B5-1', 'B6-1', 'B7-1', 'B8-1', 'B9-1', 'B10-1', 'B12-1', 'B13-1', 'D1-1'];
  const answers = { A3: ['A3-1', 'A3-12'] };
  for (const id of ids) (answers[id.split('-')[0]] ??= []).push(id);
  const r = score(answers, QUESTIONS, { sex: 'male', tongueMode: 'self' });
  const c = recommend(r, answers, [], FORMULAS);
  eq('気虚 → 候補3件', c.length, 3);
  eq('気虚＋疲れ → 1位 補中益気湯', c[0].name, '補中益気湯');
  eq('根拠に主体質とキー所見', c[0].reasons.some((x) => x.includes('気虚 100%（主体質）')) && c[0].reasons.some((x) => x.startsWith('所見:')), true);
}
{
  // 瘀血＋妊娠 → 桂枝茯苓丸は残るが警告つき・スコア -1.0
  const answers = { B1: ['B1-5'], B2: ['B2-5'], B3: ['B3-4'], B10: ['B10-4'], B11: ['B11-4'], C3: ['C3-1'], A3: ['A3-10'] };
  const r = score(answers, QUESTIONS, { sex: 'female', tongueMode: 'staff' });
  const flags = safetyFlags(answers);
  const all = recommend(r, answers, flags, FORMULAS, undefined, 36);
  const kb = all.find((x) => x.name === '桂枝茯苓丸');
  eq('妊娠 → 桂枝茯苓丸に警告', kb.warnings, ['pregnancy']);
  const noFlag = recommend(r, answers, [], FORMULAS, undefined, 36).find((x) => x.name === '桂枝茯苓丸');
  eq('妊娠 → 桂枝茯苓丸のスコアが 1.0 下がる', Math.round((noFlag.score - kb.score) * 100) / 100, 1);
  eq('注意生薬 × フラグ（牡丹皮 — 妊娠）', kb.herbCautions.map((h) => `${h.herb}—${h.flag}`), ['牡丹皮—pregnancy', '桃仁—pregnancy']);
}
{
  // 高血圧で防風通聖散の甘草・麻黄に注意
  const flags = safetyFlags({ C2: ['C2-1'] });
  const r = score({ B1: ['B1-9'], B6: ['B6-9'] }, QUESTIONS, { sex: 'male', tongueMode: 'staff' });
  const c = recommend(r, { B1: ['B1-9'], B6: ['B6-9'] }, flags, FORMULAS, undefined, 36).find((x) => x.name === '防風通聖散');
  eq('高血圧 → 防風通聖散に注意生薬', c.herbCautions.map((h) => h.herb).sort(), ['甘草', '附子', '麻黄'].filter((h) => ['大黄', '麻黄', '甘草', '山梔子'].includes(h)).sort());
  eq('高血圧 → 防風通聖散は禁忌警告', c.warnings, ['hypertension']);
}
{
  // 全問 none でもエラーにならず候補が出る
  const r = score(noneAll, QUESTIONS, { sex: 'female', tongueMode: 'self' });
  eq('バランス良好でも候補3件（エラーなし）', recommend(r, noneAll, [], FORMULAS).length, 3);
}

// ---- 来店客向けのおすすめ（矛盾・警告なしのみ） ----
eq('全処方に来店客向け説明文', FORMULAS.every((f) => typeof f.description === 'string' && f.description.length >= 10), true);
{
  const r = score(noneAll, QUESTIONS, { sex: 'female', tongueMode: 'self' });
  eq('バランス良好 → 来店客向けは出さない', recommendForCustomer(r, noneAll, [], FORMULAS), []);
}
{
  const ids = ['B1-1', 'B1-2', 'B2-1', 'B3-1', 'B4-1', 'B4-2', 'B5-1', 'B6-1', 'B7-1', 'B8-1', 'B9-1', 'B10-1', 'B12-1', 'B13-1', 'D1-1'];
  const answers = { A3: ['A3-1'] };
  for (const id of ids) (answers[id.split('-')[0]] ??= []).push(id);
  const r = score(answers, QUESTIONS, { sex: 'male', tongueMode: 'self' });
  const picks = recommendForCustomer(r, answers, [], FORMULAS);
  eq('気虚 → 来店客向け 3件・1位 補中益気湯', [picks.length, picks[0]?.name], [3, '補中益気湯']);
  eq('来店客向けは主な対象タイプが主体質・副体質', picks.every((c) => [...r.mainTypes, ...r.subTypes].includes(primaryType(FORMULAS.find((f) => f.code === c.code)))), true);
  eq('来店客向けに矛盾・警告なし', picks.every((c) => c.conflicts.length === 0 && c.warnings.length === 0 && c.herbCautions.length === 0), true);
  eq('来店客向けの根拠文', picks[0].customerReason.includes('気虚（100点）') && picks[0].customerReason.includes('疲れ・だるさ') && picks[0].customerReason.includes('冷えを温める'), true);
  // 受診勧奨があれば出さない
  const flags = safetyFlags({ ...answers, A4: ['A4-5', 'A4s-3'] });
  eq('受診勧奨 → 来店客向けは出さない', recommendForCustomer(r, answers, flags, FORMULAS), []);
  // 高血圧（甘草の注意）があると補中益気湯は来店客向けから外れ、担当者画面の候補には残る
  const hb = safetyFlags({ C2: ['C2-1'] });
  const picksHb = recommendForCustomer(r, answers, hb, FORMULAS);
  eq('高血圧 → 甘草入りは来店客向けから外れる', picksHb.some((c) => c.cautionHerbs.includes('甘草')), false);
  eq('高血圧 → 担当者画面の候補には残る', recommend(r, answers, hb, FORMULAS).some((c) => c.name === '補中益気湯'), true);
}
{
  // 瘀血＋妊娠：桂枝茯苓丸は担当者画面に警告つきで出るが、来店客向けには出ない
  const answers = { B1: ['B1-5'], B2: ['B2-5'], B3: ['B3-4'], B10: ['B10-4'], B11: ['B11-4'], C3: ['C3-1'], A3: ['A3-10'] };
  const r = score(answers, QUESTIONS, { sex: 'female', tongueMode: 'staff' });
  const flags = safetyFlags(answers);
  eq('妊娠 → 来店客向けに桂枝茯苓丸は出ない', recommendForCustomer(r, answers, flags, FORMULAS).some((c) => c.name === '桂枝茯苓丸'), false);
  eq('妊娠 → 担当者画面には警告つきで残る', recommend(r, answers, flags, FORMULAS, undefined, 36).find((c) => c.name === '桂枝茯苓丸').warnings, ['pregnancy']);
}
{
  // 陽盛（熱寄り）に温める処方は矛盾
  const answers = { B1: ['B1-9'], B2: ['B2-10'], B3: ['B3-9'], B4: ['B4-7'], B5: ['B5-9'], B6: ['B6-9'], B8: ['B8-8'], B9: ['B9-9'], B10: ['B10-9'], B12: ['B12-8'], B13: ['B13-8'], D1: ['D1-6'], A3: ['A3-2'] };
  const r = score(answers, QUESTIONS, { sex: 'male', tongueMode: 'self' });
  eq('陽盛 → thermalLabel hot', r.thermalLabel, 'hot');
  const picks = recommendForCustomer(r, answers, [], FORMULAS);
  eq('熱寄りの来店客向けに温める処方は出ない', picks.every((c) => FORMULAS.find((f) => f.code === c.code).thermal !== 'warm'), true);
  eq('陽盛 → 1位 黄連解毒湯', picks[0]?.name, '黄連解毒湯');
  const warmF = FORMULAS.find((f) => f.code === 'F31'); // 八味地黄丸（温・陽虚）
  eq('矛盾の説明（主体質にない・虚実が逆・寒熱が逆）', conflictsOf(warmF, r).length, 3);
}
{
  // 水滞が主体質で気虚がないとき、六君子湯（主な対象は気虚）は来店客向けに出ない
  const answers = { B1: ['B1-6'], B2: ['B2-7'], B3: ['B3-5'], B4: ['B4-5'], B5: ['B5-6'], B6: ['B6-5'], B7: ['B7-4', 'B7-5'], B8: ['B8-5'], B9: ['B9-6'], B10: ['B10-6'], B12: ['B12-5'], B13: ['B13-5'], D1: ['D1-3'], A3: ['A3-6', 'A3-4'] };
  const r = score(answers, QUESTIONS, { sex: 'male', tongueMode: 'self' });
  eq('水滞 → mainTypes', r.mainTypes, ['fluid']);
  const picks = recommendForCustomer(r, answers, [], FORMULAS);
  eq('水滞 → 来店客向けは水滞が主な対象の処方だけ', picks.every((c) => primaryType(FORMULAS.find((f) => f.code === c.code)) === 'fluid'), true);
  eq('水滞 → 1位 五苓散', picks[0]?.name, '五苓散');
}

// ---- 設問フロー ----
eq('表示設問：女性・セルフ 27', visibleQuestions({ A1: ['A1-1'] }, 'self').length, 27);
eq('表示設問：男性・スタッフ 24', visibleQuestions({ A1: ['A1-2'] }, 'staff').length, 24);
eq('表示設問：性別未回答・セルフ 25（B11・C3 なし）', visibleQuestions({}, 'self').length, 25);
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
