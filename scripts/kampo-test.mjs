// 漢方体質チェック（/kampo/）のロジック回帰テスト。
//   node --experimental-strip-types scripts/kampo-test.mjs
// マスタ検証・スコアリング（仕様書 第6節の検算例）・安全確認・主訴の3段階・二段階の漢方薬選定・設問フローを確認する。
import { QUESTIONS, TYPES, FORMULAS, validateMasters, TYPE_DEFS, COMPLAINT_QUESTIONS, CATEGORY_QUESTION } from '../src/lib/kampo/masters.ts';
import { score, classify, zero } from '../src/lib/kampo/scoring.ts';
import { safetyFlags } from '../src/lib/kampo/safety.ts';
import { selectFormulas, customerPicks, mainComplaintGroup, buildReasons } from '../src/lib/kampo/recommend.ts';
import { mainComplaintId, chosenComplaintIds } from '../src/lib/kampo/complaints.ts';
import { visibleQuestions, normalizeAnswer, isAnswered, firstUnansweredStep, personalTips, sexFromAnswers, resolveQuestion } from '../src/lib/kampo/flow.ts';
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
eq('設問数 136（基本26＋大カテゴリー1＋具体的な主訴8＋いちばん改善したい主訴1＋詳細問診100）', QUESTIONS.length, 136);
eq('大カテゴリーは A〜H の8つ（それぞれ独立）', CATEGORY_QUESTION.options.map((o) => o.text), ['肌の悩み', '髪・頭皮の悩み', '年齢による見た目の変化', '生理前・生理中の不調', '更年期・ホルモン変化', '疲れ・だるさ・体力低下', '冷え・血行の悩み', 'ストレス・気分の不調']);
eq('具体的な主訴の設問はカテゴリーごとに1つ（KA〜KH）', COMPLAINT_QUESTIONS.map((x) => [x.id, x.showIf?.chosen]), 'ABCDEFGH'.split('').map((L) => [`K${L}`, [`K1-${L}`]]));
{
  const texts = (id) => COMPLAINT_QUESTIONS.find((x) => x.id === id).options.map((o) => o.text);
  eq('肌と髪を統合しない（肌の一覧に髪、髪の一覧に肌の主訴がない）', [texts('KA').some((t) => /髪|頭皮|抜け毛/.test(t)), texts('KB').some((t) => /ニキビ|シミ|肌の/.test(t))], [false, false]);
  eq('具体的な主訴の一覧に詳細（ニキビの種類など）を混ぜない', texts('KA').filter((t) => t.includes('ニキビ')), ['ニキビ・吹き出物']);
  eq('すべての主訴に詳細問診がある', COMPLAINT_QUESTIONS.every((x) => x.options.every((o) => QUESTIONS.some((d) => d.role === 'detail' && d.showIf?.mainDetail === o.detail))), true);
  eq('詳細問診は1つの主訴につき1〜3問', Math.max(...COMPLAINT_QUESTIONS.flatMap((x) => x.options.map((o) => QUESTIONS.filter((d) => d.showIf?.mainDetail === o.detail).length))), 3);
}
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
  const noTpl = JSON.parse(JSON.stringify(qj));
  noTpl.questions.find((x) => x.id === 'KA').options[0].detail = 'missing_tpl';
  eq('詳細問診のない主訴を検出', validateMasters(noTpl, tj, fj).some((e) => e.includes('missing_tpl')), true);
}
eq('処方 68 件', FORMULAS.length, 68);
eq('全処方に承認効能・使用目標・漢方の考え方', FORMULAS.every((f) => f.efficacy && f.useTarget && f.action && f.indications.length > 0), true);
eq('タイプ 8 件', Object.keys(TYPE_DEFS).length, 8);

// ---- スコアリング ----
const noneAll = Object.fromEntries(QUESTIONS.filter((x) => x.scored && x.block !== 'A').map((x) => [x.id, [x.options.find((o) => o.flags?.includes('none')).id]]));
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

// ---- 主訴の詳細問診と体質の評価 ----
const mk = (ids) => { const a = {}; for (const id of ids) { const q = id.replace(/-[^-]+$/, ''); (a[q] ??= []).push(id); } return a; };
/** 具体的な主訴（K?-*）を並べると大カテゴリー K1 と、複数なら KM（先頭を「いちばん改善したい」）を補う */
const withComplaints = (ids, main) => {
  const a = mk(ids);
  const comp = ids.filter((x) => /^K[A-H]-/.test(x));
  if (comp.length) a.K1 = [...new Set(comp.map((x) => `K1-${x[1]}`))];
  if (comp.length > 1) a.KM = [main ?? comp[0]];
  return a;
};
{
  const a = withComplaints(['KA-acne', 'Sacne1-red']);
  const r = score(a, QUESTIONS, { sex: 'female', tongueMode: 'self' });
  const r0 = score({}, QUESTIONS, { sex: 'female', tongueMode: 'self' });
  eq('詳細問診の回答も体質の評価に入る（赤く腫れる→陽盛 +0.5）', r.raw.yang_exc, 0.5);
  eq('詳細問診は、いちばん改善したい主訴のものだけ max に入る', r.max.yang_exc > r0.max.yang_exc, true);
  const male = score(a, QUESTIONS, { sex: 'male', tongueMode: 'self' });
  const none = score(a, QUESTIONS, { sex: 'none', tongueMode: 'self' });
  eq('女性向けの選択肢（生理前に悪化）は男性の max に入れない', none.max.qi_stag - male.max.qi_stag, 0.25);
}
{
  eq('主訴が1つ → それがいちばん改善したい主訴', mainComplaintId(withComplaints(['KA-acne'])), 'KA-acne');
  eq('主訴が複数 → KM で選んだもの', mainComplaintId(withComplaints(['KA-acne', 'KD-irregular'], 'KD-irregular')), 'KD-irregular');
  eq('主訴が複数で KM 未回答 → 未確定', mainComplaintId({ K1: ['K1-A'], KA: ['KA-acne', 'KA-dry'] }), undefined);
  eq('KM が選んだ主訴にない → 未確定', mainComplaintId({ K1: ['K1-A'], KA: ['KA-acne', 'KA-dry'], KM: ['KH-low'] }), undefined);
  eq('選んだ主訴は設問→選択肢の順', chosenComplaintIds({ KD: ['KD-irregular'], KA: ['KA-dry', 'KA-acne'] }), ['KA-acne', 'KA-dry', 'KD-irregular']);
  const g = mainComplaintGroup(withComplaints(['KA-acne', 'KD-irregular', 'Sacne1-pus', 'Sacne3-none']));
  eq('主訴グループ：詳細の「特になし」は除き、詳細の症状を候補抽出に加える', [g.details.map((d) => d.id), g.symptoms], [['Sacne1-pus'], ['acne', 'pyoderma']]);
  eq('ほかに選んだ主訴は随伴症状（候補抽出には使わない）', g.also, ['irregular_menses']);
}

// ---- 二段階の漢方薬選定 ----
const BASE = ['A1-1', 'A2-3', 'A4-4', 'A4s-2', 'A5-2', 'C1-2', 'C2-0', 'C3-4', 'C4-2'];
const sel = (ids, texts = {}, main) => {
  const all = [...BASE.filter((b) => !ids.some((x) => x.split('-')[0] === b.split('-')[0])), ...ids];
  const a = withComplaints(all, main);
  const r = score(a, QUESTIONS, { sex: 'female', tongueMode: 'self' });
  const fl = safetyFlags(a, texts);
  return { a, r, fl, s: selectFormulas(r, a, texts, fl, FORMULAS) };
};
const HEAT = ['B1-9', 'B2-10', 'B3-9', 'B5-9', 'B6-9', 'B9-9', 'B8-8', 'B13-8', 'D1-6', 'B4-7', 'B12-8'];
const STASIS = ['B1-5', 'B2-5', 'B2-6', 'B3-4', 'B10-4', 'B11-4', 'B12-4', 'B7-3', 'B9-5', 'B13-4', 'B6-4'];
const QIDEF = ['B1-1', 'B1-2', 'B2-1', 'B3-1', 'B4-1', 'B5-1', 'B6-1', 'B8-1', 'B9-1', 'B10-1', 'B12-1', 'B13-1', 'D1-1', 'B3-8'];
const QISTAG = ['B1-4', 'B3-3', 'B3-4', 'B5-2', 'B5-3', 'B8-3', 'B9-3', 'B9-4', 'B10-3', 'B11-3', 'B12-3', 'B13-3', 'B7-2', 'D1-2', 'B9-2', 'B2-2'];
const COLD = ['B1-8', 'B2-9', 'B3-2', 'B3-7', 'B3-8', 'B5-8', 'B6-7', 'B7-8', 'B9-8', 'B10-8', 'B11-7', 'B13-7', 'D1-5', 'B11-2', 'B2-2'];
const ACNE_POOL = ['清上防風湯', '荊芥連翹湯', '桂枝茯苓丸加薏苡仁', '桂枝茯苓丸', '防風通聖散'];
{
  // STEP 1：主訴で候補群を決める（体質で無関係な漢方薬を足さない）
  const { s } = sel(['KA-acne', 'Sacne1-red', ...QIDEF]);
  const pool = s.groups[0].candidates.map((c) => c.name);
  eq('STEP1 ニキビの候補群は効能に「にきび」を持つものだけ', pool.every((n) => ACNE_POOL.includes(n)) && ACNE_POOL.every((n) => pool.includes(n)), true);
  eq('STEP1 気虚が強くても補中益気湯を候補に足さない', pool.includes('補中益気湯'), false);
  eq('冷え・虚証の人のニキビ → 体質に合う候補なし（推薦しない）', [s.groups[0].outcome, s.groups[0].pick?.name], ['no_fit', undefined]);
  eq('不適合の理由（寒熱が逆）を記録', s.groups[0].candidates.find((c) => c.name === '清上防風湯').mismatches.some((m) => m.axis === '寒熱'), true);
  eq('STEP1 膿を持つニキビ → 化膿性皮膚疾患の十味敗毒湯も候補', [pool.includes('十味敗毒湯'), sel(['KA-acne', 'Sacne1-pus', ...QIDEF]).s.groups[0].candidates.some((c) => c.name === '十味敗毒湯')], [false, true]);
  const fat = sel(['KF-easily', 'Sfatigue1-appetite', ...QIDEF]).s.groups[0];
  eq('STEP1 詳細の随伴症状（食欲がない）は候補群に加えない（六君子湯は候補外）', fat.candidates.some((c) => c.name === '六君子湯'), false);
  eq('STEP2 随伴症状が効能に含まれれば加点（補中益気湯の食欲不振）', fat.pick?.alsoCovers.map((x) => x.symptom), ['poor_appetite']);
  eq('STEP1 主訴だけでは効能に当たらない肌の乾燥も、詳細の「かゆみ」で候補群ができる', [sel(['KA-dry', 'Sdry_skin2-none', ...QIDEF]).s.groups[0].outcome, sel(['KA-dry', 'Sdry_skin2-itch', ...QIDEF]).s.groups[0].candidates.some((c) => c.name === '当帰飲子')], ['no_pool', true]);
}
{
  // STEP 2〜3：同じニキビでも体質で選ぶ漢方薬が変わる
  eq('炎症・赤み＋体力あり（実熱）→ 清上防風湯', sel(['KA-acne', 'Sacne1-red', ...HEAT]).s.groups[0].pick?.name, '清上防風湯');
  eq('慢性に繰り返す・皮膚が浅黒い → 荊芥連翹湯', sel(['KA-acne', 'Sacne1-recur', 'A4-5', 'B2-5', 'B4-3', 'B12-5', 'B2-10', 'B3-9', 'B9-3', 'B5-10']).s.groups[0].pick?.name, '荊芥連翹湯');
  const st = sel(['KD-acne', 'Sacne3-menses', 'KD-irregular', ...STASIS]).s;
  eq('生理前のニキビ＋生理不順（瘀血）→ 桂枝茯苓丸加薏苡仁', st.groups[0].pick?.name, '桂枝茯苓丸加薏苡仁');
  eq('ほかに選んだ主訴（生理不順）は随伴症状として効能に含まれるか見る', st.groups[0].pick?.alsoCovers.map((x) => x.symptom), ['irregular_menses']);
  eq('いちばん改善したい主訴を中心に、推薦は1件', st.groups.length, 1);
}
{
  // 条件つきの効能（高血圧や肥満に伴うのぼせ）は条件を満たすときだけ候補
  const no = sel(['KA-flush', ...HEAT]).s.groups[0].candidates.map((c) => c.name);
  const yes = sel(['KA-flush', 'B1-5', ...HEAT]).s.groups[0].candidates.map((c) => c.name);
  eq('防風通聖散の「肥満に伴うのぼせ」は肥満の回答がないと候補にしない', [no.includes('防風通聖散'), yes.includes('防風通聖散')], [false, true]);
  eq('便秘の回答があれば「便秘に伴うのぼせ」の麻子仁丸も候補', no.includes('麻子仁丸'), true);
}
{
  // 更年期のカテゴリー：更年期障害の効能で候補群を作り、症状の効能も加える
  const hf = sel(['KE-hotflash', 'Shot_flash1-coldfeet', 'KH-palpitation', ...QISTAG, 'B8-2', 'B12-2', 'B3-6', 'B1-3', 'B10-2']).s.groups[0];
  const names = hf.candidates.map((c) => c.name);
  eq('ホットフラッシュ → 更年期障害（加味逍遥散ほか）と、ほてり（知柏地黄丸）が候補', ['加味逍遥散', '知柏地黄丸', '女神散'].every((n) => names.includes(n)), true);
  eq('ほかに選んだ動悸は加点のみ（苓桂朮甘湯は候補外）', names.includes('苓桂朮甘湯'), false);
  eq('のぼせて足が冷える・気滞 → 加味逍遥散', hf.pick?.name, '加味逍遥散');
  eq('更年期の肌の乾燥・抜け毛は更年期障害の効能で拾わない', [sel(['KE-dry', 'Sdry_skin2-none']).s.groups[0].outcome, sel(['KE-hair']).s.groups[0].outcome], ['no_pool', 'no_pool']);
}
{
  // STEP 4：安全性
  const preg = sel(['KD-acne', 'Sacne3-menses', ...STASIS, 'C3-1']).s.groups[0];
  eq('妊娠中 → 桂枝茯苓丸系は除外され、推薦されない', [preg.candidates.find((c) => c.name === '桂枝茯苓丸加薏苡仁').safety.status, ['桂枝茯苓丸', '桂枝茯苓丸加薏苡仁'].includes(preg.pick?.name)], ['excluded', false]);
  const meds = sel(['KF-easily', ...QIDEF, 'C1-1'], { 'C1-1': '' }).s.groups[0];
  eq('服用薬の名前が未記入 → 推薦を確定せず要確認', [meds.outcome, meds.pick?.name, meds.pick?.safety.check.some((x) => x.includes('情報不足'))], ['pick_check', '補中益気湯', true]);
  const hyp = sel(['KF-easily', ...QIDEF, 'C2-1']).s.groups[0];
  eq('高血圧 × 甘草 → 要確認（理由つき）', hyp.pick?.safety.check.some((x) => x.startsWith('甘草を含むため、高血圧')), true);
  const ok = sel(['KF-easily', ...QIDEF]).s.groups[0];
  eq('安全上の問題がなければ確定の推薦', [ok.outcome, ok.pick?.name], ['pick', '補中益気湯']);
  const refer = sel(['KF-easily', ...QIDEF, 'A4-5', 'A4s-3']);
  eq('受診勧奨 → 来店客向けの推薦は出さない', [refer.s.refer, customerPicks(refer.s, refer.r).picks.length], [true, 0]);
  const red = sel(['KE-headache', 'Sheadache3-sudden', ...QIDEF]);
  eq('詳細問診の受診勧奨（突然の激しい頭痛）→ refer で推薦を出さない', [red.fl.find((f) => f.code === 'refer:Sheadache3-sudden')?.level, red.s.refer], ['refer', true]);
  const cons = sel(['KD-pain', 'Speriod_pain2-severe', 'Speriod_pain1-cold', ...COLD]);
  eq('詳細問診の「受診も検討」（寝込むほどの生理痛）→ 注意フラグ＋推薦は要確認', [cons.fl.find((f) => f.code === 'consult:Speriod_pain2-severe')?.level, cons.s.groups[0].outcome, cons.s.groups[0].pick?.safety.check.some((x) => x.includes('受診も検討'))], ['warn', 'pick_check', true]);
}
{
  // STEP 5：推薦理由の順序と内容
  const x = sel(['KA-acne', 'Sacne1-red', ...HEAT]);
  const g = x.s.groups[0];
  const rs = buildReasons(g, g.pick, x.r, { forCustomer: true });
  eq('理由① 主訴：いちばん改善したいお悩みと承認効能の語', rs.complaint.includes('「ニキビ・吹き出物」（肌の悩み）') && rs.complaint.includes('「にきび」') && rs.complaint.includes('効能・効果'), true);
  eq('理由② 体質：気血水・寒熱・虚実を実際の点数で', ['【気血水】', '【寒熱】', '【虚実】'].every((a) => rs.constitution.some((c) => c.startsWith(a))) && rs.constitution.some((c) => /陽盛 \d+点/.test(c)), true);
  eq('理由② 詳細問診の回答（赤く腫れる）を使用目標の一致として先頭に出す', rs.constitution[0].startsWith('【主訴の詳細】') && rs.constitution[0].includes('赤く腫れるニキビ'), true);
  eq('理由② 使用目標と漢方の考え方は別の欄', [rs.useTarget.startsWith('体力中等度以上'), rs.action.includes('清熱')], [true, true]);
  eq('理由③ 他の候補との比較（便秘があるので麻子仁丸・大黄甘草湯も候補＝7種類）', rs.comparison.length >= 2 && rs.comparison[0].includes('候補7種類') && rs.comparison.some((c) => c.startsWith('荊芥連翹湯')), true);
  eq('理由④ 服用前の注意（含まれる生薬）', rs.cautions.some((c) => c.startsWith('山梔子を含みます')) && rs.cautions.some((c) => c.startsWith('黄芩を含みます')), true);
  const pus = sel(['KA-acne', 'Sacne1-pus', ...HEAT]).s.groups[0];
  const jm = pus.candidates.find((c) => c.name === '十味敗毒湯');
  eq('理由① 詳細で候補になったときは詳細の回答を挙げる', buildReasons(pus, jm, x.r).complaint.includes('「膿を持つニキビ」'), true);
}
{
  // 候補なし・その他
  eq('ほうれい線 → 承認効能に該当なし（候補なし）', sel(['KC-nasolabial', 'Saging1-tired', ...QIDEF]).s.groups[0].outcome, 'no_pool');
  eq('抜け毛 → 承認効能に該当なし（候補なし）', sel(['KB-loss', 'Shair_loss3-stress']).s.groups[0].outcome, 'no_pool');
  const oth = sel(['KA-other', 'Sother1-none'], { 'KA-other': 'あざが消えにくい' });
  eq('その他（自由記入）→ 候補を出さず、記入内容を薬剤師へ', [oth.s.groups[0].outcome, oth.s.otherComplaint], ['other', '肌の悩み：あざが消えにくい']);
  eq('主訴の選択がない旧データ → 推薦グループなし', sel([]).s.groups.length, 0);
}

// ---- 設問フロー ----
eq('表示設問：女性・セルフ 27', visibleQuestions({ A1: ['A1-1'] }, 'self').length, 27);
eq('表示設問：男性・スタッフ 24', visibleQuestions({ A1: ['A1-2'] }, 'staff').length, 24);
eq('表示設問：性別未回答・セルフ 25（B11・C3 なし）', visibleQuestions({}, 'self').length, 25);
{
  const ids = (a) => visibleQuestions({ A1: ['A1-1'], ...a }, 'self').map((x) => x.id);
  eq('第1段階 → 選んだカテゴリーの具体的な主訴だけ出る', ids({ K1: ['K1-A', 'K1-B'] }).slice(2, 6), ['K1', 'KA', 'KB', 'A4']);
  eq('主訴が1つ → 「いちばん改善したい」は出さず、その詳細問診へ', ids({ K1: ['K1-A'], KA: ['KA-acne'] }).slice(2, 8), ['K1', 'KA', 'Sacne1', 'Sacne2', 'Sacne3', 'A4']);
  eq('主訴が複数 → KM で1つ決めるまで詳細問診は出さない', ids({ K1: ['K1-A', 'K1-B'], KA: ['KA-acne'], KB: ['KB-loss'] }).slice(2, 7), ['K1', 'KA', 'KB', 'KM', 'A4']);
  eq('KM で選んだ主訴の詳細問診だけ出る（ほかは随伴症状）', ids({ K1: ['K1-A', 'K1-B'], KA: ['KA-acne'], KB: ['KB-loss'], KM: ['KB-loss'] }).slice(5, 9), ['KM', 'Shair_loss1', 'Shair_loss2', 'Shair_loss3']);
  const male = { A1: ['A1-2'], K1: ['K1-A'], KA: ['KA-acne'] };
  eq('男性には「生理前・生理中の不調」と生理前の選択肢を出さない', [resolveQuestion(q('K1'), male).options.some((o) => o.id === 'K1-D'), resolveQuestion(q('Sacne3'), male).options.some((o) => o.id === 'Sacne3-menses')], [false, false]);
  const two = { A1: ['A1-1'], K1: ['K1-A', 'K1-E'], KA: ['KA-dry', 'KA-acne'], KE: ['KE-dry'] };
  eq('KM の選択肢は選んだ主訴（同名はカテゴリーを添える）', resolveQuestion(q('KM'), two).options.map((o) => o.text), ['ニキビ・吹き出物', '肌の乾燥（肌の悩み）', '肌の乾燥（更年期・ホルモン変化）']);
  eq('詳細問診の見出しに主訴名を入れる', resolveQuestion(q('Sacne1'), { K1: ['K1-A'], KA: ['KA-acne'] }).title, '「ニキビ・吹き出物」は、どのようなタイプですか');
  eq('normalize: KM は選んだ主訴だけ受け付ける', [normalizeAnswer(resolveQuestion(q('KM'), two), ['KE-dry'], {}).ids, normalizeAnswer(resolveQuestion(q('KM'), two), ['KH-low'], {}).ids], [['KE-dry'], []]);
  const changed = { A1: ['A1-1'], A2: ['A2-3'], K1: ['K1-A'], KA: ['KA-acne', 'KA-itch'], KM: ['KA-dry'] };
  const vis = visibleQuestions(changed, 'self');
  eq('主訴を選び直して KM の回答が無効 → KM から答え直す', vis[firstUnansweredStep(vis, changed, {}) - 1].id, 'KM');
}
eq('性別の読み取り', [sexFromAnswers({ A1: ['A1-1'] }), sexFromAnswers({ A1: ['A1-3'] }), sexFromAnswers({})], ['female', 'none', undefined]);
{
  const b1 = q('B1');
  eq('normalize: none があれば他を外す', normalizeAnswer(b1, ['B1-1', 'B1-0', 'B1-4'], {}).ids, ['B1-0']);
  eq('normalize: 不正IDを捨てる', normalizeAnswer(b1, ['B1-1', 'X-1', 'B2-2'], {}).ids, ['B1-1']);
  eq('normalize: 大カテゴリーは最大3つ', normalizeAnswer(q('K1'), ['K1-A', 'K1-B', 'K1-C', 'K1-D'], {}).ids.length, 3);
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
