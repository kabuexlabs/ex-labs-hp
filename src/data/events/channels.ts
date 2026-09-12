// 公式販売先。手数料が不明なら「購入画面で確認」と書き、総額が確定して見える表示にしない。
import type { SalesChannel } from './types';

export const channels: SalesChannel[] = [
  {
    id: 'escape-id',
    name: 'escape.id',
    feeNote: '表示価格のほか、別途手数料がかかる場合があります（購入画面で確認）',
  },
];
