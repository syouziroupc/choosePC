# choosePC Affiliate Network: A8.net

## 方針

choosePC の外部アフィリエイトは A8.net を単一の管理ネットワークとして扱う。
ランキング・評価は商用情報を参照せず、商用リンクはランキング確定後にのみ付与する。

- 選定ネットワーク: `a8`
- 表示名: `A8.net`
- `programType=affiliate` のプログラムは必ず `affiliate_network=a8`
- A8 以外の affiliate network は D1 制約で拒否する
- 加盟・提携・広告リンク発行が完了していない案件を active にしない
- 正式な A8 広告リンクを改変して捏造しない

## 初回登録

1. A8.net で `https://www.szpc.jp/` を運営サイトとして登録する。
2. 法人名義・振込口座・必要な登録情報を正規に入力する。
3. 利用したい広告主プログラムへ提携申請する。
4. 提携完了後、A8 の管理画面から正式な広告リンクまたは商品リンクを取得する。

A8 アカウント、広告主プログラム ID、正式な広告 URL は外部契約で発行される値なので、choosePC 側で推測・生成しない。

## choosePC への登録

管理 API `/api/internal/commercial/upsert` または Operations から以下を登録する。

```json
{
  "program": {
    "key": "merchant-program-key",
    "merchant": "広告主名",
    "programType": "affiliate",
    "status": "paused",
    "externalProgramId": "A8側で確認できるID（任意）",
    "disclosureText": "広告・アフィリエイトリンクを含みます。",
    "sourceUrl": "https://...",
    "clickRefParam": "id1"
  },
  "links": [
    {
      "offerId": "offer-...",
      "destinationUrl": "A8で正式に発行したhttps広告リンク"
    }
  ]
}
```

最初は `paused` で登録し、リンク・遷移先・開示表示を確認してから `active` にする。

## A8 パラメータ計測

choosePC がクリック ID を付与できるパラメータは `id1` ～ `id5` のみ。
広告主プログラム側でパラメータ計測が利用できることを確認した場合だけ設定する。

Amazon・楽天の A8 プログラムでは A8 パラメータ計測および Link Manager の対象外として扱い、`clickRefParam` は未設定にする。
choosePC 自身の `outbound_clicks` にはクリックを記録できるため、A8側へサブIDを送れない案件でも内部の送客件数は計測できる。

## 稼働判定

公開 API:

`GET /api/v1/affiliate/status`

`readyForTraffic=true` になる条件:

1. A8 の `active` プログラムが1件以上ある
2. その active プログラムに有効なオファーリンクが1件以上紐付いている

A8を選定しただけ、または `paused` のみの場合は `awaiting-a8-program-link` のままにする。

## 停止・契約終了

広告主との提携終了時は該当プログラムを直ちに `paused` にする。
プログラム更新時、attribution link は完全置換されるため削除済みリンクは残らない。
active な商用リンクが無い商品は通常の `product_url` にフォールバックする。
