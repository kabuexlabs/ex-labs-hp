// リンクプレビュー（src/lib/linkPreview.ts）のテスト：og:image の取り出し・許可ドメインの判定・登録先の照合
import { extractOg, isAllowedImage, findLinkPreviewTarget } from '../src/lib/linkPreview.ts';

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`NG ${name}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); }
};
const page = 'https://www.ntv.co.jp/friday-mystery/';

eq('og:image（property 先）', extractOg('<meta property="og:image" content="https://www.ntv.co.jp/friday-mystery/images/ogp.jpg"><meta property="og:title" content="金曜ミステリークラブ!!!">', page),
  { image: 'https://www.ntv.co.jp/friday-mystery/images/ogp.jpg', title: '金曜ミステリークラブ!!!', siteName: undefined });
eq('content 先・シングルクォート・相対パス', extractOg("<meta content='/friday-mystery/ogp.png' property='og:image'><meta property=\"og:site_name\" content=\"日本テレビ\">", page).image,
  'https://www.ntv.co.jp/friday-mystery/ogp.png');
eq('secure_url を優先', extractOg('<meta property="og:image" content="http://a.ntv.co.jp/x.jpg"><meta property="og:image:secure_url" content="https://a.ntv.co.jp/x.jpg">', page).image, 'https://a.ntv.co.jp/x.jpg');
eq('twitter:image の代替', extractOg('<meta name="twitter:image" content="https://www.ntv.co.jp/t.jpg">', page).image, 'https://www.ntv.co.jp/t.jpg');
eq('&amp; を戻す', extractOg('<meta property="og:image" content="https://www.ntv.co.jp/i.jpg?a=1&amp;b=2">', page).image, 'https://www.ntv.co.jp/i.jpg?a=1&b=2');
eq('og が無ければ title タグ・画像なし', extractOg('<title>番組名</title>', page), { image: undefined, title: '番組名', siteName: undefined });

eq('許可：同じドメイン', isAllowedImage('https://ntv.co.jp/a.jpg', ['ntv.co.jp']), true);
eq('許可：サブドメイン', isAllowedImage('https://www.ntv.co.jp/a.jpg', ['ntv.co.jp']), true);
eq('拒否：http', isAllowedImage('http://www.ntv.co.jp/a.jpg', ['ntv.co.jp']), false);
eq('拒否：似た別ドメイン', isAllowedImage('https://evilntv.co.jp/a.jpg', ['ntv.co.jp']), false);
eq('拒否：末尾を偽装', isAllowedImage('https://ntv.co.jp.example.com/a.jpg', ['ntv.co.jp']), false);
eq('拒否：data URL', isAllowedImage('data:image/png;base64,AAAA', ['ntv.co.jp']), false);

eq('登録先：番組公式サイト', !!findLinkPreviewTarget('https://www.ntv.co.jp/friday-mystery/'), true);
eq('未登録のURLは取得しない', !!findLinkPreviewTarget('https://example.com/'), false);
eq('完全一致のみ（パス違い）', !!findLinkPreviewTarget('https://www.ntv.co.jp/'), false);

console.log(fail ? `リンクプレビューテスト: ${fail} 件失敗` : 'リンクプレビューテスト: 全件OK');
process.exit(fail ? 1 : 0);
