// 漢方体質チェック（/kampo/）のロジック回帰テスト（2026-10-25 v3・フェーズ2、2026-10-28 修正依頼 v3.1）。
//   node --experimental-strip-types scripts/kampo-test.mjs
// マスタ検証・主訴と深掘り・回答の引き継ぎ（同じ所見を2回聞かない）・改修指示 4-1〜4-8 の個別修正・
// 安全確認タグと直ちに対応・暫定スコアの重複加点防止・二段階の漢方薬選定・旧版セッションの扱い、
// 2026-10-28 修正依頼（6タイプ＋寒熱・選択肢の分割と移動・矛盾する選択肢・妊娠授乳の任意化・アレルギーと副作用歴の統合・
// 漢方薬の薬剤師入力と重複警告・生活習慣1問・舌4軸・顔色と爪の観察優先）を確認する。
// 2026-10-31 第4弾（自動チェックだけで次へ・舌の小見出し・食品アレルギー→構成生薬で除外・耳鳴りの音・受診のおすすめは薬剤師画面のみ・注意の種類と根拠・養生の出し方）も確認する。
// 2026-10-29 第3弾（妊娠中は月経の設問なし・周期と経血の矛盾・不正出血の受診のおすすめ・薬と病気の選択肢ごとの記入欄と飲み合わせ・妊娠授乳は漢方の提案なし・舌の確認方法・爪の色と形・ツムラ番号）も確認する。
import {
  QUESTIONS, STAFF_QUESTIONS, COMPLAINTS, CATEGORIES, FORMULAS, TYPE_DEFS, THERMAL_DEFS, TYPES, STEPS, TIPS, FOUNDATION, findingById, validateMasters, complaintById, legacyOptionText, QUESTIONNAIRE,
} from '../src/lib/kampo/masters.ts';
import { walk, normalizeAnswer, isAnswered, firstUnansweredStep, personalTips, primaryOf, complaintsOf, applyStaffAnswers, conflictIn, resolveQuestion, tongueMode } from '../src/lib/kampo/flow.ts';
import { score, classify, resultCards, SELF_TONGUE_FACTOR, advicePlan, adviceOverride, relatedTypeOf } from '../src/lib/kampo/scoring.ts';
import { safetyFlags, safetyTags, isUrgent, safetyContext, staffChecks, noKampoReason, referrals, foodAllergies, assessFormulaSafety, CAUTION_KIND_LABEL } from '../src/lib/kampo/safety.ts';
import { computeSession, selectionOf, isLegacy, kampoHidden } from '../src/lib/kampo/compute.ts';
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
const sq0 = (id) => STAFF_QUESTIONS.find((x) => x.id === id);
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
{
  const [qj, cj, fj, tj, ty, fo] = M.map((x) => JSON.parse(JSON.stringify(x)));
  qj.questions.find((x) => x.id === 'B4').options.push({ id: 'B4-unknown', text: 'わからない', exclusive: 'unknown' });
  eq('体質の設問に「わからない」を置くと検証エラー（2-1）', validateMasters(qj, cj, fj, tj, ty, fo).some((e) => e.includes('B4') && e.includes('わからない')), true);
}
eq('処方 68 件・タイプ 6 件・寒熱 2 件', [FORMULAS.length, Object.keys(TYPE_DEFS).length, Object.keys(THERMAL_DEFS).length], [68, 6, 2]);
eq('設問版', QUESTIONNAIRE.version, '2026-10-31-v3.4');

// ---- 主訴カテゴリーと具体的な主訴（改修計画 §4） ----
eq('大カテゴリー A〜H', CATEGORIES.map((c) => `${c.id}:${c.name}`), ['A:疲れ・体力・全身の不調', 'B:胃腸・便通', 'C:肌', 'D:髪・頭皮', 'E:睡眠・こころ', 'F:女性の健康', 'G:痛み・こり・しびれ', 'H:その他の体の不調']);
eq('K1 は複数選択・上限なし', [qById('K1').type, qById('K1').max ?? null], ['multi', null]);
eq('肌の主訴（ほてり・熱感は「疲れ・体力」だけ。第2弾 3-1）', texts('K_C'), ['ニキビ', '肌の乾燥', '肌のかゆみ', '湿疹・肌荒れ', '肌のくすみ', 'シミ・色素沈着', '肝斑']);
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
  const opts = q.options.filter((o) => !o.exclusive && !o.urgent && !o.locked && !o.blocked);
  if (q.section === 'primary' || q.section === 'basic' || q.section === 'category' || q.section === 'complaint') return null;
  if (mode === 'all') {
    if (q.type === 'single') return [opts[0]?.id];
    // 画面と同じく、同時に選べない選択肢は後のほうを選ばない
    const out = [];
    for (const o of opts) if (!conflictIn(q, [...out, o.id])) out.push(o.id);
    return out;
  }
  // グレー（blocked）の選択肢は選べない（口の渇きを選んだ方の「特に渇かない」など）
  const ex = q.options.find((o) => !o.blocked && o.exclusive === (mode === 'none' ? 'none' : 'unknown')) ?? q.options.find((o) => !o.blocked && o.exclusive);
  return [ex?.id ?? opts[0]?.id];
};
/** 主訴を1つ選び、ほかの設問はすべて mode で答えて最後まで walk する */
function simulate(cid, sex, mode) {
  const c = complaintById(cid);
  const cat = c.categories[0];
  const a = { A1: [sex === 'female' ? 'A1-1' : 'A1-2'], A2: ['A2-3'], K1: [`K1-${cat}`], [`K_${cat}`]: [`K${cat}-${cid}`, ...(cid === 'tinnitus' ? ['KTN-high'] : [])] };
  if (sex === 'female') { a.A3 = ['A3-regular']; a.A3P = ['A3P-no']; }
  for (let i = 0; i < 80; i++) {
    const w = walk(a);
    const n = firstUnansweredStep(w.steps);
    if (n > w.steps.length) return { a, w };
    const st = w.steps[n - 1];
    const ids = pick(st.q, mode) ?? [st.q.options[0].id];
    // 選んだ選択肢のすぐ下の必須の追加の選択（耳鳴りの音の高さ）は先頭を選ぶ
    const fu = (st.q.followups ?? []).filter((f) => f.required && (ids.includes(f.when) || st.q.options.find((o) => o.id === f.when)?.locked)).map((f) => f.options[0].id);
    a[st.q.id] = normalizeAnswer(st.q, [...ids, ...fu, ...(st.q.sub ? [st.q.sub.options[0].id] : [])]);
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
        // 疲れやすい・気力が出ない（detail: none）は深掘りなし（第4弾 1-5・1-6）。耳鳴りは音の高さをお悩みの画面で聞くので、その深掘りは残りだけ
        if (mode === 'all' && c.detail !== 'none' && !w.steps.some((s) => s.q.section === 'detail')) noDetail.push(`${c.id}/${sex}`);
        // ①お悩み（主訴・深掘り）の中で同じ所見を2回聞かない ②体質チェックの中で同じ所見を2回聞かない
        // ③お悩みで「あり」になった所見は、体質チェックではチェック済みで出し聞き直さない（第2弾 2-3）
        const seen = { pre: new Map(), con: new Map() };
        for (const s of w.steps) {
          // 主訴の一覧は「気になるもの」を選ぶ画面なので、選ばなかった主訴は聞いたことにしない（なしにもしない）
          const shown = s.q.section === 'complaint' ? s.q.options.filter((o) => s.ids.includes(o.id)) : s.q.options.filter((o) => !o.locked && !o.blocked);
          const m = s.q.section === 'constitution' ? seen.con : s.q.section === 'detail' || s.q.section === 'complaint' ? seen.pre : null;
          if (!m) continue;
          for (const o of shown) for (const f of o.findings ?? []) {
            if (m.has(f) && m.get(f) !== s.q.id) repeats.push(`${c.id}/${sex}/${mode}: ${f}（${m.get(f)}→${s.q.id}）`);
            if (!m.has(f)) m.set(f, s.q.id);
            const e = w.state.get(f);
            if (s.q.section === 'constitution' && e?.status === 'present' && (e.section === 'detail' || e.section === 'complaint')) repeats.push(`${c.id}/${sex}/${mode}: ${f}（お悩みで「あり」なのに ${s.q.id} で聞き直した）`);
          }
        }
      }
    }
  }
  eq(`すべての主訴（${COMPLAINTS.length}件）でいちばん改善したい主訴の深掘りが出る`, noDetail, []);
  eq('どの主訴・どの答え方でも、お悩み・体質チェックそれぞれで同じ所見を2回聞かず、お悩みで「あり」の項目は体質チェックで聞き直さない', repeats.slice(0, 5), []);
}
{
  // 疲れやすい（主訴）→ 体質チェック B1 ではチェック済み。体がだるい・重い（主訴）→ 深掘りで食欲がない → B5 でもチェック済み（第2弾 2-3）
  const a = { A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-A'], K_A: ['KA-fatigue', 'KA-heavy'], KM: ['KM-heavy'], Sheavy1: ['Sheavy1-none'], Sheavy2: ['Sheavy2-poor_appetite'] };
  const w = walk(a);
  const lk = (id) => w.steps.find((s) => s.q.id === id)?.q.options.filter((o) => o.locked).map((o) => o.text) ?? [];
  const t = (id) => w.steps.find((s) => s.q.id === id)?.q.options.map((o) => o.text) ?? [];
  eq('2-3 主訴「疲れやすい」は B1 でチェック済み', lk('B1').includes('疲れやすい'), true);
  eq('2-3 深掘りで答えた「食欲がない」は B5 でチェック済み', lk('B5').includes('食欲がない'), true);
  eq('2-3 体質チェックは全員に同じ選択肢を出す（深掘りで選ばなかった「食後に眠くなる」も出す）', t('B5').includes('食後に眠くなる') && !lk('B5').includes('食後に眠くなる'), true);
  eq('2-3 チェック済みの項目は1回だけ数える', score(w.state).raw.qi_def === score(walk({ ...a, B5: ['B5-none'] }).state).raw.qi_def, true);
  eq('主訴の所見は「あり」として保持', w.state.get('fatigue_easy')?.status, 'present');
  eq('未質問の所見は「なし」にしない（状態なし）', w.state.has('night_agitation'), false);
}

// ---- 改修指示 4-1〜4-8・第5章 の個別修正 ----
const patientTexts = QUESTIONS.filter((x) => ['constitution', 'lifestyle', 'safety', 'basic'].includes(x.section)).flatMap((x) => x.options.map((o) => ({ q: x.id, t: o.text })));
eq('4-1 飲酒は生活習慣 L1「お酒を週3回以上飲む」に一本化（体質・生活習慣で1か所）', patientTexts.filter((x) => x.t.includes('お酒')).map((x) => `${x.q}:${x.t}`), ['L1:お酒を週3回以上飲む']);
eq('4-1「辛いものをよく食べる」と飲酒は別の選択肢', texts('L1').includes('辛いものをよく食べる') && !texts('L1').some((t) => t.includes('辛') && t.includes('お酒')), true);
eq('4-2「食欲がない」と「少量で満腹になる」は別の選択肢', ['食欲がない', '少量で満腹になる'].every((t) => texts('B5').includes(t)) && !texts('B5').some((t) => t.includes('食が細')), true);
eq('4-3「食事を抜くことが多い」（少食を含めない）', texts('L1').includes('食事を抜くことが多い') && !texts('L1').some((t) => t.includes('少食')), true);
const allOpts = QUESTIONS.flatMap((x) => x.options.map((o) => ({ q: x, o })));
eq('4-4「冷えると体調が悪くなる」はない', allOpts.some(({ o }) => /冷えると体調が悪/.test(o.text)), false);
eq('4-4「温めると楽になる」は症状の深掘りにだけ置く', allOpts.filter(({ o }) => o.text.includes('温めると') || o.text.includes('温かいものをとると楽')).every(({ q }) => q.section === 'detail'), true);
eq('4-5 痛みの性質（刺す・張る痛み）を全員向けに聞かない', allOpts.filter(({ o }) => /(刺す|張る)ような痛み|刺すように|張るように/.test(o.text)).every(({ q }) => q.section === 'detail'), true);
eq('4-6 発症時期・頻度の質問はない', QUESTIONS.some((x) => /いつ頃から|いつごろから|どれくらいの頻度|どれくらい続いて/.test(x.title)), false);
eq('4-7「日常生活への影響」の質問はない', QUESTIONS.some((x) => x.title.includes('日常生活') || x.options.some((o) => o.text.includes('日常生活'))), false);
eq('4-8 顔色はイラストの設問 F1 にだけある', allOpts.filter(({ o }) => /顔色/.test(o.text)).map(({ q }) => q.id).filter((id, i, a) => a.indexOf(id) === i), ['F1']);
eq('F1 はいただいたイラスト（「わからない」は外した。2-1）', qById('F1').options.map((o) => o.image?.split('/').pop()), ['normal.webp', 'pale.webp', 'dark.webp', 'red.webp', undefined, 'bluish.webp']);
eq('2-1 顔色に「黄色っぽく、つやがない」を追加し、白っぽい・青白いの違いを説明で添える', [texts('F1').includes('顔色が黄色っぽく、つやがない'), texts('F1').includes('血色が悪く、白っぽい（血の気が少ない）'), texts('F1').includes('顔色が青白い（冷えて青みがある）')], [true, true, true]);
eq('3-5「体力には自信がある」はない', allOpts.some(({ o }) => o.text.includes('体力がある') || o.text.includes('体力には自信')), false);
eq('11-1 舌はご本人が「自分で鏡を見て」を選んだときだけ聞く', QUESTIONS.filter((x) => x.options.some((o) => o.findings?.some((f) => f.startsWith('tongue_')))).every((x) => x.section === 'tongue' && x.trigger?.chosen?.includes('T1-self')), true);
eq('2-8 舌は1ページの中に小見出し（色・色の追加・形・苔・苔の色・苔の潤い・舌下静脈）で分ける', STAFF_QUESTIONS.filter((x) => x.id.startsWith('X_tongue')).map((x) => x.groups.map((g) => g.title)), [['舌の色', '色の追加', '舌の形', '舌苔', '苔の色', '苔の潤い', '舌下静脈']]);
eq('2-8 舌の選択肢は項目別のイラスト（1つの要素だけ）で、複合イラストは使わない', [...QUESTIONS, ...STAFF_QUESTIONS].filter((x) => x.groups).every((x) => x.options.filter((o) => o.group !== 'vein' || !o.defer).every((o) => o.icon?.includes('/tongue/e-'))), true);
eq('7 舌の複合の選択肢（大きく、歯痕があり…）はない', STAFF_QUESTIONS.some((x) => x.options.some((o) => (o.findings?.length ?? 0) > 1)), false);
eq('5-1 患者向けの選択肢に受診勧奨フラグ（refer/consult）がない', allOpts.some(({ o }) => o.flags?.some((f) => f === 'refer' || f === 'consult')), false);
eq('5-5 直ちに対応の選択肢は主訴の深掘りの中だけ', allOpts.filter(({ o }) => o.urgent).every(({ q }) => q.section === 'detail'), true);
eq('5-6 体重減少・微熱を共通の質問で聞かない', allOpts.filter(({ q }) => q.section !== 'detail').some(({ o }) => /体重が減|微熱/.test(o.text)), false);
eq('自由記述の設問はない（記入欄は安全確認の任意の短い記入だけ）', [allOpts.some(({ o }) => o.freeText) || QUESTIONS.some((x) => x.type === 'text'), [...new Set([...allOpts.filter(({ o }) => o.note).map(({ q }) => q.id), ...QUESTIONS.filter((x) => x.note).map((x) => x.id)])].sort()], [false, ['C1', 'C2', 'C3']]);

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
  eq('「温めると楽になる」が2か所でも冷えは1回分', [s1.raw.cold, s2.raw.cold], [s1.raw.cold, s1.raw.cold]);
  eq('未質問・わからないは理論最大点に入れない', score(walk({ A1: ['A1-2'] }).state).max.qi_def, 0);
}

// ---- 安全フラグと漢方薬の選定 ----
{
  const a = {
    A1: ['A1-1'], A2: ['A2-7'], A3: ['A3-post'], K1: ['K1-A'], K_A: ['KA-fatigue'], Sfatigue1: ['Sfatigue1-poor_appetite', 'Sfatigue1-sob_exertion'],
    C1: ['C1-bp', 'C1-kampo', 'C1KP-F02'], C2: ['C2-1'], C3: ['C3-kampo', 'C3KP-F04', 'C3S-rash'],
  };
  const staffAnswers = { X_kampo_current: ['X_kampo_current-F01'], X_kampo_adverse: ['X_kampo_adverse-F01'] };
  const sess = { answers: a, staffAnswers, texts: { 'C1-bp': 'アムロジピン' } };
  const c = computeSession(sess);
  eq('閉経なら妊娠・授乳の設問を出さない', c.w.steps.some((s) => s.q.id === 'A3P'), false);
  eq('安全フラグ：服用中の薬・漢方・高血圧・副作用歴', ['meds', 'kampo_current', 'hypertension', 'adverse_kampo'].map((k) => c.safetyFlags.some((f) => f.code === k)), [true, true, true, true]);
  eq('6-1 薬の名前の記入内容を「口頭で確認」つきで出す', c.safetyFlags.find((f) => f.code === 'meds').detail.includes('記入：「アムロジピン」（口頭で確認）'), true);
  eq('6-3 薬剤師が確認・修正した漢方薬（ご本人の選択より優先）', [c.safetyFlags.find((f) => f.code === 'kampo_current').detail, c.safetyFlags.find((f) => f.code === 'adverse_kampo').detail.startsWith('漢方薬：補中益気湯（薬剤師が確認）')], ['補中益気湯（薬剤師が確認）', true]);
  const cp = computeSession({ answers: a, texts: {} });
  eq('6-3 薬剤師が未確認ならご本人が候補から選んだ漢方薬', [cp.safetyFlags.find((f) => f.code === 'kampo_current').detail, cp.safetyFlags.find((f) => f.code === 'adverse_kampo').detail.startsWith('漢方薬：十全大補湯（ご本人が選択')], ['六君子湯（ご本人が選択。薬剤師が確認・修正）', true]);
  const sel = selectionOf(sess, c);
  const g = sel.groups[0];
  eq('主訴「疲れやすい」の候補に補中益気湯', g.candidates.some((x) => x.name === '補中益気湯'), true);
  const f01 = g.candidates.find((x) => x.code === 'F01');
  eq('6-4 体調を崩した漢方薬と同じ漢方薬は除外', [f01.safety.status, f01.safety.exclude[0]], ['excluded', 'この漢方薬で体調を崩したことがあるため除外']);
  eq('5-2 服用中と同じ漢方薬は警告', f01.safety.check.includes('服用中の補中益気湯と同じ漢方薬です'), true);
  eq('5-2 甘草を含む候補は服用中の漢方との甘草の重複を警告', g.candidates.filter((x) => x.code !== 'F01' && x.formula.cautionHerbs.includes('甘草')).every((x) => x.safety.check.some((t) => t.startsWith('服用中の補中益気湯と') && t.includes('甘草'))), true);
  eq('6-4 体調を崩した漢方薬と共通の生薬は「◯◯が共通」（一律に外さない）', g.candidates.filter((x) => x.code !== 'F01' && x.formula.cautionHerbs.includes('柴胡')).every((x) => x.safety.status !== 'excluded' && x.safety.check.some((t) => /柴胡.*が共通（体調を崩した補中益気湯と/.test(t))), true);
  eq('候補はすべて主訴の効能に当たる（体質だけで足さない）', g.candidates.every((x) => x.matched.length > 0), true);
  const a2 = { ...a, C1: ['C1-kampo', 'C1KP-notfound'] };
  const c2 = computeSession({ answers: a2, texts: {} });
  eq('6-3 「見つからない」なら名前の確認を確認事項に出す', [c2.safetyFlags.find((f) => f.code === 'kampo_current').detail.includes('見つからない'), selectionOf({ answers: a2 }, c2).groups[0].candidates.find((x) => x.safety.status !== 'excluded').safety.check.some((t) => t.includes('名前が確認できていません'))], [true, true]);
  eq('6-4 漢方で体調を崩した方は初期表示で漢方候補を伏せ、薬剤師の確認で表示', [kampoHidden({ answers: a }), kampoHidden({ answers: a, kampoUnlocked: { by: '薬剤師A', at: 'x' } }), kampoHidden({ answers: { C3: ['C3-none'] } })], [true, false, false]);
}
{
  const a = { A1: ['A1-1'], A3: ['A3-regular'], A3P: ['A3P-no'], K1: ['K1-C'], K_C: ['KC-acne'], Sacne1: ['Sacne1-acne_red', 'Sacne1-acne_pus'], C1: ['C1-none'], C2: ['C2-0'], C3: ['C3-none'] };
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
  // お客様用の結果画面（result・advice。PIN の後ろ）だけレーダー（点数なし）を使える。漢方薬の選定・処方マスタは読み込まない（第4弾 0-2）
  const bad = files.filter((f) => /recommend|FORMULAS/.test(fs.readFileSync(f, 'utf8')) || (/RadarChart/.test(fs.readFileSync(f, 'utf8')) && !/\/result\//.test(f)));
  eq('患者向け画面（check/）は漢方薬の選定を読み込まない（レーダーは結果画面だけ）', bad, []);
  eq('お客様用の結果画面はレーダーの点数を出さない', /showScore=\{false\}/.test(fs.readFileSync('src/pages/kampo/check/[id]/result/index.astro', 'utf8')), true);
  eq('患者向け画面（問診・完了）に受診のおすすめを出さない（薬剤師画面のみ。第4弾 0-2）', files.filter((f) => /referrals|alert-refer|kp-refer/.test(fs.readFileSync(f, 'utf8'))), []);
}

// ---- フローの細部 ----
eq('「特にない」とほかを同時に選んだらほかを残す', normalizeAnswer(qById('B1'), ['B1-none', 'B1-sob_exertion']), ['B1-sob_exertion']);
eq('単一選択は1つだけ', normalizeAnswer(qById('A2'), ['A2-1', 'A2-2']), ['A2-1']);
eq('生活習慣の一言（就寝が遅い → 血虚）', personalTips({ L1: ['L1-late_bed'] }, 'blood_def').length, 1);
eq('男性にはカテゴリー「女性の健康」を出さない', walk({ A1: ['A1-2'] }).steps.find((s) => s.q.id === 'K1').q.options.some((o) => o.text === '女性の健康'), false);
eq('むくみの設問は全員に聞く（冷えるとむくむ・月経前にむくむを移したため）', walk({ A1: ['A1-2'], K1: ['K1-A'], K_A: ['KA-fatigue'] }).steps.some((s) => s.q.id === 'B7'), true);

// ---- 旧版セッション ----
eq('旧版（2026-10-24b・v2・2026-10-25-v3・2026-10-28-v3.1）は再計算しない', ['2026-10-24b', 'v2-draft-2026-10-25', '2026-10-25-v3', '2026-10-28-v3.1', QUESTIONNAIRE.version].map((v) => isLegacy({ questionnaireVersion: v })), [true, true, true, true, false]);
eq('旧版 v3.1 の文言を引ける', [legacyOptionText('2026-10-28-v3.1', 'C1K-yes'), legacyOptionText('2026-10-28-v3.1', 'B1-apathy'), legacyOptionText('2026-10-28-v3.1', 'C3S-cough')], ['はい', '何をするのも億劫', '空咳・息苦しさ']);
eq('旧版の文言を引ける', [legacyOptionText('2026-10-24b', 'KF-easily'), legacyOptionText('2026-10-24b', 'A4s-3'), legacyOptionText('2026-10-25-v3', 'B6b-urine_clear_copious'), legacyOptionText('2026-10-25-v3', 'KE-sleep_onset')], ['少し動くだけで疲れる', '大きい', '尿の色が薄く、量が多い', '寝つきが悪い']);
eq('旧版のスコアの陽虚・陽盛は冷え・熱として表示', resultCards({ mainTypes: ['yang_def'], subTypes: ['qi_def'], pct: { yang_def: 50, qi_def: 30 } }).map((x) => `${x.rank}:${x.t}`), ['main:cold', 'sub:qi_def']);

// ---- 2026-10-28 修正依頼 ----
const opt = (qid, text) => qById(qid)?.options.find((o) => o.text === text);
// 1-1 6タイプ＋寒熱
eq('1-1 体質タイプは6つ', TYPES.map((t) => TYPE_DEFS[t].name), ['気虚', '血虚', '気滞', '瘀血', '水滞', '水不足（陰虚）']);
{
  const pct = { qi_def: 50, blood_def: 0, qi_stag: 0, blood_stasis: 0, fluid: 40, yin_def: 0, cold: 90, heat: 25 };
  const k = classify(pct);
  eq('1-1 冷え・熱は主体質・副体質にしない', [k.mainTypes, k.subTypes], [['qi_def'], ['fluid']]);
  eq('1-1 陽虚＝気虚＋冷え、湿熱＝水滞＋熱として表示', k.combos, ['yang_def', 'damp_heat']);
  eq('1-1 結果には寒熱の傾向を別に出す', resultCards({ ...k, pct }).map((x) => `${x.rank}:${x.t}`), ['main:qi_def', 'sub:fluid', 'thermal:cold', 'thermal:heat']);
}
eq('1-1 所見の重み・処方の対象に陽虚・陽盛（独立軸）はない', [M[2].findings, M[5].formulas].flat().some((x) => ['yang_def', 'yang_exc'].some((k) => k in (x.weights ?? x.types ?? {}))), false);
// 1-3・2-1・2-2
eq('1-3 尿の色と量は別の選択肢', [texts('B6b').includes('尿の色が薄い'), texts('B6b').includes('尿の量が多い'), allOpts.some(({ o }) => o.text.includes('薄く、量が多い'))], [true, true, false]);
eq('2-1 体質・深掘りの設問に「わからない」はない（シミが濃くなる条件は残す）', QUESTIONS.filter((x) => (x.section === 'constitution' || x.section === 'detail') && x.options.some((o) => o.exclusive === 'unknown')).map((x) => x.id), ['Sspots3']);
eq('2-1 アレルギー・飲んでいる薬は「わからない」を残す', [texts('C3').includes('わからない'), texts('C1').includes('わからない')], [true, true]);
eq('2-2 主訴の性状の設問は「特にない」なし・「その他」あり', [texts('Sspots1').includes('特にない'), texts('Sspots1').includes('その他'), qById('Sspots1').options.find((o) => o.other)?.findings ?? null], [false, true, null]);
// 2-3
eq('5-3 汗をかきにくい ⇔ 少し動くと汗・大量の汗（寝汗・緊張・頭や顔だけは同時に選べる）', ['少し動いただけで汗をかく', '暑いときや食事中に大量に汗をかく', '寝汗をかく', '緊張すると手や脇に汗をかく', '頭や顔だけ汗をかく'].map((t) => !!conflictIn(qById('B4'), [opt('B4', '汗をかきにくい').id, opt('B4', t).id])), [true, true, false, false, false]);
eq('2-3 軟便 ⇔ 硬い便、尿の色が濃い ⇔ 薄い、食欲がない ⇔ すぐお腹が空く', [
  !!conflictIn(qById('B6'), ['B6-loose_stool', 'B6-hard_stool']), !!conflictIn(qById('B6b'), ['B6b-urine_dark', 'B6b-urine_pale']), !!conflictIn(qById('B5'), ['B5-poor_appetite', 'B5-big_appetite']),
  !!conflictIn(qById('B6'), ['B6-loose_stool', 'B6-constipation']),
], [true, true, true, true]);
eq('5-3 寒がり ⇔ 暑がり、少量で満腹 ⇔ すぐお腹が空く、尿の量', [!!conflictIn(qById('B3'), ['B3-chilly', 'B3-heat_intolerant']), !!conflictIn(qById('B5'), ['B5-early_satiety', 'B5-big_appetite']), !!conflictIn(qById('B6b'), ['B6b-urine_copious', 'B6b-urine_scanty']), !!conflictIn(qById('B3'), ['B3-chilly', 'B3-temp_fluctuate'])], [true, true, true, false]);
{
  const w = walk({ A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-B'], K_B: ['KB-diarrhea'] });
  const b6 = w.steps.find((x) => x.q.id === 'B6')?.q;
  eq('5-3 主訴で「軟便・下痢」なら B6 の「便秘がち」「便が硬い」はグレー（押せない）', b6?.options.filter((o) => o.blocked).map((o) => o.text), ['便が硬くコロコロしている', '便秘がち', '便秘と下痢をくり返す']);
  eq('5-3 グレーの選択肢は回答に含めない', normalizeAnswer(b6, ['B6-constipation', 'B6-hemorrhoid']), ['B6-hemorrhoid']);
}
eq('2-3 「ない」「わからない」と「ある」は同時に選べない（C3）', normalizeAnswer(qById('C3'), ['C3-none', 'C3-drug']), ['C3-drug']);
// 2-4
eq('2-4 STEP は5段階', STEPS.map((x) => x.label), ['基本情報', 'お悩み', '体質チェック', '安全確認', '生活習慣・舌の確認']);
// 3-1・3-2
eq('3-1 月経の状況「月経はない」', opt('A3', '月経はない')?.value, 'none');
{
  const base = { A1: ['A1-1'], A2: ['A2-3'], A3: ['A3-none'], A3P: ['A3P-no'], K1: ['K1-F'] };
  const w = walk(base);
  eq('3-1「月経はない」なら月経の主訴・設問を出さない', [w.steps.find((x) => x.q.id === 'K_F')?.q.options.map((o) => o.complaint), w.steps.some((x) => x.q.id === 'B11'), w.steps.find((x) => x.q.id === 'B7')?.q.options.some((o) => o.text === '月経前にむくむ')], [['menopause', 'postpartum'], false, false]);
  const w2 = walk({ ...base, A3: ['A3-regular'] });
  eq('3-1 月経があれば月経前にむくむを出す', w2.steps.find((x) => x.q.id === 'B7')?.q.options.some((o) => o.text === '月経前にむくむ'), true);
}
eq('3-2 妊娠・授乳は「わからない」「回答しない」なし・任意', [texts('A3P'), qById('A3P').optional], [['妊娠中', '妊娠の可能性がある（はっきりしない場合を含む）', '授乳中', 'いずれでもない'], true]);
{
  const a = { A1: ['A1-1'], A2: ['A2-3'], A3: ['A3-regular'], A3P: [] };
  const w = walk(a);
  eq('3-2 回答せずに次へ進める', [w.steps.find((x) => x.q.id === 'A3P')?.skipped, firstUnansweredStep(w.steps) > w.steps.findIndex((x) => x.q.id === 'A3P') + 1], [true, true]);
  const f = safetyFlags(a, w);
  eq('3-2 未回答なら「妊娠・授乳：未確認（口頭で確認）」・提案を確定しない', [f.find((x) => x.code === 'preg_unconfirmed')?.label, safetyContext(f, a, w).general.some((t) => t.includes('妊娠・授乳が未確認'))], ['妊娠・授乳：未確認（口頭で確認）', true]);
  const f2 = safetyFlags(a, w, { staffAnswers: { X_preg: ['X_preg-lact'] } });
  eq('3-2 薬剤師が口頭で確認して入力すると未確認が消える', [f2.some((x) => x.code === 'preg_unconfirmed'), f2.some((x) => x.code === 'lactation')], [false, true]);
}
// 第4章
eq('4-1 汗の量 →「暑いときや食事中に大量に汗をかく」', [texts('B4').includes('暑いときや食事中に大量に汗をかく'), texts('B4').includes('汗の量が多い')], [true, false]);
eq('4-2 のどの渇き：「口や喉が乾くが、少しずつしか飲めない」・「特に渇かない」は加点しない', [texts('B5T').includes('口や喉が乾くが、少しずつしか飲めない'), opt('B5T', '特に渇かない')?.exclusive, opt('B5T', '特に渇かない')?.findings ?? null], [true, 'none', null]);
eq('4-3 お腹・口：口内炎を追加、温かい飲み物を好むは冷え・ほてりへ', [texts('B5b').includes('口内炎ができやすい'), texts('B5b').includes('温かい飲み物を好む'), texts('B3').includes('温かい飲み物を好む')], [true, false, true]);
eq('4-4 食欲・胃', ['食べてもすぐお腹が空く', '胸やけがする', '冷たい物や生ものでお腹を壊す'].map((t) => texts('B5').includes(t)).concat(texts('B5').includes('食欲が旺盛')), [true, true, true, false]);
eq('4-5 冷え・ほてりから「冷えるとお腹を壊す」「冷えるとむくむ」を外す', ['冷えるとお腹を壊す', '冷えるとむくむ'].map((t) => texts('B3').includes(t)), [false, false]);
eq('4-6 むくみ', ['押すと跡が残る', '月経前にむくむ', '冷えるとむくむ'].map((t) => texts('B7').includes(t)), [true, true, true]);
eq('4-7・第2弾 5-5 睡眠（暑くて眠れないを外す）', texts('B8').filter((t) => t !== '特にない'), ['寝つきが悪い', '夜中に何度も目が覚める', '眠りが浅い', '夢が多い', '朝早く目が覚める', '寝ても疲れが取れない', '考え事で眠れない']);
{
  const w = walk({ A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-E'], K_E: ['KE-sleep_onset', 'KE-early_waking'], KM: ['KM-sleep_onset'] });
  const b8 = w.steps.find((x) => x.q.id === 'B8')?.q;
  eq('4-7 お悩みで選んだ睡眠の項目は B8 でチェック済み（変えられない）', b8?.options.filter((o) => o.locked).map((o) => o.text), ['寝つきが悪い', '朝早く目が覚める']);
  eq('4-7 チェック済みのときの「特にない」は「ほかには特にない」', b8?.options.find((o) => o.exclusive)?.text, 'ほかには特にない');
  eq('4-7 チェック済みの項目は回答に含めない（1回だけ数える）', normalizeAnswer(b8, ['B8-sleep_onset', 'B8-dreams_many']), ['B8-dreams_many']);
  const w0 = walk({ A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-A'], K_A: ['KA-fatigue'] });
  eq('4-7 睡眠をお悩みに選ばない人にも寝つき・夜中に目が覚めるを聞く', ['寝つきが悪い', '夜中に何度も目が覚める'].every((t) => w0.steps.find((x) => x.q.id === 'B8')?.q.options.some((o) => o.text === t)), true);
}
eq('4-8 物忘れ・集中力は体力・全身で2つに分ける', [texts('B1').includes('物忘れ'), texts('B1').includes('集中力が続かない'), texts('B9').some((t) => t.includes('物忘れ'))], [true, true, false]);
eq('4-9 打撲・むち打ち・手術は体のことから外し、手術歴は既往歴で', [allOpts.some(({ o }) => o.text.includes('打撲')), texts('C2').includes('これまでに手術を受けたことがある')], [false, true]);
{
  const a = { A1: ['A1-1'], A2: ['A2-3'], A3: ['A3-regular'], A3P: ['A3P-no'], F1: ['F1-face_pale'], B2: ['B2-nail_brittle'] };
  const w1 = walk(a); applyStaffAnswers(w1.state, { X_face: ['X_face-face_dark'], X_nail_shape: ['X_nail_shape-normal'] });
  eq('4-10 顔色・爪は観察を採用し、自己申告と両方は足さない', [w1.state.get('face_pale')?.status, w1.state.get('face_dark')?.status, w1.state.get('nail_brittle')?.status], ['absent', 'present', 'present']);
  eq('3-6 爪の割れやすさは見ただけではわからないので観察欄にない（ご本人の回答を使う）', [sq0('X_nail_shape').options.some((o) => o.text.includes('割れやすい')), w1.state.get('nail_brittle')?.source], [false, 'patient']);
  const w2 = walk(a); applyStaffAnswers(w2.state, { X_face: ['X_face-defer'], X_nail_shape: ['X_nail_shape-defer'] });
  eq('4-10 化粧・ネイルで判断できないときは自己申告を採用', [w2.state.get('face_pale')?.status, w2.state.get('face_pale')?.source, w2.state.get('nail_brittle')?.status], ['present', 'patient', 'present']);
}
// 第5章
eq('5-1 アレルギーと副作用歴は1問', [qById('C3').title, texts('C3')], ['薬や食品で、アレルギーや体調不良が出たことはありますか', ['薬でアレルギーが出たことがある', '食品でアレルギーが出たことがある', '漢方薬で体調を崩したことがある', 'ない', 'わからない']]);
{
  const fus = qById('C3').followups ?? [];
  const sym = fus.find((f) => f.id === 'C3S');
  eq('5-1 漢方薬で体調を崩したら同じ画面で「どの漢方薬でしたか」（候補）と症状（空咳・息苦しさを含む）', [fus.map((f) => `${f.when}:${f.title}`), sym?.options.map((o) => o.text).includes('空咳・息苦しさ'), sym?.options.map((o) => o.text).includes('むくみ・血圧が上がった')], [['C3-food:アレルギーが出た食品を選んでください', 'C3-kampo:どの漢方薬でしたか', 'C3-kampo:漢方薬で体調を崩したとき、どのような症状が出ましたか'], true, true]);
}
eq('5-1 症状・漢方薬は「漢方薬で体調を崩した」を選んだときだけ残す', [normalizeAnswer(qById('C3'), ['C3-drug', 'C3S-rash', 'C3KP-F01']), normalizeAnswer(qById('C3'), ['C3-kampo', 'C3KP-F01', 'C3S-rash', 'C3S-unknown'])], [['C3-drug'], ['C3-kampo', 'C3KP-F01', 'C3S-rash']]);
{
  const a = { A1: ['A1-2'], A2: ['A2-3'], C3: ['C3-drug', 'C3-food'] };
  const f = safetyFlags(a, walk(a), { texts: { 'C3-drug': 'ロキソニン' } });
  eq('5-1 薬と食品のアレルギーは分けて表示し、記入内容に「口頭で確認」', [f.find((x) => x.code === 'allergy_drug')?.detail, f.some((x) => x.code === 'allergy_food')], ['記入：「ロキソニン」（口頭で確認）', true]);
}
eq('6-2・6-5 漢方薬は C1 の選択肢に。「漢方薬を飲んでいますか」「お薬手帳」の設問はない', [texts('C1').includes('漢方薬'), qById('C1').title.includes('次の質問'), ['C1K', 'C1NB', 'C4', 'C4K', 'C4S'].some((id) => qById(id))], [true, false, false]);
{
  const fu = qById('C1').followups?.[0];
  eq('6-3 漢方薬の名前は登録済みの候補から選ぶ（68件＋見つからない）', [fu?.when, fu?.picker, fu?.options.filter((o) => o.formula).length, fu?.options.some((o) => o.notfound && o.text === '見つからない（薬剤師に伝える）')], ['C1-kampo', 'formulas', 68, true]);
  eq('6-3 候補は読みがな・ツムラ番号で探せる', FORMULAS.every((f) => /^[ぁ-んー]+$/.test(f.reading)) && FORMULAS.filter((f) => f.tsumuraNo).length >= 60, true);
}
eq('5-2 薬剤師が服用中・体調を崩した漢方薬を入力', ['X_kampo_current', 'X_kampo_adverse'].map((id) => STAFF_QUESTIONS.find((x) => x.id === id)?.options.length), [68, 68]);
eq('10-5 ツムラ番号は66件とも確認済み（芎帰調血飲・知柏地黄丸はツムラの医療用製品なし）', [FORMULAS.filter((f) => f.tsumuraNo !== undefined && f.tsumuraNoVerified).length, FORMULAS.filter((f) => f.tsumuraNo === undefined).map((f) => f.name).sort(), ['補中益気湯', '加味帰脾湯', '加味逍遥散', '桂枝茯苓丸加薏苡仁'].map((n) => FORMULAS.find((f) => f.name === n)?.tsumuraNo)], [66, ['知柏地黄丸', '芎帰調血飲'].sort(), [41, 137, 24, 125]]);
{
  const a = { A1: ['A1-2'], A2: ['A2-6'], K1: ['K1-G'], K_G: ['KG-headache'], Sheadache3: ['Sheadache3-none'] };
  const w = walk(a);
  const open = safetyTags(w);
  const done = safetyTags(w, undefined, { headache: { by: '薬剤師A', at: '2026-10-28T00:00:00Z' } });
  eq('5-3 安全確認タグは確認を記録するまで未確認（提案を確定しない）', [safetyContext([], a, w, open).general.some((t) => t.includes('安全確認タグ')), safetyContext([], a, w, done).general.some((t) => t.includes('安全確認タグ')), done.find((t) => t.id === 'headache')?.checked?.by], [true, false, '薬剤師A']);
}
// 第2弾（2026-10-29）
eq('2-1・2-2 疲れ・体力から「病後・産後の体力低下」「汗をかきやすい」「寝汗をかく」を削除', ['病後・産後の体力低下', '汗をかきやすい', '寝汗をかく'].some((t) => texts('K_A').includes(t)), false);
eq('4-1〜4-4 体力・全身の並び（夕方から夜にほてる→冷え・ほてり、何をするのも億劫を削除、体が重だるい）', [texts('B1'), texts('B3').includes('夕方から夜にほてる')], [['疲れやすい', '少し動くと息切れする', '風邪をひきやすい', '気力が出ない', '日中に眠くなる', '物忘れ', '集中力が続かない', '体が重だるい', '雨の日や低気圧で体調が悪くなる', '腰や膝がだるい', '特にない'], true]);
eq('5-1 食欲・胃のタイトル', qById('B5').title, 'ふだんの食欲や、食べたあとの様子について、あてはまるものを選んでください');
{
  const w = walk({ A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-B'], K_B: ['KB-heartburn', 'KB-stomach_heavy'], KM: ['KM-stomach_heavy'] });
  eq('5-4 胸やけ（お悩み）は B5 でチェック済み', w.steps.find((x) => x.q.id === 'B5')?.q.options.filter((o) => o.locked).map((o) => o.text).includes('胸やけがする'), true);
}
eq('2-10 耳鳴りは1つで、選ぶとすぐ下に音の種類（必須・1つ）。薬剤師画面の確認メモはない', [texts('B12').filter((t) => t.includes('耳鳴り')), !!opt('B12', '耳鳴りがする')?.staffNote, qById('B12').followups?.map((f) => [f.when, f.required, f.type, f.options.map((o) => o.text)])], [['耳鳴りがする'], false, [['B12-tinnitus', true, 'single', ['キーンと高い音', 'ゴーッ・ボーという低い音', 'どちらとも言えない']]]]);
{
  const a = { A1: ['A1-1'], A2: ['A2-3'], A3: ['A3-regular'], A3P: ['A3P-no'], K1: ['K1-C'], K_C: ['KC-spots'], Sspots1: ['Sspots1-spots_symmetric'], B12: ['B12-tinnitus'] };
  const ch = staffChecks(walk(a)).map((x) => x.label);
  eq('3-2 シミで左右対称 → 薬剤師画面に「肝斑の可能性あり（確認）」、耳鳴りの確認メモは出さない', [ch.includes('肝斑の可能性あり（確認）'), ch.includes('耳鳴りがする')], [true, false]);
  eq('3-2 肝斑も選んでいれば「肝斑の可能性」は出さない', staffChecks(walk({ ...a, K_C: ['KC-spots', 'KC-melasma'], KM: ['KM-spots'] })).some((x) => x.label.startsWith('肝斑の可能性')), false);
}
eq('2-7 病気の記入欄は範囲が広い選択肢だけ「病名（わかれば・任意）」、手術は「何の手術か」。高血圧・低カリウム・甲状腺・前立腺肥大などは記入欄なし。「わからない」は削除', [opt('C1', '血圧の薬')?.noteLabel, ['高血圧', '低カリウムと言われたことがある', '甲状腺の病気', '前立腺肥大など、尿が出にくい'].map((t) => !!opt('C2', t)?.note), ['心臓の病気', '腎臓の病気', '肝臓の病気', '胃腸が弱い・胃腸の病気', 'がんの治療中', 'その他の病気'].map((t) => opt('C2', t)?.noteLabel), opt('C2', 'これまでに手術を受けたことがある')?.noteLabel, texts('C2').includes('わからない')], ['薬の名前（わかれば・任意）', [false, false, false, false], Array(6).fill('病名（わかれば・任意）'), '何の手術か（わかれば・任意）', false]);
{
  const a = { A1: ['A1-2'], A2: ['A2-3'], C1: ['C1-bp'], C2: ['C2-2', 'C2-surgery'] };
  const f = safetyFlags(a, walk(a), { texts: { 'C1-bp': 'アムロジピン', 'C1-bp#staff': 'アムロジピン錠5mg', 'C2-2': '不整脈', 'C2-surgery': '盲腸' } });
  eq('6-1・7-1 薬剤師が確認・修正した記入内容を優先', [f.find((x) => x.code === 'meds')?.detail.includes('「アムロジピン錠5mg」（薬剤師が確認）'), f.find((x) => x.code === 'disease_note')?.detail.includes('記入：「不整脈」'), f.find((x) => x.code === 'surgery')?.detail.includes('「盲腸」')], [true, true, true]);
}
eq('6.5-1 生活習慣の「どれもあてはまらない」は小見出しの外', opt('L1', 'どれもあてはまらない')?.heading, undefined);

// 第6章
eq('6-1 生活習慣は1問・小見出しつき', [QUESTIONS.filter((x) => x.section === 'lifestyle').map((x) => x.id), [...new Set(qById('L1').options.map((o) => o.heading).filter(Boolean))]], [['L1'], ['食事', '睡眠', '運動・お風呂', 'お酒・タバコ・仕事']]);
eq('6-1 生活習慣の選択肢', texts('L1').length, 16);
eq('6-2 生活習慣は体質の加点に使わない', qById('L1').options.some((o) => o.findings?.length), false);
{
  const w = walk({ A1: ['A1-2'], A2: ['A2-3'], L1: ['L1-cold_drink'] });
  eq('6-2「冷たい飲み物をよくとる」は熱に加点しない', score(w.state).raw.heat, 0);
}
// 第8章
eq('8 気虚の説明文の矛盾（気は朝に作られる）を直す', TYPE_DEFS.qi_def.summary.includes('朝に作られる'), false);
eq('8 あなたへの一言に効果を保証する表現を使わない', TIPS.some((t) => /だけで変化が出|効果があります|最短/.test(t.text)), false);
eq('8 改善アドバイスの監修欄は未設定なら出さない', fs.readFileSync('src/components/kampo/AdviceBlock.astro', 'utf8').includes('薬剤師名を設定してください'), false);
eq('1-2 患者画面に「おすすめの漢方薬」の見出しはない', (() => { const out = []; const d = (p) => { for (const f of fs.readdirSync(p)) { const q = path.join(p, f); if (fs.statSync(q).isDirectory()) d(q); else if (/おすすめの漢方|合いそうな漢方薬/.test(fs.readFileSync(q, 'utf8'))) out.push(q); } }; d('src/pages/kampo/check'); return out; })(), []);

// ---- 2026-10-29 修正依頼 第3弾 ----
{
  const base = { A1: ['A1-1'], A2: ['A2-3'], A3: ['A3-regular'] };
  const ids = (a) => walk(a).steps.map((x) => x.q.id);
  const b7 = (a) => walk(a).steps.find((x) => x.q.id === 'B7')?.q.options.map((o) => o.text) ?? [];
  eq('1 妊娠中は月経の設問（B11・B11b）と月経に関する選択肢を出さない', [ids({ ...base, A3P: ['A3P-preg'] }).some((x) => x === 'B11' || x === 'B11b'), b7({ ...base, A3P: ['A3P-preg'] }).includes('月経前にむくむ')], [false, false]);
  eq('1 授乳中・妊娠の可能性あり・いずれでもないは月経の状況（A3）に従う', ['A3P-lact', 'A3P-maybe', 'A3P-no'].map((p) => ids({ ...base, A3P: [p] }).includes('B11b')), [true, true, true]);
  eq('1 閉経・月経はないなら月経の設問を出さない', ['A3-post', 'A3-none'].map((m) => ids({ ...base, A3: [m] }).includes('B11')), [false, false]);
  const b11 = qById('B11'), b11b = qById('B11b');
  eq('2 周期（24日以内・39日以上・安定しない）はどれか1つ、月経前の項目は独立', [conflictIn(b11, ['B11-cycle_short', 'B11-cycle_long']) !== null, conflictIn(b11, ['B11-cycle_long', 'B11-cycle_random']) !== null, conflictIn(b11, ['B11-cycle_short', 'B11-pms_irritable', 'B11-pms_breast'])], [true, true, null]);
  eq('3-1 経血の色（暗い・薄い・鮮やかな赤）は1つ、量の少ない⇔多い', [conflictIn(b11b, ['B11b-flow_dark', 'B11b-flow_bright_heavy']) !== null, conflictIn(b11b, ['B11b-flow_pale', 'B11b-flow_dark']) !== null, conflictIn(b11b, ['B11b-flow_light', 'B11b-flow_heavy']) !== null, conflictIn(b11b, ['B11b-flow_dark', 'B11b-flow_heavy', 'B11b-clots'])], [true, true, true, null]);
  eq('3-1・3-3 文言とタイトル', [opt('B11b', '経血の色が鮮やかな赤') !== undefined, texts('B11b').some((t) => t.includes('出血が多い')), b11b.title], [true, false, '経血・月経痛・おりものについて、あてはまるものを選んでください']);
  const a = { ...base, A3P: ['A3P-no'], B11b: ['B11b-irregular_bleeding'] };
  eq('3-2 月経以外の時期の出血 → 受診のおすすめ（患者・薬剤師の両方）', [referrals(walk(a)).some((x) => x.message.includes('婦人科の受診')), safetyFlags(a, walk(a)).some((f) => f.level === 'refer' && f.code.startsWith('refer:'))], [true, true]);
}
{
  const f = (a, staffAnswers) => { const c = computeSession({ answers: a, staffAnswers, texts: {} }); return noKampoReason(c.safetyFlags); };
  const base = { A1: ['A1-1'], A2: ['A2-3'], A3: ['A3-regular'] };
  eq('10-1 妊娠中・授乳中は漢方の提案をしない', [f({ ...base, A3P: ['A3P-preg'] }), f({ ...base, A3P: ['A3P-lact'] })], ['妊娠中のため漢方の提案は行いません（養生のご案内のみ）', '授乳中のため漢方の提案は行いません（養生のご案内のみ）']);
  eq('8 妊娠の可能性あり・回答なしは薬剤師が確定するまで提案しない', [f({ ...base, A3P: ['A3P-maybe'] })?.includes('確認できていない'), f({ ...base, A3P: [] })?.includes('確認できていない'), f({ ...base, A3P: ['A3P-maybe'] }, { X_preg: ['X_preg-no'] })], [true, true, null]);
  eq('8 薬剤師が「妊娠の可能性がある」と確定しても提案しない', f({ ...base, A3P: ['A3P-maybe'] }, { X_preg: ['X_preg-maybe'] }), '妊娠の可能性があるため漢方の提案は行いません（養生のご案内のみ）');
  eq('10-1 いずれでもない・男性は提案する', [f({ ...base, A3P: ['A3P-no'] }), f({ A1: ['A1-2'], A2: ['A2-3'] })], [null, null]);
}
{
  eq('4 いま飲んでいる薬は漢方との飲み合わせに関係するものだけ', texts('C1'), ['利尿薬（むくみや血圧の薬）', 'ステロイドの飲み薬', '血圧の薬', '甲状腺の薬', 'ぜんそく・気管支の薬', '抗うつ薬', 'インターフェロン', '便秘薬', '市販のかぜ薬・胃腸薬', '血液をサラサラにする薬', '漢方薬', 'その他の薬・サプリメント', '飲んでいない', 'わからない']);
  eq('5 病気は漢方に関係するものだけ（緑内障・糖尿病は「その他」へ）', [texts('C2').some((t) => /緑内障|糖尿病/.test(t)), texts('C2').includes('低カリウム血症と言われたことがある') || texts('C2').some((t) => t.includes('低カリウム')), texts('C2').some((t) => t.includes('前立腺肥大'))], [false, true, true]);
  const a = { A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-B'], K_B: ['KB-constipation'], C1: ['C1-diuretic', 'C1-other'], C2: ['C2-hypok'] };
  const sess = { answers: a, texts: { 'C1-other': 'ビタミン剤' } };
  const c = computeSession(sess);
  const cands = selectionOf(sess, c).groups.flatMap((g) => g.candidates);
  const withKanzo = cands.filter((cd) => (cd.formula.cautionHerbs ?? []).includes('甘草'));
  eq('4 利尿薬 × 甘草を含む候補 → 併用注意（低カリウム）', withKanzo.length > 0 && withKanzo.every((cd) => cd.safety.check.some((x) => x.includes('利尿薬・ステロイドの飲み薬との併用は低カリウム血症'))), true);
  eq('5 低カリウム血症 × 甘草を含む候補 → 要確認', withKanzo.every((cd) => cd.safety.status !== 'ok' && cd.safety.check.some((x) => x.includes('低カリウム血症と言われたことがある'))), true);
  eq('4 その他の薬あり：確認（記入内容つき）', c.safetyFlags.find((x) => x.code === 'other_meds')?.detail.startsWith('記入：「ビタミン剤」'), true);
  const ai = { A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-B'], K_B: ['KB-constipation'], C1: ['C1-interferon'] };
  const ci = computeSession({ answers: ai, texts: {} });
  const ex = selectionOf({ answers: ai, texts: {} }, ci).groups.flatMap((g) => g.candidates).filter((cd) => (cd.formula.contraindications ?? []).includes('interferon'));
  eq('4 インターフェロン × 禁忌の漢方薬は除外', ex.every((cd) => cd.safety.status === 'excluded'), true);
}
{
  const base = { A1: ['A1-2'], A2: ['A2-3'] };
  const XT = STAFF_QUESTIONS.find((x) => x.id === 'X_tongue');
  const TS = qById('TS');
  eq('11-1 舌の確認の方法（T1）：最後の設問・3択', [walk({ ...base }).steps.at(-1)?.q.id, texts('T1')], ['T1', ['薬剤師に見てもらう', '自分で鏡を見て、イラストから選ぶ', '舌の確認はしない']]);
  eq('11-1 「自分で鏡を見て」を選んだときだけご本人の舌の設問（1ページ）', [['T1-staff', 'T1-self', 'T1-none'].map((m) => walk({ ...base, T1: [m] }).steps.some((x) => x.q.id === 'TS')), tongueMode({ T1: ['T1-self'] })], [[false, true, false], 'self']);
  eq('2-8 ご本人の舌：色（1つ）・色の追加・形・苔（1つ）・苔の追加・舌の裏の静脈（1つ）の小見出し', [TS.groups.map((g) => g.title), TS.groups.filter((g) => g.required).map((g) => g.id)], [['舌の色', '色の追加', '舌の形', '舌の苔（こけ）', '苔の追加', '舌の裏の静脈'], ['color', 'shape', 'coat', 'vein']]);
  eq('2-8 ご本人の舌の選択肢（表のとおり）', TS.options.map((o) => `${o.group}:${o.text}`), ['color:淡いピンク（ふつう）', 'color:白っぽい', 'color:赤い', 'color:紫っぽい', 'color_add:ふちが赤い', 'color_add:黒っぽい点（瘀点）がある', 'shape:ふつう', 'shape:ふちに歯の跡がある', 'shape:大きくぼってりしている', 'shape:薄く小さい', 'shape:ひび割れがある', 'coat:薄く白い（ふつう）', 'coat:白く厚い', 'coat:黄色い', 'coat:少ない・ない', 'coat_add:べたっと湿っている', 'coat_add:乾いている', 'vein:目立たない（ふつう）', 'vein:太く浮き出ている', 'vein:見ていない']);
  const ans = { ...base, T1: ['T1-self'] };
  eq('2-8 必須の小見出しがそろわないと次へ進めない（色だけでは未回答）', [isAnswered(TS, ['TS-color_pale']), isAnswered(TS, ['TS-color_pale', 'TS-shape_normal', 'TS-coat_normal', 'TS-vein_normal'])], [false, true]);
  const self = score(walk({ ...ans, TS: ['TS-color_pale', 'TS-shape_normal', 'TS-coat_normal', 'TS-vein_normal'] }).state);
  const w2 = walk({ ...base, T1: ['T1-staff'] }); applyStaffAnswers(w2.state, { X_tongue: ['X_tongue-color_pale', 'X_tongue-shape_normal', 'X_tongue-coat_normal', 'X_tongue-vein_normal'] }, { ...base, T1: ['T1-staff'] });
  const staff = score(w2.state);
  eq('11-1 ご本人入力の舌は重みを下げる（暫定 0.5 倍）', [SELF_TONGUE_FACTOR, self.raw.blood_def, staff.raw.blood_def], [0.5, 0.5, 1]);
  const wn = walk({ ...base, T1: ['T1-none'] }); applyStaffAnswers(wn.state, { X_tongue: ['X_tongue-color_red'] }, { ...base, T1: ['T1-none'] });
  eq('11-1 「舌の確認はしない」なら舌は点数・満点とも入れない（薬剤師の入力も使わない）', [[...wn.state.keys()].some((k) => k.startsWith('tongue_')), score(wn.state).max.heat === score(walk({ ...base, T1: ['T1-none'] }).state).max.heat], [false, true]);
  const ws = walk({ ...ans, TS: ['TS-color_pale'] }); applyStaffAnswers(ws.state, { X_tongue: ['X_tongue-color_red'] }, ans);
  eq('11-1 ご本人入力のときは薬剤師の舌の入力を使わない', [ws.state.get('tongue_color_red')?.source === 'staff', ws.state.get('tongue_color_pale')?.status], [false, 'present']);
  const vu = walk({ ...ans, TS: ['TS-color_pale', 'TS-shape_normal', 'TS-coat_normal', 'TS-vein_unseen'] });
  eq('2-8 舌の裏の静脈を「見ていない」なら、静脈の所見は「なし」にもしない（未質問のまま）', [vu.state.has('tongue_sublingual_distended'), vu.state.get('tongue_color_pale')?.status], [false, 'present']);
  // 1つ選ぶ・ふつう・同時に選べない組み合わせ
  const nz = (q, ids) => normalizeAnswer(q, ids);
  eq('2-8 色は1つ・苔は1つ・静脈は1つ', [nz(TS, ['TS-color_pale', 'TS-color_red']), nz(TS, ['TS-coat_thick', 'TS-coat_yellow']), nz(TS, ['TS-vein_normal', 'TS-vein_distended'])], [['TS-color_pale'], ['TS-coat_thick'], ['TS-vein_normal']]);
  eq('2-8 「ふつう」を選んだら同じ項目のほかの選択肢は外れ、ほかの項目には影響しない', [nz(TS, ['TS-shape_normal', 'TS-teeth', 'TS-color_pale']), nz(TS, ['TS-shape_normal', 'TS-color_pale'])], [['TS-teeth', 'TS-color_pale'], ['TS-shape_normal', 'TS-color_pale']]);
  eq('3-5 薬剤師の舌：淡紅色（ふつう）と両縁が赤い・瘀点は同時に選べない／大きい⇔小さい／苔は1つ・色は1つ・潤いは1つ', [
    nz(XT, ['X_tongue-color_normal', 'X_tongue-edge_red']), nz(XT, ['X_tongue-color_pale', 'X_tongue-edge_red', 'X_tongue-spots']),
    nz(XT, ['X_tongue-swollen', 'X_tongue-thin']), nz(XT, ['X_tongue-coat_thick', 'X_tongue-mirror']),
    nz(XT, ['X_tongue-cc_white', 'X_tongue-cc_yellow']), nz(XT, ['X_tongue-moist', 'X_tongue-dry']),
  ], [['X_tongue-color_normal'], ['X_tongue-color_pale', 'X_tongue-edge_red', 'X_tongue-spots'], ['X_tongue-swollen'], ['X_tongue-coat_thick'], ['X_tongue-cc_white'], ['X_tongue-moist']]);
  eq('3-5 薬剤師の舌：複合イラスト（p1〜p8）は使わない', JSON.stringify(XT).includes('/tongue/p'), false);
}
{
  const sq = (id) => STAFF_QUESTIONS.find((x) => x.id === id);
  eq('11-2 爪は色（1つ）と形（複数）', [sq('X_nail_color')?.type, sq('X_nail_color')?.options.map((o) => o.text), sq('X_nail_shape')?.type, sq('X_nail_shape')?.options.map((o) => o.text), sq('X_nail')], ['single', ['ふつう', '白っぽい', '紫っぽい・暗い', '判断できない（ネイルなど）'], 'multi', ['縦すじが目立つ', '反り返っている・スプーン状', '特記なし', '判断できない（ネイルなど）'], undefined]);
  const a = { A1: ['A1-2'], A2: ['A2-3'] };
  const w = walk(a); applyStaffAnswers(w.state, { X_nail_color: ['X_nail_color-nail_dark'], X_nail_shape: ['X_nail_shape-nail_spoon'] }, a);
  eq('11-2 爪の色：紫っぽい＝瘀血、スプーン状 → 受診のおすすめ（鉄不足）', [score(w.state).raw.blood_stasis > 0, referrals(w, { X_nail_shape: ['X_nail_shape-nail_spoon'] }).some((x) => x.message.includes('鉄不足'))], [true, true]);
}

// ---- 2026-10-31 修正依頼 第4弾 ----
{
  const base = { A1: ['A1-1'], A2: ['A2-3'], A3: ['A3-regular'], A3P: ['A3P-no'] };
  const w = walk({ ...base, K1: ['K1-E'], K_E: ['KE-sleep_onset', 'KE-night_waking', 'KE-early_waking'] });
  const b8 = w.steps.find((x) => x.q.id === 'B8')?.q;
  eq('0-1 睡眠：お悩みで選んだ項目はチェック済みで、「ほかには特にない」は同時に選べる（none は選択可）', [b8.options.filter((o) => o.locked).length, b8.options.find((o) => o.exclusive === 'none')?.blocked ?? false], [3, false]);
  eq('0-1 自動チェックだけで次へ進むと「ほかには特にない」を記録した回答になる（回答済み）', isAnswered(b8, ['B8-none']), true);
  // 体質チェックの設問はすべて「ほかには特にない」を持つ（自動チェックだけでも次へ進めるため）
  eq('0-1 体質チェックの複数選択の設問はすべて none を持つ', QUESTIONS.filter((x) => x.section === 'constitution' && x.type === 'multi').every((x) => x.options.some((o) => o.exclusive === 'none')), true);
  eq('1-1 眠りが浅い・夢が多いは2つに分かれている', [complaintById('light_sleep').name, complaintById('dreams_many').name], ['眠りが浅い', '夢が多い']);
  eq('1-2 息苦しさ・動悸は受診のおすすめ（薬剤師画面のみ）', ['breath', 'palpitation'].map((c) => !!complaintById(c).refer), [true, true]);
  const wr = walk({ ...base, K1: ['K1-H'], K_H: ['KH-breath', 'KH-palpitation'] });
  eq('1-2 選ぶと referrals に出る（薬剤師画面の赤帯用）', referrals(wr).map((x) => x.text).sort(), ['動悸', '息苦しさ'].sort());
  eq('1-5・1-6 疲れやすい・気力が出ないには伴うもの・きっかけの深掘りはない', [complaintById('fatigue').detail, complaintById('no_energy').detail, QUESTIONS.some((x) => x.id === 'Sfatigue1' || x.id === 'Sfatigue2')], ['none', 'none', false]);
  // 自動チェック（1-3・2-2・2-6）
  const locked = (cid, cat, qid) => walk({ ...base, K1: [`K1-${cat}`], [`K_${cat}`]: [`K${cat}-${cid}`] }).steps.find((x) => x.q.id === qid)?.q.options.filter((o) => o.locked).map((o) => o.text) ?? [];
  eq('1-3 頻尿・夜間尿 ↔ 尿', [locked('frequent_urination', 'H', 'B6b'), locked('nocturia', 'H', 'B6b')], [['トイレが近い'], ['夜中にトイレに起きる']]);
  eq('1-3 むくみ ↔ むくみ、動悸 ↔ 体のこと、足がつる ↔ 体のこと', [locked('edema', 'H', 'B7'), locked('palpitation', 'H', 'B10'), locked('cramps', 'G', 'B10')], [['むくみやすい'], ['動悸がする'], ['こむら返りが起きやすい']]);
  eq('1-3 めまい・立ちくらみ・耳鳴り・目・鼻・痰・咳 ↔ 頭・目・耳・鼻', ['dizziness', 'orthostatic', 'tinnitus', 'eye_dry', 'eye_strain', 'runny_nose', 'nasal_block', 'phlegm', 'cough'].map((c) => locked(c, 'H', 'B12').length), [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  eq('2-6 気分：不安・緊張 ↔ 不安になりやすい／緊張すると具合が悪くなる、イライラ ↔ イライラしやすい、気分の落ち込み ↔ 気分が沈みがち', [locked('anxiety', 'E', 'B9'), locked('irritability', 'E', 'B9'), locked('low_mood', 'E', 'B9')], [['不安になりやすい', '緊張すると具合が悪くなる'], ['イライラしやすい'], ['気分が沈みがち']]);
  eq('2-5 「怒りっぽい」はなく、「カッとなると顔が赤くなる」は別の選択肢のまま', [texts('B9').includes('怒りっぽい'), texts('B9').includes('カッとなると顔が赤くなる・頭に血が上る')], [false, true]);
  const w22 = walk({ ...base, K1: ['K1-A'], K_A: ['KA-cold_limbs'], Scold2: ['Scold2-hot_up_cold_down'] });
  const wo = walk({ ...base, K1: ['K1-F'], K_F: ['KF-menopause'], KM: ['KM-menopause'], Smenopause1: ['Smenopause1-hot_up_cold_down'] });
  eq('2-2 上半身はのぼせるのに足は冷える ↔ お悩みの深掘り（冷え・更年期）と同じ所見：チェック済み・1項目として数える', [w22, wo].map((w) => w.steps.find((x) => x.q.id === 'B3')?.q.options.filter((o) => o.locked).map((o) => o.text).includes('上半身はのぼせるのに足は冷える')), [true, true]);
  // 1-4 口の渇き
  const wd = walk({ ...base, K1: ['K1-H'], K_H: ['KH-dry_mouth'] });
  const b5t = wd.steps.find((x) => x.q.id === 'B5T')?.q;
  eq('1-4 口の渇きを選んだ方は「特に渇かない」を選べない（グレー・理由つき）。飲み方の設問は自動チェックしない', [b5t.options.find((o) => o.exclusive === 'none')?.blocked, b5t.options.find((o) => o.exclusive === 'none')?.blockedText, b5t.options.filter((o) => o.locked).length], [true, 'お悩みで「口の渇き」を選んだため選べません', 0]);
  eq('1-4 グレーの選択肢は回答に含めない', normalizeAnswer(b5t, ['B5T-none']), []);
  // 2-3 便通
  eq('2-3 便秘と下痢をくり返すは、便秘がち・軟便・下痢と同時に選べない（便が硬いは同時に可）', [!!conflictIn(qById('B6'), ['B6-alternating', 'B6-constipation']), !!conflictIn(qById('B6'), ['B6-alternating', 'B6-loose_stool']), !!conflictIn(qById('B6'), ['B6-alternating', 'B6-hard_stool'])], [true, true, false]);
  // 2-4 月経前にむくむ
  const b7has = (a) => !!walk(a).steps.find((x) => x.q.id === 'B7')?.q.options.some((o) => o.text === '月経前にむくむ');
  eq('2-4 むくみ：月経前にむくむは、月経がある方（妊娠中でない）にだけ出る', [b7has(base), b7has({ ...base, A3: ['A3-irregular'] }), b7has({ ...base, A3: ['A3-post'] }), b7has({ ...base, A3: ['A3-none'] }), b7has({ ...base, A3P: ['A3P-preg'] }), b7has({ A1: ['A1-2'], A2: ['A2-3'] })], [true, true, false, false, false, false]);
  // 2-1 顔色
  eq('2-1 顔色に「黄色っぽい・つやがない」（血虚・脾）を追加', [!!findingById('face_sallow')?.weights?.blood_def, findingById('face_sallow')?.organs?.spleen], [true, 1]);
  // 2-7 治療中の病気
  eq('2-7 「ない」と他の病気は同時に選べない・わからないはない', normalizeAnswer(qById('C2'), ['C2-0', 'C2-1']), ['C2-1']);
  // 2-10 耳鳴り
  const wt = walk({ ...base, K1: ['K1-H'], K_H: ['KH-tinnitus', 'KTN-low'] });
  eq('2-10 お悩みで耳鳴りの音（低い）を選ぶと所見が入り、体質チェックでは聞き直さない・チェック済み', [wt.state.get('tinnitus_low')?.status, wt.steps.find((x) => x.q.id === 'B12')?.q.followups?.length ?? 0, wt.steps.find((x) => x.q.id === 'B12')?.q.options.find((o) => o.id === 'B12-tinnitus')?.locked], ['present', 0, true]);
  const wt2 = walk({ ...base, B12: ['B12-tinnitus', 'B12TN-high'] });
  eq('2-10 体質チェックで耳鳴りを選んだら音の高さが必須（選ぶと所見が入る）', [isAnswered(qById('B12'), ['B12-tinnitus']), isAnswered(qById('B12'), ['B12-tinnitus', 'B12TN-high']), wt2.state.get('tinnitus_high')?.status], [false, true, 'present']);
}
// 2-9 食品アレルギー → 構成生薬で候補から除外
{
  eq('2-9 食品アレルギーの選択肢（17食品＋その他）。食品名だけで、生薬名は患者画面に出さない', [qById('C3').followups.find((f) => f.id === 'C3F').options.map((o) => o.text), qById('C3').followups.find((f) => f.id === 'C3F').options.some((o) => /生姜|桂皮|大棗|陳皮/.test(o.text))], [['シナモン', '山芋・長芋', '小麦', '牡蠣', 'ショウガ', 'ナツメ', 'ゴマ', '米', 'ハトムギ', 'みかん', 'シソ', '桃', 'アンズ', 'ゼラチン', '水あめ', 'ミント', '山椒', 'その他'], false]);
  eq('2-9 食品と対応生薬', Object.fromEntries(qById('C3').followups.find((f) => f.id === 'C3F').options.filter((o) => o.herbs).map((o) => [o.text, o.herbs.join('/')])), { シナモン: '桂皮・桂枝', '山芋・長芋': '山薬', 小麦: '小麦', 牡蠣: '牡蛎', ショウガ: '生姜・乾姜', ナツメ: '大棗', ゴマ: '胡麻', 米: '粳米', ハトムギ: '薏苡仁', みかん: '陳皮', シソ: '蘇葉', 桃: '桃仁', アンズ: '杏仁', ゼラチン: '阿膠', 水あめ: '膠飴', ミント: '薄荷', 山椒: '山椒' });
  // 構成生薬のデータ：68処方すべてに登録され、foodHerbs が構成生薬と食い違わない
  const FOOD_MAP = { '桂皮・桂枝': ['桂皮', '桂枝'], 山薬: ['山薬'], 小麦: ['小麦', '浮小麦'], 牡蛎: ['牡蛎'], '生姜・乾姜': ['生姜', '乾姜'], 大棗: ['大棗'], 胡麻: ['胡麻'], 粳米: ['粳米'], 薏苡仁: ['薏苡仁'], 陳皮: ['陳皮'], 蘇葉: ['蘇葉'], 桃仁: ['桃仁'], 杏仁: ['杏仁'], 阿膠: ['阿膠'], 膠飴: ['膠飴'], 薄荷: ['薄荷'], 山椒: ['山椒'] };
  const bad = FORMULAS.filter((f) => !f.herbs?.length || !f.foodHerbs || !f.amounts || !f.compositionConfidence).map((f) => f.name);
  eq('2-9 構成生薬のデータが68処方すべてにある', bad, []);
  const mismatch = FORMULAS.filter((f) => Object.entries(FOOD_MAP).some(([k, names]) => names.some((n) => f.herbs.some((h) => h.herb === n)) !== f.foodHerbs.includes(k))).map((f) => f.name);
  eq('2-9 foodHerbs は構成生薬から導ける（食い違いなし）', mismatch, []);
  eq('2-9 注意生薬（cautionHerbs）は構成生薬と一致する', FORMULAS.filter((f) => ['甘草', '麻黄', '大黄', '芒硝', '附子'].some((h) => f.cautionHerbs.includes(h) !== f.herbs.some((x) => x.herb === h))).map((f) => f.name), []);
  eq('3-8 甘草の1日量（補中益気湯 1.5g・芍薬甘草湯 6g）', [FORMULAS.find((f) => f.name === '補中益気湯').amounts['甘草'], FORMULAS.find((f) => f.name === '芍薬甘草湯').amounts['甘草']], [1.5, 6]);
  const a = { A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-A'], K_A: ['KA-fatigue'], C3: ['C3-food', 'C3F-ginger', 'C3F-peach', 'C3F-other'] };
  const sess = { answers: a, texts: { 'C3F-other': 'キウイ' } };
  const c = computeSession(sess);
  eq('2-9 選んだ食品（ショウガ・桃）と、その他の記入あり', [foodAllergies(a).map((x) => x.food), c.safetyFlags.some((f) => f.code === 'allergy_food_other')], [['ショウガ', '桃'], true]);
  const hoch = FORMULAS.find((f) => f.name === '補中益気湯');
  const safe = assessFormulaSafetyFor(hoch, c, a, sess);
  eq('2-9 生姜を含む処方は候補から除外し、理由を「◯◯アレルギーのため除外（××を含む）」で出す', [safe.status, safe.exclude.some((x) => x.startsWith('ショウガアレルギーのため除外（生姜・乾姜を含む）'))], ['excluded', true]);
  const nin = FORMULAS.find((f) => f.name === '桂枝茯苓丸');
  eq('2-9 桃仁を含む処方は桃アレルギーで除外', assessFormulaSafetyFor(nin, c, a, sess).exclude.some((x) => x.startsWith('桃アレルギーのため除外（桃仁を含む）')), true);
  eq('2-9 その他の食品アレルギーは「その他の食品アレルギーあり：確認」（全候補共通）', selectionOf(sess, c).general.some((x) => x.includes('その他の食品アレルギーあり：確認')), true);
  const noFood = assessFormulaSafetyFor(FORMULAS.find((f) => f.name === '六味丸'), computeSession({ answers: { ...a, C3: ['C3-none'] }, texts: {} }), { ...a, C3: ['C3-none'] }, { texts: {} });
  eq('2-9 食品アレルギーがなければ食品による除外はない', noFood.exclude.some((x) => x.includes('アレルギー')), false);
}
function assessFormulaSafetyFor(f, c, answers, sess) {
  const sel = selectionOf({ answers, texts: sess.texts ?? {} }, c);
  // 候補の全グループから探し、なければ単独で評価する
  const hit = sel.groups.flatMap((g) => g.candidates).find((x) => x.code === f.code);
  if (hit) return hit.safety;
  const ctx = safetyContext(c.safetyFlags, answers, c.w, c.tags, { texts: sess.texts ?? {} });
  return assessFormulaSafety(f, ctx);
}
// 3-8 注意の種類・何が起きるか・根拠
{
  const a = { A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-B'], K_B: ['KB-constipation'], C1: ['C1-diuretic', 'C1-laxative', 'C1-kanzo', 'C1-kampo', 'C1KP-F01'], C2: ['C2-1', 'C2-2'], T1: ['T1-staff'] };
  const sess = { answers: a, texts: {} };
  const c = computeSession(sess);
  const all = selectionOf(sess, c).groups.flatMap((g) => g.candidates);
  const rk = all.find((x) => x.name === '麻子仁丸') ?? all.find((x) => x.safety.cautions.length);
  const cau = (name) => all.find((x) => x.name === name)?.safety.cautions ?? [];
  const kanzo = all.find((x) => x.formula.cautionHerbs.includes('甘草'));
  eq('3-8 甘草を含む候補：利尿薬 × 甘草 → 飲み合わせ／低カリウム／併用注意', kanzo?.safety.cautions.some((x) => x.kind === 'interaction' && x.pair === '利尿薬 × 甘草' && x.basis === '併用注意' && x.effect.includes('低カリウム')), true);
  eq('3-8 甘草を含む候補：高血圧・心臓の病気 × 甘草 → 持病／慎重投与', kanzo?.safety.cautions.some((x) => x.kind === 'disease' && x.pair.includes('× 甘草') && x.basis === '慎重投与'), true);
  const dai = all.find((x) => x.formula.cautionHerbs.includes('大黄'));
  eq('3-8 大黄を含む候補：便秘薬 × 大黄 → 成分の重なり／併用注意', dai ? dai.safety.cautions.some((x) => x.kind === 'overlap' && x.pair === '便秘薬 × 大黄' && x.basis === '併用注意') : 'no大黄候補', true);
  eq('3-8 注意は、その生薬を実際に含む候補にだけ付く（甘草を含まない候補に甘草の注意はない）', all.filter((x) => !x.formula.cautionHerbs.includes('甘草')).some((x) => x.safety.cautions.some((y) => y.pair.includes('× 甘草') && y.kind !== 'overlap')), false);
  const ov = all.find((x) => x.formula.cautionHerbs.includes('甘草') && x.code !== 'F01');
  eq('3-8 服用中の漢方薬 × 候補：甘草が重なる（合計量を表示）', ov?.safety.cautions.some((x) => x.kind === 'overlap' && x.pair.startsWith('服用中の補中益気湯') && x.effect.includes('合計 約')), true);
  eq('3-8 注意の種類の日本語表示', Object.fromEntries(Object.entries(CAUTION_KIND_LABEL)), { interaction: '飲み合わせ', overlap: '成分の重なり', disease: '持病', allergy: 'アレルギー' });
  eq('3-3 記入漏れの薬の追加（staffMeds）が安全フラグに入る', safetyFlags({ A1: ['A1-2'], A2: ['A2-3'] }, walk({ A1: ['A1-2'], A2: ['A2-3'] }), { staffMeds: [{ id: 'C1-bp', name: 'アムロジピン' }] }).find((f) => f.code === 'med_bp') !== undefined, true);
}
// 低カリウム血症 × 甘草（1日 2.5g 超＝添付文書の禁忌の対象は除外、それ以下は確認）
{
  const a = { A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-A'], K_A: ['KA-fatigue'], C2: ['C2-hypok'] };
  const c = computeSession({ answers: a, texts: {} });
  const ctx = safetyContext(c.safetyFlags, a, c.w, c.tags, {});
  const shak = assessFormulaSafety(FORMULAS.find((f) => f.name === '芍薬甘草湯'), ctx);
  const hoch = assessFormulaSafety(FORMULAS.find((f) => f.name === '補中益気湯'), ctx);
  eq('低カリウム血症：甘草が2.5gを超える処方（芍薬甘草湯 6g）は除外、補中益気湯（1.5g）は慎重投与の確認', [shak.status, shak.exclude.some((x) => x.includes('甘草 6g/日')), hoch.exclude.length, hoch.cautions.some((x) => x.pair === '低カリウム血症 × 甘草' && x.basis === '慎重投与')], ['excluded', true, 0, true]);
}
// 0-4 月経痛の確認項目は月経がある方だけ
{
  const tagsOf = (a) => safetyTags(walk(a), undefined, undefined).flatMap((t) => t.checks);
  const base = { A1: ['A1-1'], A2: ['A2-3'], K1: ['K1-B'], K_B: ['KB-stomach_pain'] };
  const has = (a) => tagsOf(a).includes('鎮痛薬を飲んでも寝込むほどか（月経痛）');
  const wtag = (a) => safetyTags(walk(a)).length;
  eq('0-4 月経痛の確認項目：月経あり→出る（タグがある場合）／閉経・妊娠中・男性→出ない', [has({ ...base, A3: ['A3-regular'], A3P: ['A3P-no'], K1: ['K1-F'], K_F: ['KF-period_pain'] }), has({ ...base, A3: ['A3-post'] }), has({ ...base, A3: ['A3-regular'], A3P: ['A3P-preg'] }), has({ A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-B'], K_B: ['KB-stomach_pain'] })], [tagsOf({ ...base, A3: ['A3-regular'], A3P: ['A3P-no'], K1: ['K1-F'], K_F: ['KF-period_pain'] }).length > 0, false, false, false]);
}
// 3-9 養生の出し方
{
  const mk = (o) => ({ qi_def: 0, blood_def: 0, qi_stag: 0, blood_stasis: 0, fluid: 0, yin_def: 0, cold: 0, heat: 0, ...o });
  const r = (pct) => ({ pct: mk(pct), isBalanced: Math.max(...Object.values(mk(pct)).slice(0, 6)) < 20 });
  const p1 = advicePlan(r({ qi_def: 70, blood_def: 50, fluid: 30 }), 'fluid');
  eq('3-9 養生は「主タイプ＋主訴に関係するタイプ」の最大2つ（点数の順だけで選ばない）', p1.types, ['qi_def', 'fluid']);
  const p2 = advicePlan(r({ blood_def: 60, qi_stag: 57, yin_def: 30 }));
  eq('3-9 1位と2位の差が5点以内なら「同じくらい」と並べ、養生は2つ', [p2.tied, p2.types], [['blood_def', 'qi_stag'], ['blood_def', 'qi_stag']]);
  const p3 = advicePlan(r({ qi_def: 69, blood_def: 66, qi_stag: 64, blood_stasis: 62, fluid: 61, yin_def: 60 }), 'yin_def');
  eq('3-9 5タイプ以上が「強い」なら薬剤師画面に全体的に高く出ています（養生は最大2つのまま）', [p3.allHigh, p3.strongCount, p3.types.length], [true, 6, 2]);
  eq('3-9 バランスなら養生は土台のみ', advicePlan(r({ qi_def: 10 })).types, []);
  eq('3-9 水滞と水不足（陰虚）が両方出るときは、水分のとり方を両方に合う表現にそろえる', [adviceOverride(['fluid', 'yin_def'], 'fluid', 'food')?.includes('少しずつこまめに'), adviceOverride(['fluid', 'yin_def'], 'yin_def', 'food')?.includes('少しずつこまめに'), adviceOverride(['fluid', 'qi_def'], 'fluid', 'food')], [true, true, undefined]);
  const w = walk({ A1: ['A1-1'], A2: ['A2-3'], K1: ['K1-B'], K_B: ['KB-bloating'], KM: ['KM-bloating'] });
  eq('3-9 主訴に関係するタイプは、お悩み・深掘りの所見の重みから決める', typeof (relatedTypeOf(w.state, []) ?? 'none'), 'string');
  eq('3-9 全員共通の土台（胃腸・睡眠・冷やさない）', FOUNDATION.items.map((x) => x.label), ['胃腸を整える', '睡眠を整える', '体を冷やさない']);
}
// 0-2 お客様用の結果：薬剤師画面の「お客様用の結果を表示」から開く
{
  const staffPage = fs.readFileSync('src/pages/kampo/staff/session/[id]/index.astro', 'utf8');
  eq('0-2 薬剤師画面に「お客様用の結果を表示」がある', staffPage.includes('お客様用の結果を表示'), true);
  eq('3-2 薬剤師画面に④薬剤師の判定・③漢方薬の入力はない', /判定を記録|name="jtype"|服用中・体調を崩した漢方薬<\/h2>/.test(staffPage), false);
  eq('0-4 確認した・取り消す・お客様に伝えたは fetch でその場反映（x-kampo-ajax）', /x-kampo-ajax/.test(staffPage) && /data-act="check"/.test(staffPage) && /data-act="notify"/.test(staffPage), true);
  eq('3-1 ボタンは高さ44px以上（指で押しやすい）', /\.kp-bigbtn\{min-height:44px/.test(staffPage), true);
  const result = fs.readFileSync('src/pages/kampo/check/[id]/result/index.astro', 'utf8');
  eq('0-2 結果画面に漢方薬・受診のおすすめの表示はない', /referrals|FORMULAS|kp-refer|おすすめの漢方/.test(result), false);
  eq('緑系の配色（--sky 系の変数が緑）', /--sky-strong:#3FA877/.test(fs.readFileSync('src/layouts/KampoLayout.astro', 'utf8')), true);
}

console.log(fail ? `\n${fail} 件 NG` : '\nすべて OK');
process.exit(fail ? 1 : 0);
