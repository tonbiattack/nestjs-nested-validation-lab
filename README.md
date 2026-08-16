# NestJS Nested Validation Lab

NestJSの`ValidationPipe`でネストされたDTOを検証する際、`@ValidateNested()`だけを付けて`@Type(() => ChildDto)`を省略すると、HTTPから受けたplain objectの内部制約が実行されず、不正な値を保存してしまう問題を再現する教材です。

## 前提環境

Node.js 22系、pnpm 11系、NestJS 10.4.15、class-validator 0.14.1、class-transformer 0.5.1、Jest 29.7.0を利用します。依存関係は`pnpm-lock.yaml`に固定しています。

## 再現

```bash
pnpm install
git checkout bcce580
pnpm run repro
pnpm run build
```

`arrivalAt: "tomorrow-morning"`はISO 8601日時ではないため、APIは400で拒否し、保存件数を0のままにするべきです。しかし修正前は201を返して1件保存します。ビルドは成功するため、原因はコンパイル不足ではなく、ネストされた入力値の実行時変換・検証境界です。

## 修正後の検証

```bash
git checkout 68be7b1
pnpm test
pnpm run build
```

`delivery`プロパティに`@Type(() => DeliveryWindowDto)`を追加します。これにより、`ValidationPipe({ transform: true })`がplain objectをネストDTOのインスタンスへ変換し、`@IsISO8601()`が実行されます。

## 構成

| パス | 役割 |
|---|---|
| `src/app.module.ts` | DTO、コントローラ、インメモリ保存サービス |
| `test/shipments.e2e-spec.ts` | HTTPステータスと保存件数を検証するE2Eテスト |
| `evidence/` | 失敗時・修正後のテスト／ビルド出力 |
| `docs/debugging-record.md` | 観測、仮説、原因、制約の記録 |
| `docs/article.md` | Qiita向け日本語記事 |

## Git履歴

| コミット | 内容 |
|---|---|
| `bcce580` | 無効なネスト日時が201で保存される再現状態 |
| `68be7b1` | `@Type`追加によるネストDTO検証の修正 |

## 制約

教材はインメモリ保存を使い、DB・認証・外部サービスには依存しません。本番では、DTO検証に加え、認可、業務上の日付制約、永続層の整合性制約を別の責務として設計してください。
