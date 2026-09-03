# 請求とプラン

CheckStation サブスクリプションの顧客向けリファレンスです。以下の数値は製品と同じプランカタログから埋め込まれます。商用詳細がまだ設定可能、またはこの環境で未提供の場合、このページはルールを創作せずその旨を記載します。

Web での有料チェックアウトは **Stripe** を使用。Apple App Store 購入はアカウントで購入元として認識されますが、Apple アプリ内課金の実行はまだ提供されていません。

## 1. 利用可能なプラン

CheckStation には 3 つのプランがあります:

- **{{PLAN_BASIC_NAME}}** — 無料
- **{{PLAN_PLUS_NAME}}** — 有料
- **{{PLAN_BUSINESS_NAME}}** — 有料

Free、Pro、Enterprise などの別プランはありません。

新規ワークスペースは作成時に自動的に **7 日間の Business トライアル** を受け取ります。カード不要。トライアルは 1 回限りで、Stripe または Apple のサブスクリプションではありません。

## 2. Basic

{{PLAN_BASIC_NAME}} は無料で、有料サブスクリプション終了後も利用可能です。

Standard Group、キオスクビルダー（全カードと入力テンプレート）、履歴、グループメール送信者を含みます。**Structured Group、Staff/Admin シート、レポートエクスポート、転送メールは含まれません**。

Basic では指定のワークスペース配置に**広告が表示**されます。[Basic の広告](#16-basic-の広告) を参照。

## 3. Plus

{{PLAN_PLUS_NAME}} は最初の有料プラン。広告なし。Standard Group とメンバーの上限が大きい。Admin と Staff シート。CSV、Excel、PDF エクスポート。転送メール。

Plus では **Structured Group は含まれません**。

## 4. Business

{{PLAN_BUSINESS_NAME}} は Plus の機能に加え、Structured Group、クラス、より大きな上限、Standard → Structured クラススナップショットインポートを含みます。

## 5. 月額請求

有料プランは **月額** で請求可能。請求間隔はチェックアウト時に選択し、後から Stripe 管理サブスクリプションで変更可能。間隔変更は期間終了時に有効。[月額 → 年額](#22-月額--年額) を参照。

## 6. 年額請求

有料プランは **年額** で請求可能。年額リスト価格は、月額で 12 か月支払う場合と比べて約 2 か月分お得です。

## 7. 現在の価格

価格はワークスペースの**請求マーケット**により異なります。現在の請求カタログには次の 2 マーケットがあります:

- **Global** — USD リスト価格（下表）
- **Japan** — 該当マーケットでは製品に JPY リスト価格を表示

請求カタログの Global（USD）リスト価格:

| プラン | 月額 | 年額 |
| --- | --- | --- |
| {{PLAN_BASIC_NAME}} | 無料 | 無料 |
| {{PLAN_PLUS_NAME}} | {{PLAN_PRICE_PLUS_MONTHLY}} | {{PLAN_PRICE_PLUS_YEARLY}} |
| {{PLAN_BUSINESS_NAME}} | {{PLAN_PRICE_BUSINESS_MONTHLY}} | {{PLAN_PRICE_BUSINESS_YEARLY}} |

税金、支払い方法手数料、Stripe の按分金額は Stripe が計算。CheckStation はこの記事でそれらの金額を創作しません。

## 8. 各プランに含まれるもの

| 機能 | Basic | Plus | Business |
| --- | --- | --- | --- |
| Standard Group | 可 | 可 | 可 |
| Structured Group / クラス | 不可 | 不可 | 可 |
| キオスクテンプレート | すべて | すべて | すべて |
| Admin / Staff | 不可 | 可 | 可 |
| CSV / Excel / PDF エクスポート | 不可 | 可 | 可 |
| 転送メール | 不可 | 可 | 可 |
| クラスへのスナップショットインポート | 不可 | 不可 | 可 |
| 広告 | あり | なし | なし |

グループのアクション後メールは、設定した**グループメール送信者**（カスタム SMTP、Gmail アプリパスワード、Outlook / Microsoft 365 SMTP、Yahoo Mail アプリパスワード）を使用します。送信者の準備ができていれば全プランで利用可能。転送メールは Plus と Business。

## 9. グループ上限

アクティブとアーカイブのグループ上限は別。アーカイブ済みグループはアクティブ上限を消費しません。

| 上限 | Basic | Plus | Business |
| --- | --- | --- | --- |
| アクティブ Standard Group | {{PLAN_BASIC_LIMIT_ACTIVE_STANDARD_GROUPS}} | {{PLAN_PLUS_LIMIT_ACTIVE_STANDARD_GROUPS}} | {{PLAN_BUSINESS_LIMIT_ACTIVE_STANDARD_GROUPS}} |
| アクティブ Structured Group | {{PLAN_BASIC_LIMIT_ACTIVE_STRUCTURED_GROUPS}} | {{PLAN_PLUS_LIMIT_ACTIVE_STRUCTURED_GROUPS}} | {{PLAN_BUSINESS_LIMIT_ACTIVE_STRUCTURED_GROUPS}} |
| アーカイブ済みグループ | {{PLAN_BASIC_LIMIT_ARCHIVED_GROUPS}} | {{PLAN_PLUS_LIMIT_ARCHIVED_GROUPS}} | {{PLAN_BUSINESS_LIMIT_ARCHIVED_GROUPS}} |

## 10. メンバー上限

| 上限 | Basic | Plus | Business |
| --- | --- | --- | --- |
| メンバー | {{PLAN_BASIC_LIMIT_MEMBERS}} | {{PLAN_PLUS_LIMIT_MEMBERS}} | {{PLAN_BUSINESS_LIMIT_MEMBERS}} |

## 11. 参加者とクラス上限

| 上限 | Basic | Plus | Business |
| --- | --- | --- | --- |
| Standard Group あたりの参加者 | {{PLAN_BASIC_LIMIT_PARTICIPANTS_PER_STANDARD_GROUP}} | {{PLAN_PLUS_LIMIT_PARTICIPANTS_PER_STANDARD_GROUP}} | {{PLAN_BUSINESS_LIMIT_PARTICIPANTS_PER_STANDARD_GROUP}} |
| Structured Group あたりのクラス | {{PLAN_BASIC_LIMIT_CLASSES_PER_STRUCTURED_GROUP}} | {{PLAN_PLUS_LIMIT_CLASSES_PER_STRUCTURED_GROUP}} | {{PLAN_BUSINESS_LIMIT_CLASSES_PER_STRUCTURED_GROUP}} |
| クラスあたりの参加者 | {{PLAN_BASIC_LIMIT_PARTICIPANTS_PER_CLASS}} | {{PLAN_PLUS_LIMIT_PARTICIPANTS_PER_CLASS}} | {{PLAN_BUSINESS_LIMIT_PARTICIPANTS_PER_CLASS}} |

## 12. Admin と Staff 上限

| 上限 | Basic | Plus | Business |
| --- | --- | --- | --- |
| ワークスペース Admin | {{PLAN_BASIC_LIMIT_WORKSPACE_ADMINS}} | {{PLAN_PLUS_LIMIT_WORKSPACE_ADMINS}} | {{PLAN_BUSINESS_LIMIT_WORKSPACE_ADMINS}} |
| ワークスペース Staff | {{PLAN_BASIC_LIMIT_WORKSPACE_STAFF}} | {{PLAN_PLUS_LIMIT_WORKSPACE_STAFF}} | {{PLAN_BUSINESS_LIMIT_WORKSPACE_STAFF}} |

Basic ではシートが 0 のためスタッフページはロック。

## 13. Structured Group

Business のみ Structured Group を作成・運用可能。Business からダウングレードすると、既存の Structured Group はプラン制限。削除されません。[グループとメンバー](/groups-members) を参照。

## 14. エクスポート

Plus と Business は出席レポートを **CSV**、**Excel (.xlsx)**、**PDF** でエクスポート可能。Basic はワークスペース内でレポートを閲覧できますが、それらのファイルはエクスポート不可。

Staff のエクスポートは割り当てグループに限定され、エクスポートを含むプランが必要。

## 15. 転送メール

転送メールはグループのアクション後メッセージの追加非公開コピー（最大 3 アドレス）。Plus と Business に含まれ、Basic には含まれません。

参加者メール（チェックインした人物のアドレス）やグループの SMTP 送信者とは別です。

## 16. Basic の広告

Basic では、次の配置に広告が表示される場合があります:

- ダッシュボードバナー
- グループバナー
- キオスク起動前（インタースティシャル）
- キオスク終了後（インタースティシャル）
- キオスクビルダーを離れるとき（インタースティシャル）

ライブ参加者キオスク操作中、およびメンバー、履歴、スタッフ、アカウントには**広告は表示されません**。

Plus と Business には広告なし。プラットフォームオペレーターのキルスイッチでプランを変えずに広告を非表示にできます。ローカル開発はモック広告プロバイダーを使用。広告失敗でダッシュボード、グループ、キオスク起動をブロックしてはなりません。

## 17. アップグレード

ワークスペース **オーナー** が **アカウント → サブスクリプション** からアップグレード。

Web 有料アップグレードは Stripe Checkout またはアカウント内プラン変更（既存 Stripe サブスクリプションの有無による）。

同一間隔の Plus → Business は**即時**。その他の変更は予定される場合あり。以下のセクションを参照。

Staff と Admin はプランを変更できません。

## 18. 同一間隔の Plus → Business アップグレード

Plus 月額から Business 月額（または Plus 年額 → Business 年額）の場合、アップグレードは**即時**。

Stripe が未使用 Plus 期間をクレジットとして計算し、残りの Business 差額を按分請求。CheckStation はその金額を創作しません。プレビューが利用可能な場合、確認前にアカウントに Stripe 計算プレビューを表示。

Stripe がサポートする範囲で請求サイクル更新日は保持。Plus で既に支払った期間の上に Business 年額全額を請求しません。

## 19. 按分

按分は**同一間隔の有料アップグレード**に適用。金額は Stripe が計算。

**即時按分請求がない**変更:

- 月額 ↔ 年額の間隔変更
- プラン + 間隔の組み合わせ変更（期間終了まで待機）

CheckStation が独自の按分式を表示することは期待しないでください。

## 20. ダウングレード

同一間隔の **Business → Plus** は現在の有料期間終了に**予定**。

それまで:

- Business アクセスを維持
- グループとメンバーは早期にプラン制限されない
- 予定ダウングレードをキャンセル可能

期間終了時、ワークスペースは Plus になり、利用が Plus 上限を超える場合はプラン制限ルールが実行。

有料プランから Basic へのダウングレードは **キャンセル** であり、Plus ダウングレードではありません。[サブスクリプションのキャンセル](#26-サブスクリプションのキャンセル) を参照。

## 21. 予定プラン変更

予定変更は現在の有料期間終了まで待機。含まれるもの:

- Business → Plus
- 月額 ↔ 年額
- プラン + 間隔の組み合わせ（例: Plus 月額 → Business 年額）
- キャンセル（期間またはトライアル終了までアクセス）

有効になる前に予定変更をキャンセル可能。[予定変更のキャンセル](#25-予定変更のキャンセル) を参照。

## 22. 月額 → 年額

月額から年額への変更は常に**期間終了に予定**。間隔のみの変更に即時請求も按分もありません。

## 23. 年額 → 月額

年額から月額への変更も**期間終了に予定**。残り年額期間は即時月額請求書に変換されません。

## 24. プラン + 間隔の組み合わせ変更

**プランと間隔の両方**を切り替える変更（Plus 月額 → Business 年額、Business 年額 → Plus 月額など）は、**すべて**期間終了に予定。

その組み合わせ変更に即時ティアアップグレードも按分プレビューもありません。対象プランは有効日に適用。

同一間隔の Plus → Business は上記の即時パス。

## 25. 予定変更のキャンセル

Stripe 管理の予定変更が保留中の間、オーナーは **アカウント → サブスクリプション** から取り消し可能:

- 予定キャンセル → **再開**（現在の有料プランと更新日を維持。新 Checkout なし）
- 予定 Business → Plus → **Business を維持**（Stripe スケジュールを解除）
- 予定間隔または組み合わせ変更 → 適用前にスケジュールをキャンセル

取り消しには Stripe 確認の成功が必要。Apple 管理サブスクリプションはこれらの Stripe アクションを使用しません。

## 26. サブスクリプションのキャンセル

**アカウント → サブスクリプション** からキャンセル。キャンセルは **有料期間終了** または **トライアル終了** に予定。

その日まで現在の有料（またはトライアル）アクセスを維持。その後ワークスペースは Basic。

キャンセルは**アカウント削除でもデータ削除でもありません**。

既にキャンセル済みでアクセスが終了していない場合、**再開** を使用。

## 27. 期間終了までのアクセス

有効日まで現在プランの機能と上限を維持。低いプランからのプラン制限は早期適用されません。

有効日後、権限は新プラン（Plus、またはキャンセル／失敗後の Basic）に従います。

## 28. トライアル動作

すべての新規通常ワークスペースは作成時に自動的に **{{BUILTIN_TRIAL_DAYS}} 日間 Business**。**カード不要。追加のアクティベーションステップなし**。

トライアルは 1 回限り。後のキャンセル、支払い方法変更、プロバイダー切り替えでは復元されません。このトライアル以前に存在したワークスペースと CheckStation 管理ワークスペースは対象外。

何もしない場合、無料 1 週間終了時に **Basic**。1 週間中に **Plus** を選ぶと、その日まで Business を維持し、その後 Plus 開始。**Business** を選ぶと Business を維持し、無料 1 週間終了時に有料 Business 請求開始。有料プラン選択で無料 1 週間は短縮されません。

**現在の環境:** トライアルは {{TRIAL_STATUS}}。

## 29. 支払い失敗

最初の定期支払い失敗で**即座に**ワークスペースをダウングレードしません。

Stripe が Stripe に従ってリトライ。CheckStation は別のリトライエンジンを実行しません。

## 30. 猶予期間

猶予開始の失敗後 **{{PAYMENT_GRACE_DAYS}} 日間**、現在の有料権限を維持。

猶予中は 1 日 1 回警告メール（プラットフォーム請求警告コマンド。デプロイでスケジュール）。

支払いが回復すると猶予はクリアされ、有料プランを維持。

## 31. 未解決失敗後の Basic への復帰

猶予後も請求が未解決で Stripe の最終結果が出た場合、有料アクセスは終了しワークスペースは **Basic**。利用が Basic 上限を超える場合はプラン制限ルールが適用。データは自動削除されません。

未払いキャンセルまたは猶予失敗後、準備ができたらアカウントから再サブスクライブ可能。

## 32. ダウングレード後のプラン制限データ

メンバー、グループ、その他の利用が新プランを超える場合:

- 余分な項目はワークスペースに残る
- プラン制限として表示
- 上限超過を維持する形で開く／起動／編集できない
- 余分な項目をアーカイブするかアップグレードでロック解除

[グループとメンバー](/groups-members) を参照。

## 33. ダウングレード時の自動データ削除なし

ダウングレード、キャンセル、支払い失敗による Basic 復帰は、メンバー、グループ、ビジター、クラス、Action Record を**自動削除しません**。

## 34. Stripe 購入

Web 有料サブスクリプションは Stripe（`purchase_source=stripe`）:

- 新規有料サブスクリプションの Checkout
- 請求書、支払い方法、一部セルフサービスの Customer Portal
- アプリ内アップグレードプレビュー／適用、予定変更、キャンセル、再開

ライブ Stripe 資格情報は公開 Docs ではなくデプロイ環境で設定。

## 35. Apple 購入

アカウントは `purchase_source=apple` を保存可能。Apple 管理サブスクリプションでは、CheckStation は **Stripe ポータルと Stripe プラン変更アクションを非表示** にし、Apple で請求管理するよう案内。

Apple アプリ内課金チェックアウトは**現在の製品では未実装**。iOS/Android アプリはこのスライスでは提供されていません。

## 36. 請求ページ

オーナーは **アカウント** を開く:

- **セキュリティ** — ログインメール、バックアップメール、パスワード、2FA、アカウント削除
- **サブスクリプション** — 現在のプラン、ステータス、利用状況、アップグレード／ダウングレード／キャンセル、更新
- **請求** — 支払い概要と、購入元が Stripe の場合 Stripe Customer Portal

Staff と Admin はオーナー請求を表示しません。

## 37. 請求書と領収書

Stripe ホストの請求書と領収書は、Stripe 管理サブスクリプションで **アカウント → 請求**（Customer Portal）から開く。CheckStation は第 2 の独自請求書ストアを保持しません。

## 38. カスタマーポータル

`purchase_source=stripe` では、請求が Stripe Customer Portal を開き、支払い方法と請求書を管理。Basic ワークスペースには有料購入元もポータルもありません。Apple 管理ワークスペースは Stripe Portal を開きません。

## 39. キャンセル vs アカウント削除

| アクション | 内容 |
| --- | --- |
| サブスクリプションをキャンセル | 期間／トライアル終了で有料アクセス終了。ワークスペースは Basic。データは残る |
| アカウントを削除 | アカウント → セキュリティ（危険ゾーン）からオーナー／ワークスペースを完全削除。請求キャンセルではない |

キャンセルせずにアカウントを削除する必要はありません。アカウント削除は不可逆で、更新停止の方法ではありません。

## 40. よくある請求の質問

**Staff がプランを変更できる？** いいえ。オーナーのみ。

**ダウングレードでレコードは削除される？** いいえ。

**ダウングレードはいつ有効？** Business → Plus と間隔／組み合わせ変更は現在の有料期間終了。同一間隔の Plus → Business は即時。

**請求書はどこ？** Stripe サブスクリプションはアカウント → 請求、Stripe Customer Portal 経由。

**なぜ猶予期間中？** 定期支払いが失敗。Stripe がリトライする間 {{PAYMENT_GRACE_DAYS}} 日間有料アクセスを維持。

**月額から年額に即時切り替えできる？** いいえ。間隔変更は期間終了まで待機。

より短い回答: [FAQ](/faq)。

## 41. 関連ドキュメント

- [CheckStation をはじめる](/getting-started) — 新規ワークスペースには 7 日間の Business トライアル付き
- [グループとメンバー](/groups-members) — プラン制限メンバーとグループ
- [キオスク設定](/kiosk-setup) — Basic の起動／終了周辺の広告
- [FAQ](/faq) — 検索可能な請求の質問
- [利用規約](/terms-of-use) — サブスクリプション契約
- [プライバシーポリシー](/privacy-policy) — 請求とアカウントデータ
