# NestJSでネストDTOの日時検証がすり抜ける理由：`@Type`を最小再現から理解する

## この記事で扱う問題

NestJSの`ValidationPipe`を有効にしているにもかかわらず、ネストされたリクエストボディ内の不正な日時が400にならず、201で保存されることがあります。原因は、子DTOの制約を定義していても、HTTPから届くplain objectを子DTOのインスタンスへ変換する情報が欠けていることです。

本記事では、配送登録APIの`delivery.arrivalAt`がISO 8601日時でなければ400にし、保存を行わない契約を扱います。結論は、`@ValidateNested()`に加えて`@Type(() => DeliveryWindowDto)`を指定し、ネスト値の変換先を明示することです。[1] [2] [3]

再現コード、失敗・修正のGit履歴、実行証拠は[nestjs-nested-validation-lab](https://github.com/tonbiattack/nestjs-nested-validation-lab)にあります。

## 既存題材との差分

既存のNestJS記事には、BFFが下流の500を200へ変換する問題、requestIdの伝播漏れ、クエリ文字列の真偽値変換があります。今回の題材は、HTTP入力の**ネストDTO変換と検証の境界**です。下流通信やクエリ変換ではなく、コントローラへ到達する前の`ValidationPipe`で発火します。

## 期待していた挙動と実際の挙動

`delivery.arrivalAt`はISO 8601日時だけを受け付けます。`"tomorrow-morning"`は人間には意味が通じますが、API契約の日時形式ではありません。

| HTTP入力 | 期待ステータス | 期待する保存件数 | 修正前 |
|---|---:|---:|---|
| `arrivalAt: "tomorrow-morning"` | 400 | 0 | 201、1件保存 |
| `arrivalAt: "2026-08-16T10:00:00.000Z"` | 201 | 1 | 201、1件保存 |

修正前のDTOは次の通りです。

```ts
export class DeliveryWindowDto {
  @IsISO8601()
  arrivalAt!: string;
}

export class CreateShipmentDto {
  @IsString()
  recipient!: string;

  @ValidateNested()
  delivery!: DeliveryWindowDto;
}
```

テストではグローバルに`ValidationPipe({ transform: true, whitelist: true, forbidUnknownValues: false })`を設定しています。

```bash
git checkout bcce580
pnpm install
pnpm run repro
pnpm run build
```

保存した実行証拠`evidence/bug-test.txt`では、次の差分を確認できます。

```text
Expected: 400
Received: 201
```

コンパイルは成功するため、問題はTypeScriptの型エラーではなく、HTTPで受けた値を実行時にどのクラスとして変換・検証するかです。

## 調査：何を観測し、どの仮説を除外したか

NestJSの公式ドキュメントは、ネットワークから届くpayloadはplain JavaScript objectであり、`transform: true`でDTOクラスに従ったオブジェクトへ自動変換できると説明しています。[1] class-validatorは、ネストされたオブジェクトを検証するには`@ValidateNested()`を必要とし、さらにネスト対象がクラスのインスタンスでなければ対象クラスを特定できないと説明しています。[2]

| 仮説 | 予測 | 最小実験 | 結果 | 判定 |
|---|---|---|---|---|
| `@IsISO8601()`が機能しない | 正常なDTOでも日時制約が効かない | 正常日時の対照ケースを送る | 201 | 棄却 |
| `ValidationPipe`が未適用 | recipientの制約も通らない | テスト用アプリへグローバル設定を適用 | パイプは適用済み | 棄却 |
| childがplain objectのまま | childの制約が実行されない | `@Type`なし／ありで比較 | なしは201、ありは400 | 採用 |

class-transformerの公式資料は、ネストされたobjectを変換するには、そのプロパティがどの型を含むかを`@Type`で指定する必要があると説明しています。[3]

> Nested object validation requires a class instance; otherwise the validator cannot know the target class.
>
> — class-validator documentation [2]

## 修正：なぜこの変更で直るのか

変更は`delivery`プロパティへ`@Type`を一行追加するだけです。

```ts
import { Type } from "class-transformer";

export class CreateShipmentDto {
  @IsString()
  recipient!: string;

  @ValidateNested()
  @Type(() => DeliveryWindowDto)
  delivery!: DeliveryWindowDto;
}
```

`@Type(() => DeliveryWindowDto)`により、plain objectの`delivery`は`DeliveryWindowDto`として変換されます。そのため`@ValidateNested()`が子DTOの`@IsISO8601()`を実行でき、無効な値はコントローラと保存サービスへ届く前に400になります。

`@ValidateNested()`と`@Type()`は代替関係ではありません。前者は検証を再帰させる契約、後者はplain objectの変換先を与える契約です。class-transformerがネストオブジェクトの変換に型情報を求める点を理解すると、二つを併用する理由が明確になります。[3]

## 回帰テスト

修正後のE2Eテストは、HTTPステータスだけでなく保存状態も確認します。

```ts
expect(response.status).toBe(400);

const count = await request(app.getHttpServer()).get("/shipments/count");
expect(count.body).toEqual({ count: 0 });
```

```bash
git checkout 68be7b1
pnpm test
pnpm run build
```

実測結果は次の通りです。

```text
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
$ tsc -p tsconfig.build.json
```

失敗ケースは400と件数0を、対照ケースは201と作成結果を維持して検証します。これにより「エラーになった」だけでなく、「不正入力が保存されなかった」ことを確認できます。

## 制約

この教材は`forbidUnknownValues: false`を明示し、`@Type`がないネストDTOで子制約が実行されない条件を固定しています。本番では`forbidUnknownValues`、`whitelist`、`forbidNonWhitelisted`の設定を互換性と脅威モデルに合わせて検討してください。[1] DTO検証は認可、日時の業務ルール、永続層の整合性制約を代替しません。

## まとめ

第一に、NestJSのHTTP payloadは最初はplain objectです。第二に、ネスト値を検証するには`@ValidateNested()`だけでなく、`@Type(() => ChildDto)`で変換先を指定します。第三に、回帰テストでは400だけでなく、保存状態を独立して読み、無効な入力が副作用を起こしていないことまで確認します。

## 参考資料

[1]: https://docs.nestjs.com/techniques/validation "NestJS Documentation: Validation"
[2]: https://github.com/typestack/class-validator#validating-nested-objects "class-validator: Validating nested objects"
[3]: https://github.com/typestack/class-transformer#working-with-nested-objects "class-transformer: Working with nested objects"
