// 漢方体質診断（/kampo/）v2 のロジック回帰テスト。
//   node --experimental-strip-types scripts/kampo-test.mjs
// 仕様書 docs/kampo-spec-v2.md §23 のテストケース（問診①〜⑦・体質⑧〜⑮・処方⑯〜⑳・安全性10項目）と、マスタの検証を確認する。
import fs from 'node:fs';
import {
  validateMasters, MASTER_SET, QUESTIONS, STAFF_QUESTIONS, COMPLAINTS, CATEGORIES, PATTERNS, FORMULAS, CANDIDATE_FORMULAS,
  questionById, entriesOf, compositionOf, findingById, REVIEW_STATUSES,
} from '../src/lib/kampo/masters.ts';
import { emptyState, applyAnswer, statusOf } from '../src/lib/kampo/findings.ts';
import { walk, complaintsOf, primaryOf, normalizeAnswer, isAnswered, firstUnansweredStep, applyStaffAnswers, currentKampo, adverseKampo } from '../src/lib/kampo/flow.ts';
import { assess, scoreWeights } from '../src/lib/kampo/assess.ts';
import { sessionSafety, candidateSafety } from '../src/lib/kampo/safety.ts';
import { selectCandidates } from '../src/lib/kampo/recommend.ts';
import { suggestStaffQuestions } from '../src/lib/kampo/staffq.ts';
import { computeSession } from '../src/lib/kampo/compute.ts';

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'OK ' : 'NG '} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const yes = (name, cond, info = '') => eq(name + (cond || !info ? '' : `（${info}）`), !!cond, true);
const clone = (x) => JSON.parse(JSON.stringify(x));

/** 所見を直接決めた状態（テスト用） */
function st(present = [], absent = [], unknown = []) {
  const s = emptyState();
  const put = (ids, status) => { for (const id of ids) s.answers.set(id, { id, status, sources: [{ questionId: 'TEST', optionIds: [], sourceType: 'patient', status }] }); };
  put(present, 'present'); put(absent, 'absent'); put(unknown, 'unknown');
  return s;
}
/** 安全性の入力（情報はすべて確認済み・該当なしの状態を基本にする） */
const SAFE_BASE = ['em_headache', 'em_chest', 'em_dyspnea', 'em_neuro', 'em_syncope', 'em_gi_bleed', 'em_fever', 'dx_hypertension', 'dx_other', 'med_other', 'med_unknown_name', 'med_kampo', 'allergy_drug', 'ar_history', 'pregnancy', 'pregnancy_possible'];
function context(present, { absent = [], unknown = [], primary, complaints, current = [], adverse = [], adverseUnknown = false, records, products, age = '40s', pregnancyAsked = true } = {}) {
  const s = st(present, [...SAFE_BASE.filter((x) => !present.includes(x) && !unknown.includes(x)), ...absent], unknown);
  const c = primary ? COMPLAINTS.find((x) => x.id === primary) : undefined;
  if (c && !present.includes(c.finding)) s.answers.set(c.finding, { id: c.finding, status: 'present', sources: [{ questionId: `K_${c.category}`, optionIds: [c.id], sourceType: 'patient', status: 'present' }] });
  const a = assess(s, { primaryComplaint: primary, complaintQuestionIds: c ? [c.detailQuestion] : [], complaintFindings: c ? [c.finding] : [] });
  const safetyInput = { st: s, sex: 'female', ageBand: age, current: { formulas: current, unknown: false, answered: current.length > 0 }, adverse: { formulas: adverse, unknown: adverseUnknown, answered: adverse.length > 0 || adverseUnknown }, records, pregnancyAsked, products };
  const safety = sessionSafety(safetyInput);
  const selection = selectCandidates({ st: s, assessment: a, safety, safetyInput, complaints: complaints ?? (primary ? [primary] : []), primary });
  const suggestions = suggestStaffQuestions({ st: s, assessment: a, safety, selection, tongueMode: 'self' });
  return { s, a, safety, safetyInput, selection, suggestions };
}

// =========================================================================
// マスタ
// =========================================================================
eq('マスタ検証 合格', validateMasters(MASTER_SET), []);
{
  const broken = clone(MASTER_SET);
  broken.patterns.patterns[0].weights.fatigue = 4;
  yes('重みが 1/2/3 以外なら検証エラー', validateMasters(broken).some((e) => e.includes('1/2/3')));
  const b2 = clone(MASTER_SET);
  b2.complaintFormulas.entries[0].review = { status: 'expert_checked' };
  yes('草案以外の確認状態に確認者・日時がないと検証エラー（§22）', validateMasters(b2).some((e) => e.includes('reviewer')));
  const b3 = clone(MASTER_SET);
  b3.questions.questions.find((q) => q.id === 'B1').options.push({ id: 'B1:zzz', text: 'x', findings: ['no_such_finding'] });
  yes('未定義の所見を参照すると検証エラー', validateMasters(b3).some((e) => e.includes('no_such_finding')));
  const b4 = clone(MASTER_SET);
  b4.questions.questions.find((q) => q.id === 'D_B02').options = b4.questions.questions.find((q) => q.id === 'D_B02').options.filter((o) => o.exclusive !== 'unknown');
  yes('詳細問診に「わからない」がないと検証エラー', validateMasters(b4).some((e) => e.includes('わからない')));
}
eq('主訴カテゴリーは §3 の8分類', CATEGORIES.map((c) => c.name), ['疲れ・体力・全身の不調', '胃腸・便通', '肌・美容', '髪・頭皮', '睡眠・こころ', '女性の健康', '痛み・こり・しびれ', 'その他の身体症状']);
eq('具体的主訴は73項目（A10・B9・C8・D8・E9・F7・G8・H14）', CATEGORIES.map((c) => COMPLAINTS.filter((x) => x.category === c.id).length), [10, 9, 8, 8, 9, 7, 8, 14]);
eq('C 肌・美容は独立した8項目', COMPLAINTS.filter((x) => x.category === 'C').map((x) => x.name), ['ニキビ', '顔のほてり・熱感', '肌の乾燥', '肌のかゆみ', '湿疹・肌荒れ', '肌のくすみ', 'シミ・色素沈着', '肝斑']);
yes('全主訴に詳細問診が1問ずつ（草案は確認状態 draft）', COMPLAINTS.every((c) => questionById(c.detailQuestion)?.trigger?.primary?.includes(c.id) && questionById(c.detailQuestion).review?.status === 'draft'));
const texts = (qid) => questionById(qid).options.map((o) => o.text);
eq('§4 の例：胃もたれ', texts('D_B02'), ['食後に悪化', '少量で満腹', 'お腹が張る', 'ストレスで悪化', '冷たいもので悪化', '特にない', 'わからない']);
eq('§4 の例：ニキビ', texts('D_C01'), ['赤く炎症', '膿を伴う', '肌の乾燥もある', '月経周期と関連して悪化', '特にない', 'わからない']);
eq('§4 の例：頭痛', texts('D_G01'), ['ズキズキする', '締めつけられる', '頭が重だるい', 'ストレスで悪化', '冷えると悪化', '特にない', 'わからない']);
yes('自由記述の設問・選択肢がない（§2-1）', [...QUESTIONS, ...STAFF_QUESTIONS].every((q) => ['single', 'multi'].includes(q.type) && q.options.every((o) => !('freeText' in o))));
eq('暫定カットオフ（§8）', PATTERNS.map((p) => [p.name, p.cutoff.candidate, p.cutoff.strong]), [['気虚', 5, 8], ['血虚', 5, 7], ['気滞', 5, 8], ['瘀血', 5, 7], ['水滞', 5, 8], ['陰虚', 5, 8]]);
yes('マスタの確認状態はすべて草案（検証済みとして扱わない）', ['findings', 'questions', 'patterns', 'formulas', 'herbs', 'evaluations', 'complaintFormulas', 'safetyRules'].every((k) => MASTER_SET[k].review.status === 'draft'));
eq('製品情報は未登録（公式資料で未確認の情報を推測で補完しない）', MASTER_SET.products.products.length, 0);
yes('候補処方は全件、構成生薬・評価・主訴対応のどれかを持つ', CANDIDATE_FORMULAS.every((f) => compositionOf(f.id)));
yes('参照用の処方（小柴胡湯など）は候補にならない', FORMULAS.filter((f) => f.role === 'reference').every((f) => !MASTER_SET.complaintFormulas.entries.some((e) => e.formulaId === f.id)));
yes('確認状態は5種', REVIEW_STATUSES.length === 5);

// =========================================================================
// 問診 ①〜⑦
// =========================================================================
const base = {
  P1: ['P1:female'], P2: ['P2:30s'], P3: ['P3:menses_regular'], P4: ['P4:none'], S1: ['S1:none'], S2: ['S2:none'], S3: ['S3:none'], S4: ['S4:none'], S5: ['S5:none'],
};
{
  const a = { ...base, K1: ['cat:B', 'cat:E'], K_B: ['B02', 'B07'], K_E: ['E07'] };
  eq('① 複数主訴を選択（カテゴリーをまたいで保持）', complaintsOf(a), ['B02', 'B07', 'E07']);
  eq('② 2つ以上なら優先主訴は未確定', primaryOf(a), undefined);
  const w0 = walk(a, 'self');
  yes('② 2つ以上なら「いちばん改善したい症状」を出す', w0.steps.some((x) => x.q.id === 'KM'));
  eq('② 優先主訴の選択肢は選んだ主訴', w0.steps.find((x) => x.q.id === 'KM').q.options.map((o) => o.id), ['KM:B02', 'KM:B07', 'KM:E07']);
  a.KM = ['KM:B02'];
  eq('② 優先主訴を指定（primary_complaint_id）', primaryOf(a), 'B02');
  eq('② 主訴が1つならそれが優先主訴（KM は出さない）', [primaryOf({ K1: ['cat:B'], K_B: ['B02'] }), walk({ ...base, K1: ['cat:B'], K_B: ['B02'] }, 'self').steps.some((x) => x.q.id === 'KM')], ['B02', false]);
  eq('② カテゴリーを外した主訴は消える', complaintsOf({ ...a, K1: ['cat:B'] }), ['B02', 'B07']);
  const w = walk(a, 'self');
  const ids = w.steps.map((x) => x.q.id);
  yes('③ 優先主訴の詳細問診を出す', ids.includes('D_B02'));
  yes('③ 優先でない主訴の詳細問診は出さない', !ids.includes('D_B07') && !ids.includes('D_E07'));
  yes('③ 安全上の確認は優先かどうかに関係なく出す（胃もたれ→R_gi、イライラはなし）', ids.includes('R_gi'));
  const order = ['basic', 'safety', 'complaint', 'detail', 'redflag', 'course', 'constitution', 'lifestyle'];
  const secs = w.steps.map((x) => order.indexOf(x.q.section));
  yes('画面の順番：基本情報・安全性 → 主訴 → 詳細 → 体質 → 生活習慣', secs.every((v, i) => i === 0 || secs[i - 1] <= v));

  // ④ 回答済みの再質問防止
  const a2 = { ...a, D_B02: ['D_B02:early_satiety', 'D_B02:bloating'] };
  const b5 = walk(a2, 'self').steps.find((x) => x.q.id === 'B5').q.options.map((o) => o.id);
  yes('④ 詳細問診で答えた「少量で満腹」「お腹の張り」を B5 で再質問しない', !b5.includes('B5:early_satiety') && !b5.includes('B5:bloating'));
  const a3 = { ...a, D_B02: ['D_B02:none'] };
  const b5n = walk(a3, 'self').steps.find((x) => x.q.id === 'B5').q.options.map((o) => o.id);
  yes('④「特にない」で absent になった所見も再質問しない', !b5n.includes('B5:early_satiety'));
  const a4 = { ...a, D_B02: ['D_B02:unknown'] };
  const b5u = walk(a4, 'self').steps.find((x) => x.q.id === 'B5').q.options.map((o) => o.id);
  yes('④「わからない」の所見は再質問する', b5u.includes('B5:early_satiety'));
  const eyes = { ...base, K1: ['cat:H'], K_H: ['H01', 'H02', 'H03', 'H04', 'H05', 'H13', 'H14'], KM: ['KM:H13'], D_H13: ['D_H13:red_eyes'] };
  yes('④ 選択肢の所見がすべて回答済みなら設問ごと出さない（B12）', !walk(eyes, 'self').steps.some((x) => x.q.id === 'B12'));
  const ed = walk({ ...base, K1: ['cat:H'], K_H: ['H08'], D_H08: ['D_H08:edema_evening', 'D_H08:edema_morning'] }, 'self').steps.find((x) => x.q.id === 'B7').q.options.map((o) => o.id);
  yes('④ 一部だけ回答済みなら残りの選択肢だけ出す（B7）', !ed.includes('B7:edema_evening') && !ed.includes('B7:edema_morning') && ed.includes('B7:mod_weather'));

  // ⑤ 排他
  const d = walk(a, 'self').steps.find((x) => x.q.id === 'D_B02').q;
  eq('⑤「特にない」とほかを同時に選んだら、ほかを残す', normalizeAnswer(d, ['D_B02:bloating', 'D_B02:none']), ['D_B02:bloating']);
  eq('⑤「特にない」と「わからない」は1つだけ', normalizeAnswer(d, ['D_B02:none', 'D_B02:unknown']), ['D_B02:none']);
  eq('⑤ 表示していない選択肢は捨てる', normalizeAnswer(d, ['B5:early_satiety', 'D_B02:bloating']), ['D_B02:bloating']);
  yes('⑤ 何も選ばなければ未回答', !isAnswered(d, []));

  // ⑥ 未質問を「なし」にしない
  const s2 = walk(a2, 'self').state;
  eq('⑥ 選んだ所見は present', statusOf(s2, 'early_satiety'), 'present');
  eq('⑥ 表示して選ばなかった所見は absent', statusOf(s2, 'mod_after_meal'), 'absent');
  eq('⑥ 選ばなかった主訴は absent にしない（not_asked）', statusOf(s2, 'stomach_pain'), 'not_asked');
  eq('⑥ 表示していない設問の所見は not_asked', statusOf(s2, 'headache_throbbing'), 'not_asked');
  eq('⑥「わからない」は unknown', statusOf(walk(a4, 'self').state, 'early_satiety'), 'unknown');
  eq('⑥「回答しない」は declined', statusOf(walk({ ...a, P4: ['P4:declined'] }, 'self').state, 'pregnancy'), 'declined');

  // ⑦ 月経関連質問の条件表示
  const hasB11 = (x) => walk({ ...a, ...x }, 'self').steps.some((s) => s.q.id === 'B11');
  eq('⑦ B11：月経あり（周期的・不規則）なら表示、閉経・妊娠授乳中は非表示', [hasB11({}), hasB11({ P3: ['P3:menses_irregular'] }), hasB11({ P3: ['P3:menses_post'] }), hasB11({ P3: ['P3:menses_none_preg'] })], [true, true, false, false]);
  eq('⑦ 性別「回答しない」でも月経ありなら表示（性別・年齢だけで決めない）', hasB11({ P1: ['P1:declined'], P3: ['P3:menses_irregular'] }), true);
  eq('⑦ 男性には月経・妊娠の設問を出さない', ['P3', 'P4', 'B11'].map((q) => walk({ ...a, P1: ['P1:male'] }, 'self').steps.some((s) => s.q.id === q)), [false, false, false]);
  eq('⑦ 男性には女性向けの選択肢を出さない', walk({ ...a, P1: ['P1:male'] }, 'self').steps.find((x) => x.q.id === 'B7')?.q.options.some((o) => o.femaleOnly) ?? false, false);
  eq('舌：受付で「スタッフが確認」なら B13 を出さない', walk(a, 'staff').steps.some((x) => x.q.id.startsWith('B13')), false);
  eq('S3K：漢方薬を飲んでいるときだけ検索つきの一覧', [walk({ ...a, S3: ['S3:med_kampo'] }, 'self').steps.find((x) => x.q.id === 'S3K')?.q.searchable, walk(a, 'self').steps.some((x) => x.q.id === 'S3K')], [true, false]);
  yes('未回答の最初の step', firstUnansweredStep(walk(a, 'self').steps) === walk(a, 'self').steps.findIndex((x) => x.q.id === 'D_B02') + 1);
}

// =========================================================================
// 体質 ⑧〜⑮
// =========================================================================
{
  // ⑧ 同一所見の重複加点防止：同じ所見を2つの設問で選んでも1回
  const s = emptyState();
  const q1 = { id: 'D_A01' }; const q2 = { id: 'B1' };
  applyAnswer(s, q1, [{ id: 'x1', text: '', findings: ['fatigue_exertion'] }], ['x1'], 'patient');
  applyAnswer(s, q2, [{ id: 'x2', text: '', findings: ['fatigue_exertion'] }], ['x2'], 'patient');
  eq('⑧ 同じ所見IDは1つにまとめる（情報源は2つ）', [s.answers.size, s.answers.get('fatigue_exertion').sources.length], [1, 2]);
  eq('⑧ 同一所見は証ごとに1回だけ加点', scoreWeights({ fatigue_exertion: 3 }, s).score, 3);
  // ⑨ 相関所見の過大加点防止
  eq('⑨ 胸脇部の張り（3）とため息（2）は同じグループ → 3点', scoreWeights(PATTERNS.find((p) => p.id === 'qi_stag').weights, st(['chest_distension', 'sighing'])).score, 3);
  eq('⑨ 別グループなら足す（胸脇部の張り3＋イライラ3）', scoreWeights(PATTERNS.find((p) => p.id === 'qi_stag').weights, st(['chest_distension', 'irritability'])).score, 6);
  // ⑩ 根拠不足で主証保留
  const a10 = assess(st(['fatigue', 'poor_appetite', 'sweat_easy']));
  eq('⑩ カットオフ以上でも3点の所見がなければ主証は保留', [a10.patterns[0].level, a10.primary.status], ['candidate', 'hold']);
  yes('⑩ 保留の理由を残す', a10.primary.reasons.some((r) => r.includes('3点')));
  eq('⑩ 所見が少なければ保留（候補なし）', assess(st(['fatigue_exertion'])).primary.status, 'hold');
  const tie = assess(st(['fatigue_exertion', 'weak_voice', 'irritability', 'chest_distension']));
  yes('⑩ 1位と2位が僅差なら保留', tie.primary.status === 'hold' && tie.primary.reasons.some((r) => r.includes('差')));
  // ⑪ 共通症状だけで併存証を成立させない
  const qd = ['fatigue_exertion', 'weak_voice', 'poor_appetite', 'catch_cold', 'sweat_easy'];
  const a11 = assess(st([...qd, 'heavy_body', 'edema_evening', 'tongue_teeth', 'loose_stool', 'vertigo_floating', 'stomach_splash']));
  const fl = a11.patterns.find((p) => p.id === 'fluid');
  eq('⑪ 主証は気虚', [a11.primary.status, a11.primary.patternId], ['determined', 'qi_def']);
  yes('⑪ 水滞はカットオフ以上だが、主証と共通の所見を除くと不足 → 併存証にしない', fl.score >= 5 && !a11.coexisting.includes('fluid') && a11.coexistChecks.find((c) => c.patternId === 'fluid').failed.some((f) => f.includes('共通')));
  const a11b = assess(st([...qd, 'stomach_splash', 'edema', 'mod_weather', 'head_heavy']));
  eq('⑪ 独立した所見で成り立てば併存証', a11b.coexisting, ['fluid']);
  yes('⑪ 併存証にしない証は詳細表示（folded）に格納', a11.folded.includes('fluid'));
  // ⑫ 冷え＋ほてりだけで上熱下寒にしない
  const a12 = assess(st(['cold_limbs', 'hot_upper']));
  eq('⑫ 手足の冷え＋上半身のほてりだけでは寒熱は保留', a12.coldHeat.status, 'hold');
  yes('⑫ 部位・時間帯・随伴症状の確認を促す（上熱下寒とは判定しない）', a12.coldHeat.notes.some((n) => n.includes('部位・時間帯') && n.includes('判定しません')));
  yes('⑫ 判定結果に「上熱下寒」の区分を作らない', !JSON.stringify(a12.coldHeat.status).includes('上熱'));
  const a12b = assess(st(['cold_whole', 'mod_warm_relief', 'prefer_warm', 'hot_upper', 'skin_inflamed', 'prefer_cold', 'strong_thirst']));
  eq('⑫ 寒・熱を別々に評価し、両方なら「寒熱混在の可能性」', a12b.coldHeat.status, 'mixed');
  // ⑬ 瘀血を自動で実証にしない
  const a13 = assess(st(['stabbing_pain', 'menstrual_clots', 'tongue_purple', 'dark_complexion']));
  eq('⑬ 瘀血が強く示唆されても虚実は所見がなければ保留', [a13.patterns.find((p) => p.id === 'blood_stasis').level, a13.defExc.status], ['strong', 'hold']);
  eq('⑬ 気虚が主証でも虚証を自動で決めない（虚の所見の組み合わせで判断）', assess(st(['fatigue_exertion', 'weak_voice', 'sleepy_after_meal'])).defExc.status, 'def');
  eq('⑬ 虚の所見が1グループだけなら虚実は保留', assess(st(['fatigue_exertion', 'fatigue', 'low_motivation', 'sleepy_after_meal'])).defExc.status, 'hold');
  // ⑭ 五臓を単一症状で確定しない
  const a14 = assess(st(['pale_face', 'dry_skin', 'cramps', 'palpitation']));
  eq('⑭ 主証 血虚', a14.primary.patternId, 'blood_def');
  yes('⑭ 動悸だけ（心・1グループ）では五臓を決めない', a14.zang.items.find((z) => z.zang === 'heart')?.possible === false);
  const a14b = assess(st(['irritability', 'chest_distension', 'mod_stress', 'pms']));
  yes('⑭ 肝に関連する所見が独立2グループ以上で「関連の可能性」', a14b.zang.status === 'possible' && a14b.zang.items[0].zang === 'liver');
  eq('⑭ 主証が保留なら五臓も保留', assess(st(['palpitation', 'insomnia_onset'])).zang.status, 'hold');
  // ⑮ 未取得の重要所見に対して必要な追加質問
  const c15 = context(['fatigue', 'poor_appetite', 'sweat_easy', 'low_motivation'], { primary: 'A01' });
  yes('⑮ 主証保留のとき、未確認の重要所見（活動時の疲労・声の弱さ）を含む追加質問を出す', c15.suggestions.some((x) => x.findings.includes('fatigue_exertion') || x.findings.includes('weak_voice')), JSON.stringify(c15.suggestions.map((x) => x.questionId)));
  yes('⑮ 追加質問の優先順：安全性 → 処方候補 → 証 → 五臓', (() => { const o = ['safety', 'formula', 'pattern', 'zang']; const c = c15.suggestions.map((x) => o.indexOf(x.category)); return c.every((v, i) => i === 0 || c[i - 1] <= v); })());
  // 主訴関連の証は体質の主証と別
  const c9 = context(['fatigue_exertion', 'weak_voice', 'poor_appetite', 'catch_cold', 'mod_stress', 'bloating'], { primary: 'B02' });
  c9.s.answers.get('mod_stress').sources[0].questionId = 'D_B02';
  c9.s.answers.get('bloating').sources[0].questionId = 'D_B02';
  const a9 = assess(c9.s, { primaryComplaint: 'B02', complaintQuestionIds: ['D_B02'], complaintFindings: ['stomach_heavy'] });
  eq('§9 体質の主証（気虚）と主訴関連の証（気滞）を分けて持つ', [a9.primary.patternId, a9.complaintRelated.related], ['qi_def', ['qi_stag']]);
  // 薬剤師の回答で再計算（薬剤師の観察が優先）
  const sp = emptyState();
  applyAnswer(sp, { id: 'B13A' }, questionById('B13A').options, ['B13A:tongue_pale'], 'patient_tongue');
  applyStaffAnswers(sp, { T1: ['T1:tongue_red'] });
  eq('§6 患者のイラスト選択と薬剤師の観察は別の情報源で、薬剤師を優先', [statusOf(sp, 'tongue_pale'), statusOf(sp, 'tongue_red'), sp.answers.get('tongue_pale').sources.map((x) => x.sourceType)], ['absent', 'present', ['patient_tongue', 'pharmacist_observation']]);
  // 修飾情報
  const sm = walk({ ...base, K1: ['cat:B'], K_B: ['B01'], D_B01: ['D_B01:mod_stress'] }, 'self').state;
  eq('§7 修飾情報は対象症状に紐づけて保存', sm.modifiers.map((m) => [m.findingId, m.targetSymptomId]), [['mod_stress', 'stomach_pain']]);
  eq('§7 「ストレスで胃痛が悪化」をストレス症状（ストレスによる体調不良）として加点しない', statusOf(sm, 'stress_illness'), 'not_asked');
}

// =========================================================================
// 処方 ⑯〜⑳
// =========================================================================
{
  const c = context(['early_satiety', 'mod_after_meal', 'poor_appetite'], { primary: 'B02' });
  const ids = c.selection.candidates.map((x) => x.formulaId).sort();
  eq('⑯ 候補は優先主訴の主訴対応マスタからだけ抽出', ids, entriesOf('B02').map((e) => e.formulaId).sort());
  const qi = ['fatigue_exertion', 'weak_voice', 'poor_appetite', 'catch_cold', 'sweat_easy', 'weak_after_illness'];
  const c17 = context(qi, { primary: 'G01' });
  yes('⑰ 体質が気虚でも、頭痛の主訴に補中益気湯（主訴対応なし）を足さない', c17.a.primary.patternId === 'qi_def' && !c17.selection.candidates.some((x) => x.formulaId === 'F01'));
  const c17b = context(qi, { primary: 'A01' });
  yes('⑰ 主訴が疲れなら補中益気湯が候補に入る', c17b.selection.candidates.some((x) => x.formulaId === 'F01'));
  const verified = { id: 'P-TEST', formulaId: 'F02', manufacturer: 'テスト', product_name: 'テスト六君子湯', approved_indications: '-', dosage: '-', contraindications: [], precautions: [], interactions: [], adverse_reactions: [], source: 'テスト', source_version: '1', last_verified: '2026-10-25', review: { status: 'expert_checked', source: 'テスト', reviewer: 'テスト', reviewedAt: '2026-10-25' } };
  const c18 = context(['early_satiety', 'mod_after_meal', 'poor_appetite', 'epigastric_fullness'], { primary: 'B02', products: [verified] });
  const f02 = c18.selection.candidates.find((x) => x.formulaId === 'F02');
  yes('⑱ 製品が確認済みでも、主訴対応が草案なら優先検討候補にしない', f02.klass === 'pending' && f02.classReasons.some((r) => r.includes('主訴対応が未確認')));
  eq('⑱ 草案のあいだは優先検討候補・検討候補は0件', [c.selection.byClass.priority.length, c.selection.byClass.consider.length], [0, 0]);
  yes('⑲ 未確認（未登録）の製品を「必要な確認完了」にしない', c.selection.candidates.every((x) => x.safety.state !== 'done' && x.safety.reasons.some((r) => r.code === 'product_none')));
  for (const cid of ['C08', 'C06', 'D01', 'D04']) {
    const cc = context(['pale_face', 'dry_skin', 'stabbing_pain', 'menstrual_clots', 'tongue_purple'], { primary: cid });
    eq(`⑳ 美容主訴（${COMPLAINTS.find((x) => x.id === cid).name}）に根拠のない処方を提示しない`, [cc.selection.candidates.length, cc.selection.noEvidence], [0, true]);
  }
  const c20 = context(['acne_inflamed', 'red_face'], { primary: 'C01' });
  yes('⑳ 効能に記載がある美容主訴（ニキビ）は候補あり', c20.selection.candidates.length > 0);
  // 条件つきの効能
  const cond = context(['headache'], { primary: 'G01' });
  eq('条件つきの効能（高血圧の随伴症状）は条件がなければ対象外', cond.selection.candidates.find((x) => x.formulaId === 'F17').klass, 'excluded');
  eq('条件があれば対象', context(['headache', 'dx_hypertension'], { primary: 'G01' }).selection.candidates.find((x) => x.formulaId === 'F17').indication.ok, true);
  // 体質の適合（補助）
  const fit = context(['cold_whole', 'mod_warm_relief', 'prefer_warm', 'cold_abdomen', 'loose_stool'], { primary: 'B08' });
  yes('寒傾向に冷ます処方は「不適合」を表示（除外はしない）', fit.a.coldHeat.status === 'cold' && fit.selection.candidates.filter((x) => x.evaluation.cold_heat === 'heat').every((x) => x.constitution.mismatch && x.klass !== 'excluded'));
}

// =========================================================================
// 安全性
// =========================================================================
{
  const ar = context(['poor_appetite', 'early_satiety'], { primary: 'B02', adverse: ['F55'], present: undefined });
  eq('安全1 副作用歴の処方（芍薬甘草湯）の構成生薬を取得', ar.safety.adverse.formulas[0].herbs, ['芍薬', '甘草']);
  const ar2 = context(['poor_appetite', 'ar_history'], { primary: 'B02', adverse: ['F55'] });
  const f25 = context(['nausea', 'ar_history'], { primary: 'B05', adverse: ['F55'] }).selection.candidates.find((x) => x.formulaId === 'F25');
  eq('安全2 共通生薬1種（甘草）で除外', [f25.klass, f25.safety.commonAdverseHerbs], ['excluded', ['甘草']]);
  const f52 = context(['bloating', 'ar_history'], { primary: 'B09', adverse: ['F55'] }).selection.candidates.find((x) => x.formulaId === 'F52');
  eq('安全3 複数の共通生薬（芍薬・甘草）で除外', [f52.klass, f52.safety.commonAdverseHerbs], ['excluded', ['芍薬', '甘草']]);
  yes('安全4 原因生薬が未特定なら構成生薬すべてを暫定除外', ar2.safety.adverse.excludedHerbs.every((e) => e.provisional) && ar2.selection.byClass.excluded.some((x) => x.safety.reasons.some((r) => r.text.includes('暫定除外'))));
  const rec = context(['bloating', 'ar_history'], { primary: 'B09', adverse: ['F55'], records: [{ formulaId: 'F55', causalHerbs: ['甘草'], evidence: '資料', reason: '理由', staffName: 'A', at: '2026-10-25T00:00:00Z' }] });
  yes('安全4 薬剤師が原因生薬（甘草）を記録しても、芍薬を含む候補を自動解除しない', rec.safety.adverse.excludedHerbs.find((e) => e.herb === '芍薬').provisional === true && rec.safety.adverse.excludedHerbs.find((e) => e.herb === '甘草').provisional === false && rec.selection.candidates.find((x) => x.formulaId === 'F52').klass === 'excluded');
  const f21 = context(['edema', 'ar_history'], { primary: 'H08', adverse: ['F55'] }).selection.candidates.find((x) => x.formulaId === 'F21');
  yes('安全5 共通生薬が見つからなくても構成生薬が未確認（草案）なら確認待ち', f21.klass === 'pending' && f21.safety.reasons.some((r) => r.code === 'ar_unverified'));
  const unk = context(['edema', 'ar_history'], { primary: 'H08', adverseUnknown: true });
  yes('安全5 副作用歴の漢方薬が特定できなければ確認待ち', unk.safety.common.some((r) => r.code === 'ar_formula_unknown') && unk.selection.candidates.every((x) => x.safety.state !== 'done'));
  const preg = context(['dysmenorrhea', 'pregnancy'], { primary: 'F01' });
  yes('安全6 禁忌（妊娠中：桃仁・牡丹皮を含む桂枝茯苓丸。草案の規則）を除外', preg.selection.candidates.find((x) => x.formulaId === 'F16').klass === 'excluded');
  const ci = { ...JSON.parse(JSON.stringify({ id: 'P-CI', formulaId: 'F02', manufacturer: 'テスト', product_name: 'テスト六君子湯', approved_indications: '-', dosage: '-', contraindications: ['テスト'], precautions: [], interactions: [], adverse_reactions: [], source: 'テスト', source_version: '1', last_verified: '2026-10-25' })), contraindication_findings: ['dx_liver'], interaction_findings: ['med_anticoagulant'], review: { status: 'expert_checked', source: 'テスト', reviewer: 'テスト', reviewedAt: '2026-10-25' } };
  eq('安全6 製品の禁忌に当たる所見があれば除外', context(['poor_appetite', 'dx_liver'], { primary: 'B02', products: [ci] }).selection.candidates.find((x) => x.formulaId === 'F02').klass, 'excluded');
  const inter = context(['poor_appetite', 'med_anticoagulant'], { primary: 'B02', products: [ci] });
  yes('安全7 併用薬の相互作用を確認（製品の相互作用・薬の種類の確認事項）', inter.selection.candidates.find((x) => x.formulaId === 'F02').safety.reasons.some((r) => r.code.startsWith('ia:')) && inter.safety.common.some((r) => r.code === 'med:med_anticoagulant'));
  yes('安全7 名前のわからない薬があれば確認待ち', context(['poor_appetite', 'med_unknown_name'], { primary: 'B02' }).safety.common.some((r) => r.code === 'med_unknown_name' && r.state === 'pending'));
  const dup = context(['poor_appetite', 'med_kampo'], { primary: 'B02', current: ['F70'] });
  const f02d = dup.selection.candidates.find((x) => x.formulaId === 'F02');
  yes('安全8 服用中の漢方（葛根湯）と候補の共通生薬を表示（重複だけで除外しない）', f02d.safety.commonCurrentHerbs.map((x) => x.herb).join() === '大棗,甘草,生姜' && f02d.klass !== 'excluded' && f02d.safety.reasons.some((r) => r.code === 'dup_herbs' && r.state === 'check'));
  const em = context(['poor_appetite', 'em_chest'], { primary: 'B02' });
  yes('安全9 緊急症状なら通常の候補提示を停止', em.safety.state === 'emergency' && !!em.selection.stop && em.selection.candidates.length === 0);
  yes('安全10 除外・対象外の理由を薬剤師が確認できる（全件に理由）', [ar2, preg, cond0()].every((c) => c.selection.byClass.excluded.every((x) => x.classReasons.length > 0)));
  function cond0() { return context(['headache'], { primary: 'G01' }); }
  const lic = context(['poor_appetite', 'dx_hypertension'], { primary: 'B02' });
  yes('甘草×高血圧は薬剤師確認（草案の規則）', lic.selection.candidates.find((x) => x.formulaId === 'F02').safety.reasons.some((r) => r.code.startsWith('herb:甘草')));
  const pu = context(['poor_appetite'], { primary: 'B02', unknown: ['pregnancy', 'pregnancy_possible'] });
  yes('妊娠の可能性が未確認なら、妊娠時に注意する生薬を含む候補は確認待ち', pu.selection.candidates.filter((x) => compositionOf(x.formulaId).herbs.some((h) => ['大黄', '芒硝', '桃仁', '牡丹皮', '紅花', '牛膝', '附子', '麻黄', '枳実', '厚朴', '呉茱萸', '乾姜'].includes(h))).every((x) => x.safety.reasons.some((r) => r.code === 'preg_unknown_herb')));
}

// =========================================================================
// セッション全体（compute）
// =========================================================================
{
  const a = { ...base, S3: ['S3:med_kampo'], S3K: ['S3K:F70'], S5: ['S5:ar_history'], S5A: ['S5A:F56'], S5B: ['S5B:ar_gi'], K1: ['cat:B'], K_B: ['B02'], D_B02: ['D_B02:early_satiety'] };
  const r = computeSession({ answers: a, tongueMode: 'self', staffAnswers: { X_defexc: ['X_defexc:robust'] } });
  eq('compute：服用中・副作用歴の漢方を拾う', [currentKampo(a).formulas, adverseKampo(a).formulas], [['F70'], ['F56']]);
  yes('compute：薬剤師の追加質問を所見に統合', statusOf(r.state, 'robust') === 'present' && statusOf(r.patientState, 'robust') !== 'present');
  yes('compute：回答済みの追加質問は再提案しない', !r.suggestions.some((x) => x.questionId === 'X_defexc'));
  yes('compute：平胃散（厚朴が麻子仁丸と共通）は除外', r.selection.candidates.find((x) => x.formulaId === 'F50').klass === 'excluded');
}
// findings.json の所見の種類
yes('安全性・背景の所見は証の重みを持たない', PATTERNS.every((p) => Object.keys(p.weights).every((f) => !['safety', 'context'].includes(findingById(f).kind))));
yes('docs に仕様書 v2 がある', fs.existsSync('docs/kampo-spec-v2.md') && fs.existsSync('docs/kampo-v2-design.md'));

console.log(fail ? `\n${fail} 件 NG` : '\nすべて OK');
process.exit(fail ? 1 : 0);
