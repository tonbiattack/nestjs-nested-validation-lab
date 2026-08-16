# デバッグ記録：ネストDTOの日時検証がすり抜ける

## 前提

Node.js 22系、NestJS 10.4.15、class-validator 0.14.1、class-transformer 0.5.1、Jest 29.7.0を使用した。アプリケーションはグローバルに次の`ValidationPipe`を適用している。

```ts
new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidUnknownValues: false
})
```

## 期待契約

`POST /shipments`の`delivery.arrivalAt`はISO 8601日時でなければならない。不正値はHTTP 400で拒否し、保存済みshipment数は0のままにする。

## 観測された事実

再現コミット`bcce580`で次を実行した。

```bash
pnpm run repro
pnpm run build
```

`arrivalAt: "tomorrow-morning"`を送ると、E2Eテストは`Expected: 400`に対して`Received: 201`で失敗した。`GET /shipments/count`の期待値は`{ count: 0 }`だが、作成処理は実行済みである。`pnpm run build`は成功した。

## 仮説比較

| 仮説 | 予測 | 最小実験 | 結果 | 判定 |
|---|---|---|---|---|
| `@IsISO8601()`の指定が不正 | 正常なネストDTOでも日時が通る | 正常日時を送る対照テスト | 201 | 棄却 |
| `ValidationPipe`が未適用 | `recipient`の型も検証されない | テストでグローバルパイプを設定 | パイプは適用済み | 棄却 |
| ネストplain objectが`DeliveryWindowDto`に変換されない | childの`@IsISO8601()`が実行されない | `@Type`なし／ありで同じHTTP入力を比較 | なしは201、ありは400 | 採用 |

## 根本原因

`@ValidateNested()`はネスト検証を指示するが、HTTPから到着する値はplain objectである。`DeliveryWindowDto`へ変換する型情報を`delivery`プロパティに指定していないため、内部の`@IsISO8601()`が適用されなかった。

## 最小修正

`delivery`に`@Type(() => DeliveryWindowDto)`を追加した。

```ts
@ValidateNested()
@Type(() => DeliveryWindowDto)
delivery!: DeliveryWindowDto;
```

この変更によって、`transform: true`の`ValidationPipe`がネスト値を`DeliveryWindowDto`として扱い、無効な日時を400として返す。

## 回帰結果

修正コミット`68be7b1`で`pnpm test`と`pnpm run build`を実行した。E2Eテスト2件とビルドは成功した。失敗ケースは400と保存件数0を、対照ケースは201と作成結果を検証する。

## 制約

この教材は`forbidUnknownValues: false`を明示し、`@Type`を欠いたときの検証抜けを決定的に再現している。本番での`forbidUnknownValues`、`whitelist`、`forbidNonWhitelisted`の選択は、APIの互換性と脅威モデルに従って別途決める必要がある。DTO検証は日時の業務的な受付可能性や認可を代替しない。
