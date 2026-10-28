// 漢方体質チェック（/kampo/）のロジック回帰テスト（2026-10-25 v3・フェーズ2、2026-10-28 修正依頼 v3.1）。
//   node --experimental-strip-types scripts/kampo-test.mjs
// マスタ検証・主訴と深掘り・回答の引き継ぎ（同じ所見を2回聞かない）・改修指示 4-1〜4-8 の個別修正・
// 安全確認タグと直ちに対応・暫定スコアの重複加点防止・二段階の漢方薬選定・旧版セッションの扱い、
// 2026-10-28 修正依頼（6タイプ＋寒熱・選択肢の分割と移動・矛盾する選択肢・妊娠授乳の任意化・アレルギーと副作用歴の統合・
// 漢方薬の薬剤師入力と重複警告・生活習慣1問・舌4軸・顔色と爪の観察優先）を確認する。
import {
  QUESTIONS, STAFF_QUESTIONS, COMPLAINTS, CATEGORIES, FORMULAS, TYPE_DEFS, THERMAL_DEFS, TYPES, STEPS, TIPS, validateMasters, complaintById, legacyOptionText, QUESTIONNAIRE,
} from '../src/lib/kampo/masters.ts';
import { walk, normalizeAnswer, firstUnansweredStep, personalTips, primaryOf, complaintsOf, applyStaffAnswers, conflictIn, resolveQuestion } from '../src/lib/kampo/flow.ts';
import { score, classify, resultCards } from '../src/lib/kampo/scoring.ts';
import { safetyFlags, safetyTags, isUrgent, safetyContext } from '../src/lib/kampo/safety.ts';
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
{
  const [qj, cj, fj, tj, ty, fo] = M.map((x) => JSON.parse(JSON.stringify(x)));
  qj.questions.find((x) => x.id === 'B4').options.push({ id: 'B4-unknown', text: 'わからない', exclusive: 'unknown' });
  eq('体質の設問に「わからない」を置くと検証エラー（2-1）', validateMasters(qj, cj, fj, tj, ty, fo).some((e) => e.includes('B4') && e.includes('わからない')), true);
}
eq('処方 68 件・タイプ 6 件・寒熱 2 件', [FORMULAS.length, Object.keys(TYPE_DEFS).length, Object.keys(THERMAL_DEFS).length], [68, 6, 2]);
eq('設問版', QUESTIONNAIRE.version, '2026-10-28-v3.1');

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
  const opts = q.options.filter((o) => !o.exclusive && !o.urgent && !o.locked);
  if (q.section === 'primary' || q.section === 'basic' || q.section === 'category' || q.section === 'complaint') return null;
  if (mode === 'all') {
    if (q.type === 'single') return [opts[0]?.id];
    // 画面と同じく、同時に選べない選択肢は後のほうを選ばない
    const out = [];
    for (const o of opts) if (!conflictIn(q, [...out, o.id])) out.push(o.id);
    return out;
  }
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
          // チェック済みで出す選択肢（睡眠の prefill）は聞き直していないので数えない
          const shown = s.q.section === 'complaint' ? s.q.options.filter((o) => s.ids.includes(o.id)) : s.q.options.filter((o) => !o.locked);
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
eq('F1 はいただいたイラスト（「わからない」は外した。2-1）', qById('F1').options.map((o) => o.image?.split('/').pop()), ['normal.webp', 'pale.webp', 'dark.webp', 'red.webp', 'bluish.webp']);
eq('3-5「体力には自信がある」はない', allOpts.some(({ o }) => o.text.includes('体力がある') || o.text.includes('体力には自信')), false);
eq('第12章 舌は患者に聞かない（薬剤師の設問にだけある）', QUESTIONS.some((x) => x.options.some((o) => o.image?.includes('/tongue/') || o.findings?.some((f) => f.startsWith('tongue_')))), false);
eq('7 舌は色・形・苔・舌下静脈の4軸', STAFF_QUESTIONS.filter((x) => x.id.startsWith('X_tongue')).map((x) => x.title), ['舌の色', '舌の形', '舌苔', '舌下静脈']);
eq('7 舌の複合の選択肢（大きく、歯痕があり…）はない', STAFF_QUESTIONS.some((x) => x.options.some((o) => (o.findings?.length ?? 0) > 1)), false);
eq('5-1 患者向けの選択肢に受診勧奨フラグ（refer/consult）がない', allOpts.some(({ o }) => o.flags?.some((f) => f === 'refer' || f === 'consult')), false);
eq('5-5 直ちに対応の選択肢は主訴の深掘りの中だけ', allOpts.filter(({ o }) => o.urgent).every(({ q }) => q.section === 'detail'), true);
eq('5-6 体重減少・微熱を共通の質問で聞かない', allOpts.filter(({ q }) => q.section !== 'detail').some(({ o }) => /体重が減|微熱/.test(o.text)), false);
eq('自由記述の設問はない（記入欄は C3 の任意の短い記入だけ）', [allOpts.some(({ o }) => o.freeText) || QUESTIONS.some((x) => x.type === 'text'), allOpts.filter(({ o }) => o.note).map(({ q }) => q.id).filter((id, i, a) => a.indexOf(id) === i)], [false, ['C3']]);

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
    C1: ['C1-bp'], C1K: ['C1K-yes'], C1NB: ['C1NB-yes'], C2: ['C2-1'], C3: ['C3-kampo', 'C3S-rash'],
  };
  const staffAnswers = { X_kampo_current: ['X_kampo_current-F01'], X_kampo_adverse: ['X_kampo_adverse-F01'] };
  const sess = { answers: a, staffAnswers, texts: { 'C3-kampo': 'ほちゅうえっきとう' } };
  const c = computeSession(sess);
  eq('閉経なら妊娠・授乳の設問を出さない', c.w.steps.some((s) => s.q.id === 'A3P'), false);
  eq('安全フラグ：服用中の薬・漢方・高血圧・副作用歴', ['meds', 'kampo_current', 'hypertension', 'adverse_kampo'].map((k) => c.safetyFlags.some((f) => f.code === k)), [true, true, true, true]);
  eq('5-1 記入欄の内容を「口頭で確認」つきで出す', c.safetyFlags.find((f) => f.code === 'adverse_kampo').detail.includes('「ほちゅうえっきとう」（口頭で確認）'), true);
  eq('5-2 服用中の漢方薬は薬剤師の入力から', c.safetyFlags.find((f) => f.code === 'kampo_current').detail, '補中益気湯（薬剤師が入力）');
  const sel = selectionOf(sess, c);
  const g = sel.groups[0];
  eq('主訴「疲れやすい」の候補に補中益気湯', g.candidates.some((x) => x.name === '補中益気湯'), true);
  const f01 = g.candidates.find((x) => x.code === 'F01');
  eq('副作用歴の漢方薬は要確認（薬剤師が判断）', f01.safety.status !== 'ok' && f01.safety.check[0].includes('体調を崩したことがある'), true);
  eq('5-2 服用中と同じ漢方薬は警告', f01.safety.check.includes('服用中の補中益気湯と同じ漢方薬です'), true);
  eq('5-2 甘草を含む候補は服用中の漢方との甘草の重複を警告', g.candidates.filter((x) => x.code !== 'F01' && x.formula.cautionHerbs.includes('甘草')).every((x) => x.safety.check.some((t) => t.startsWith('服用中の補中益気湯と') && t.includes('甘草'))), true);
  eq('5-2 体調を崩した漢方薬と共通の注意生薬を警告', g.candidates.filter((x) => x.code !== 'F01' && x.formula.cautionHerbs.includes('柴胡')).every((x) => x.safety.check.some((t) => t.startsWith('体調を崩した補中益気湯と共通の注意生薬'))), true);
  eq('候補はすべて主訴の効能に当たる（体質だけで足さない）', g.candidates.every((x) => x.matched.length > 0), true);
  const c2 = computeSession({ answers: a, texts: {} });
  eq('5-2 漢方薬の名前が未入力なら確認事項に出す', selectionOf({ answers: a }, c2).groups[0].candidates[0].safety.check.some((t) => t.includes('名前を確認して入力するまで')), true);
}
{
  const a = { A1: ['A1-1'], A3: ['A3-regular'], A3P: ['A3P-no'], K1: ['K1-C'], K_C: ['KC-acne'], Sacne1: ['Sacne1-acne_red', 'Sacne1-acne_pus'], C1: ['C1-none'], C1K: ['C1K-no'], C2: ['C2-0'], C3: ['C3-none'] };
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
eq('生活習慣の一言（就寝が遅い → 血虚）', personalTips({ L1: ['L1-late_bed'] }, 'blood_def').length, 1);
eq('男性にはカテゴリー「女性の健康」を出さない', walk({ A1: ['A1-2'] }).steps.find((s) => s.q.id === 'K1').q.options.some((o) => o.text === '女性の健康'), false);
eq('むくみの設問は全員に聞く（冷えるとむくむ・月経前にむくむを移したため）', walk({ A1: ['A1-2'], K1: ['K1-A'], K_A: ['KA-fatigue'] }).steps.some((s) => s.q.id === 'B7'), true);

// ---- 旧版セッション ----
eq('旧版（2026-10-24b・v2・2026-10-25-v3）は再計算しない', ['2026-10-24b', 'v2-draft-2026-10-25', '2026-10-25-v3', QUESTIONNAIRE.version].map((v) => isLegacy({ questionnaireVersion: v })), [true, true, true, false]);
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
eq('2-1 アレルギー・漢方薬を飲んでいるかは「わからない」を残す', [texts('C3').includes('わからない'), texts('C1K').includes('わからない')], [true, true]);
eq('2-2 主訴の性状の設問は「特にない」なし・「その他」あり', [texts('Sspots1').includes('特にない'), texts('Sspots1').includes('その他'), qById('Sspots1').options.find((o) => o.other)?.findings ?? null], [false, true, null]);
// 2-3
eq('2-3 汗をかきにくい ⇔ 寝汗・少し動くと汗・大量の汗', ['少し動いただけで汗をかく', '暑いときや食事中に大量に汗をかく', '寝汗をかく'].map((t) => !!conflictIn(qById('B4'), [opt('B4', '汗をかきにくい').id, opt('B4', t).id])), [true, true, true]);
eq('2-3 軟便 ⇔ 硬い便、尿の色が濃い ⇔ 薄い、食欲がない ⇔ すぐお腹が空く', [
  !!conflictIn(qById('B6'), ['B6-loose_stool', 'B6-hard_stool']), !!conflictIn(qById('B6b'), ['B6b-urine_dark', 'B6b-urine_pale']), !!conflictIn(qById('B5'), ['B5-poor_appetite', 'B5-big_appetite']),
  !!conflictIn(qById('B6'), ['B6-loose_stool', 'B6-constipation']),
], [true, true, true, false]);
{
  const w = walk({ A1: ['A1-2'], A2: ['A2-3'], K1: ['K1-B'], K_B: ['KB-diarrhea'] });
  eq('2-3 主訴で「軟便・下痢」なら B6 に「便が硬い」を出さない', w.steps.find((x) => x.q.id === 'B6')?.q.options.some((o) => o.findings?.includes('hard_stool')), false);
}
eq('2-3 「ない」「わからない」と「ある」は同時に選べない（C3）', normalizeAnswer(qById('C3'), ['C3-none', 'C3-drug']), ['C3-drug']);
// 2-4
eq('2-4 STEP は5段階', STEPS.map((x) => x.label), ['基本情報', 'お悩み', '体質チェック', '安全確認', '生活習慣']);
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
eq('4-7 睡眠は8項目', texts('B8').filter((t) => t !== '特にない'), ['寝つきが悪い', '夜中に何度も目が覚める', '眠りが浅い', '夢が多い', '朝早く目が覚める', '寝ても疲れが取れない', '暑くて眠れない', '考え事で眠れない']);
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
  const w1 = walk(a); applyStaffAnswers(w1.state, { X_face: ['X_face-face_dark'], X_nail: ['X_nail-normal'] });
  eq('4-10 顔色・爪は観察を採用し、自己申告と両方は足さない', [w1.state.get('face_pale')?.status, w1.state.get('face_dark')?.status, w1.state.get('nail_brittle')?.status], ['absent', 'present', 'absent']);
  const w2 = walk(a); applyStaffAnswers(w2.state, { X_face: ['X_face-defer'], X_nail: ['X_nail-defer'] });
  eq('4-10 化粧・ネイルで判断できないときは自己申告を採用', [w2.state.get('face_pale')?.status, w2.state.get('face_pale')?.source, w2.state.get('nail_brittle')?.status], ['present', 'patient', 'present']);
}
// 第5章
eq('5-1 アレルギーと副作用歴は1問', [qById('C3').title, texts('C3')], ['薬や食品で、アレルギーや体調不良が出たことはありますか', ['薬でアレルギーが出たことがある', '食品でアレルギーが出たことがある', '漢方薬で体調を崩したことがある', 'ない', 'わからない']]);
eq('5-1 漢方薬で体調を崩したら同じ画面で症状（空咳・息苦しさを含む）', [qById('C3').followup?.when, qById('C3').followup?.options.map((o) => o.text).includes('空咳・息苦しさ'), qById('C3').followup?.options.map((o) => o.text).includes('むくみ・血圧が上がった')], ['C3-kampo', true, true]);
eq('5-1 症状は「漢方薬で体調を崩した」を選んだときだけ残す', [normalizeAnswer(qById('C3'), ['C3-drug', 'C3S-rash']), normalizeAnswer(qById('C3'), ['C3-kampo', 'C3S-rash', 'C3S-unknown'])], [['C3-drug'], ['C3-kampo', 'C3S-rash']]);
{
  const a = { A1: ['A1-2'], A2: ['A2-3'], C3: ['C3-drug', 'C3-food'] };
  const f = safetyFlags(a, walk(a), { texts: { 'C3-drug': 'ロキソニン' } });
  eq('5-1 薬と食品のアレルギーは分けて表示し、記入内容に「口頭で確認」', [f.find((x) => x.code === 'allergy_drug')?.detail, f.some((x) => x.code === 'allergy_food')], ['記入：「ロキソニン」（口頭で確認）', true]);
}
eq('5-2 患者には漢方薬の名前を選ばせない', [QUESTIONS.some((x) => x.options.some((o) => o.formula)), ['C4', 'C4K', 'C4S'].some((id) => qById(id)), texts('C1K'), texts('C1NB')], [false, false, ['はい', 'いいえ', 'わからない'], ['はい', 'いいえ']]);
eq('5-2 薬剤師が服用中・体調を崩した漢方薬を入力', ['X_kampo_current', 'X_kampo_adverse'].map((id) => STAFF_QUESTIONS.find((x) => x.id === id)?.options.length), [68, 68]);
eq('5-2 ツムラ番号は参考値（125・128 以外は未確認）', FORMULAS.filter((f) => f.tsumuraNoVerified).map((f) => f.tsumuraNo).sort(), [125, 128]);
{
  const a = { A1: ['A1-2'], A2: ['A2-6'], K1: ['K1-G'], K_G: ['KG-headache'], Sheadache3: ['Sheadache3-none'] };
  const w = walk(a);
  const open = safetyTags(w);
  const done = safetyTags(w, undefined, { headache: { by: '薬剤師A', at: '2026-10-28T00:00:00Z' } });
  eq('5-3 安全確認タグは確認を記録するまで未確認（提案を確定しない）', [safetyContext([], a, w, open).general.some((t) => t.includes('安全確認タグ')), safetyContext([], a, w, done).general.some((t) => t.includes('安全確認タグ')), done.find((t) => t.id === 'headache')?.checked?.by], [true, false, '薬剤師A']);
}
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

console.log(fail ? `\n${fail} 件 NG` : '\nすべて OK');
process.exit(fail ? 1 : 0);
