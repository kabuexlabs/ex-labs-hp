#!/usr/bin/env python3
"""GSC（Search Console）24h エクスポート zip を取り込み、Tier 順の順位表を出して docs/seo-log.md に追記する。

  python3 scripts/gsc_report.py <zip または解凍済みディレクトリ> [...]
  python3 scripts/gsc_report.py            # 取り込み済みデータだけで最新日を再集計

- データは docs/seo-data/YYYY-MM-DD/ に展開して保存する（コンテナが消えても履歴が残る）。
- 表示回数が 10 未満のワードは順位に ※ を付ける（少数サンプル。1日の上下で一喜一憂しない）。
- ターゲット語は docs/seo-targets.md の軸に対応。ワードを増やしたら TARGETS を更新すること。
"""
import csv, os, re, sys, zipfile, glob, io

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'docs', 'seo-data')
LOG = os.path.join(ROOT, 'docs', 'seo-log.md')

# 軸 → [(ワード, 担当ページ)]  ※ docs/seo-targets.md と同期
TARGETS = [
    ('軸1 イマーシブ', [('イマーシブ', '/guide/immersive/'), ('イマーシブとは', '/guide/immersive/'), ('イマーシブ 意味', '/guide/immersive/'), ('immersive 意味', '/guide/immersive/'),
                    ('イマーシブ 制作', '/guide/immersive-seisaku/'), ('イマーシブ 制作会社', '/guide/immersive-company/'), ('イマーシブ 費用', '/guide/immersive-cost/'),
                    ('イマーシブ イベント', '/guide/immersive-event/'), ('イマーシブ体験', '/guide/immersive-tokyo/'), ('イマーシブ体験 東京', '/guide/immersive-tokyo/'), ('イマーシブシアター 東京', '/guide/immersive-tokyo/'),
                    ('イマーシブシアターとは', '/guide/immersive-theater/'), ('イマーシブ公演とは', '/guide/immersive-theater/'), ('没入感', '/guide/botsunyukan/'), ('没入感とは', '/guide/botsunyukan/'), ('没入', '/guide/botsunyukan/')]),
    ('軸2 マダミス', [('マダミス', '/guide/madamis/'), ('マダミスとは', '/guide/madamis/'), ('マーダーミステリー', '/guide/madamis/'), ('マーダーミステリーとは', '/guide/madamis/'),
                  ('マダミス 制作', '/guide/madamis-seisaku/'), ('マダミス制作', '/guide/madamis-seisaku/'), ('マダミス 制作会社', '/guide/madamis-company/'), ('マダミス 費用', '/guide/madamis-cost/'), ('マーダーミステリー 料金', '/guide/madamis-cost/'),
                  ('マダミス 初心者', '/guide/madamis-shoshinsha/'), ('マダミス 遊び方', '/guide/madamis-asobikata/'), ('マダミス 謎解き 違い', '/guide/madamis-nazotoki-chigai/'), ('東大マダミス', '/toudaimurder/')]),
    ('軸3 頭脳戦', [('頭脳戦', '/guide/zunousen/'), ('頭脳戦とは', '/guide/zunousen/'), ('頭脳戦 ゲーム', '/guide/zunousen-game/'), ('頭脳戦ゲーム', '/guide/zunousen-game/'), ('頭脳戦 制作', '/guide/zunousen-seisaku/'), ('頭脳戦 漫画', '/guide/zunousen-sakuhin/'), ('頭脳戦 アニメ', '/guide/zunousen-sakuhin/')]),
    ('軸4 心理戦', [('心理戦', '/guide/shinrisen/'), ('心理戦とは', '/guide/shinrisen/'), ('心理戦 強い人 特徴', '/guide/shinrisen/'), ('心理戦 ゲーム', '/guide/shinrisen-game/'), ('心理戦ゲーム', '/guide/shinrisen-game/')]),
    ('軸5 施設活用', [('施設活用', '/guide/shisetsu-katsuyo/'), ('催事とは', '/guide/saiji/'), ('催事場とは', '/guide/saiji/'), ('ポップアップイベントとは', '/guide/popup-event/'),
                  ('商業施設 集客イベント', '/guide/shogyoshisetsu-event/'), ('商業施設 イベント 企画', '/guide/shogyoshisetsu-event/'), ('商業施設 イベント アイデア', '/guide/shogyoshisetsu-event/'), ('商業施設 イベント 事例', '/guide/shogyoshisetsu-event/'),
                  ('遊休区画', '/guide/yukyu-kukaku/'), ('ホテル イベント 企画', '/guide/hotel-event/')]),
    ('軸6 体験型', [('体験型イベント', '/guide/taikengata-event/'), ('体験型イベントとは', '/guide/taikengata-event/'), ('体験型 イベント 企画', '/guide/taikengata-idea/'), ('体験型 イベント アイデア', '/guide/taikengata-idea/'),
                 ('盛り上がる イベント 企画', '/guide/taikengata-idea/'), ('体験型 イベント 会社', '/guide/taikengata-company/'), ('体験型イベント 費用', '/guide/event-hiyou/'),
                 ('参加型イベント', '/guide/sankagata-event/'), ('参加型とは', '/guide/sankagata-event/'), ('社内イベント 企画', '/guide/shanai-event/')]),
    ('軸7 周遊', [('周遊イベント', '/guide/shuyu-event/'), ('周遊 イベント アイデア', '/guide/shuyu-event/'), ('周遊型 謎解き', '/guide/shuyu-event/'), ('回遊 施策 アイデア', '/guide/shuyu-event/'), ('回遊 周遊 違い', '/guide/shuyu-event/')]),
]
AXIS_RE = {
    '軸1 イマーシブ': r'イマーシブ|immersive|没入', '軸2 マダミス': r'マダミス|マーダー', '軸3 頭脳戦': r'頭脳', '軸4 心理戦': r'心理戦',
    '軸5 施設活用': r'施設|催事|遊休|ポップアップ|ホテル|商業|営業時間', '軸6 体験型': r'体験型|参加型|盛り上が|懇親|社内イベント', '軸7 周遊': r'周遊|回遊',
    '制作依頼系': r'制作|依頼|会社|費用|料金|相場|企画',
}
# CTR を毎日見るページ（title を変えたページ＋表示回数上位）
WATCH_PAGES = ['/guide/botsunyukan/', '/guide/madamis/', '/guide/immersive/', '/guide/saiji/', '/guide/shinrisen/', '/guide/popup-event/', '/guide/sankagata-event/', '/guide/immersive-tokyo/', '/guide/immersive-theater/']


def ingest(src):
    m = re.search(r'(20\d{2})(\d{2})(\d{2})', os.path.basename(src))
    if not m:
        sys.exit(f'ファイル名から日付が取れない: {src}')
    date = f'{m[1]}-{m[2]}-{m[3]}'
    dst = os.path.join(DATA, date)
    os.makedirs(dst, exist_ok=True)
    if zipfile.is_zipfile(src):
        with zipfile.ZipFile(src) as z:
            z.extractall(dst)
    elif os.path.isdir(src):
        for f in os.listdir(src):
            if f.endswith('.csv'):
                open(os.path.join(dst, f), 'wb').write(open(os.path.join(src, f), 'rb').read())
    return date


def load(date):
    d = os.path.join(DATA, date)
    def rd(name):
        p = os.path.join(d, name)
        return list(csv.DictReader(io.open(p, encoding='utf-8'))) if os.path.exists(p) else []
    q = {r['上位のクエリ']: r for r in rd('クエリ.csv')}
    p = {r['上位のページ'].replace('https://kabuexlabs.com', ''): r for r in rd('ページ.csv')}
    return q, p


def pos(q, w):
    r = q.get(w)
    if not r:
        return '-'
    imp = int(r['表示回数'])
    return f"{float(r['掲載順位']):.1f}{'※' if imp < 10 else ''}"


def main():
    for src in sys.argv[1:]:
        ingest(src)
    dates = sorted(d for d in os.listdir(DATA) if re.fullmatch(r'\d{4}-\d{2}-\d{2}', d)) if os.path.isdir(DATA) else []
    if not dates:
        sys.exit('データがありません。zip を渡してください。')
    show = dates[-4:]
    data = {d: load(d) for d in show}
    # 表示回数で加重した直近7日の平均順位（日別順位の単純平均は使わない）
    last7 = dates[-7:]
    d7 = {d: load(d)[0] for d in last7}
    def wavg(w):
        imp = sum(int(d7[d][w]['表示回数']) for d in last7 if w in d7[d])
        if imp == 0:
            return '-'
        pos = sum(float(d7[d][w]['掲載順位']) * int(d7[d][w]['表示回数']) for d in last7 if w in d7[d]) / imp
        return f"{pos:.1f}{'※' if imp < 30 else ''}"
    latest = show[-1]
    q, p = data[latest]
    qprev, pprev = data[show[-2]] if len(show) > 1 else ({}, {})

    out = []
    tot_c = sum(int(r['クリック数']) for r in q.values()); tot_i = sum(int(r['表示回数']) for r in q.values())
    pc = sum(int(r['クリック数']) for r in qprev.values()); pi = sum(int(r['表示回数']) for r in qprev.values())
    out.append(f'## {latest}')
    out.append('')
    out.append(f'全体：クリック {tot_c}（前日 {pc}）・表示 {tot_i}（前日 {pi}）。※＝表示10未満（7日加重は30未満）の少数サンプル。掲載順位は「表示された時の平均」で、表示条件が変わると評価が同じでも動く。日次の上下で判断せず、変更の評価は14〜28日の観察で行う。')
    out.append('')
    out.append('| 軸 | ワード | ' + ' | '.join(d[5:] for d in show) + ' | 7日加重平均 | 表示 | クリック | 担当ページ |')
    out.append('|---|---|' + '---|' * len(show) + '---|---|---|---|')
    for ax, words in TARGETS:
        for w, page in words:
            cells = [pos(data[d][0], w) for d in show]
            if all(c == '-' for c in cells):
                continue
            r = q.get(w)
            out.append(f"| {ax.split(' ')[0]} | {w} | " + ' | '.join(cells) + f" | {wavg(w)} | {r['表示回数'] if r else '-'} | {r['クリック数'] if r else '-'} | {page} |")
    out.append('')
    out.append('### CTR ウォッチ（title 変更ページ・表示上位）')
    out.append('| ページ | 表示 | クリック | CTR | 順位 | 前日 CTR | 前日 順位 |')
    out.append('|---|---|---|---|---|---|---|')
    for pth in WATCH_PAGES:
        r = p.get(pth); pr = pprev.get(pth)
        if not r and not pr:
            continue
        out.append(f"| {pth} | {r['表示回数'] if r else '-'} | {r['クリック数'] if r else '-'} | {r['CTR'] if r else '-'} | {r['掲載順位'] if r else '-'} | {pr['CTR'] if pr else '-'} | {pr['掲載順位'] if pr else '-'} |")
    out.append('')
    out.append('### 新出クエリ（前日に無く、表示2回以上）')
    news = []
    for w, r in q.items():
        if w in qprev or int(r['表示回数']) < 2:
            continue
        ax = next((k for k, pat in AXIS_RE.items() if re.search(pat, w, re.I)), 'その他')
        news.append((ax, w, int(r['表示回数']), r['掲載順位']))
    news.sort(key=lambda x: (x[0], -x[2]))
    for ax, w, imp, ps in news:
        if ax != 'その他':
            out.append(f'- {ax}：{w}（表示{imp}・{ps}位）')
    if not any(n[0] != 'その他' for n in news):
        out.append('- なし')
    out.append('')
    out.append('### 初めて表示されたページ')
    newp = [(u, r) for u, r in p.items() if u not in pprev]
    for u, r in sorted(newp, key=lambda x: -int(x[1]['表示回数'])):
        out.append(f"- {u}（表示{r['表示回数']}・{r['掲載順位']}位）")
    if not newp:
        out.append('- なし')
    out.append('')
    out.append('### 施策')
    out.append('- （ここに当日の施策を書く）')
    out.append('')
    text = '\n'.join(out)
    print(text)

    # docs/seo-log.md へ追記（同日のセクションは置き換え）
    head = '# SEO 日次ログ（Tier順・掲載順位）\n\n毎日の GSC 24h データを docs/seo-targets.md の軸順に記録する。`python3 scripts/gsc_report.py <zip>` で自動生成。\n\n'
    body = open(LOG, encoding='utf-8').read() if os.path.exists(LOG) else ''
    body = re.sub(r'^# SEO 日次ログ.*?\n\n(?:.*?\n\n)?', '', body, count=1, flags=re.S) if body.startswith('# SEO 日次ログ') else body
    sections = re.split(r'(?=^## \d{4}-\d{2}-\d{2})', body, flags=re.M)
    sections = [s for s in sections if s.strip() and not s.startswith(f'## {latest}')]
    open(LOG, 'w', encoding='utf-8').write(head + text + '\n' + ''.join(sections))
    print(f'\n→ docs/seo-log.md を更新（{latest}）')


if __name__ == '__main__':
    main()
