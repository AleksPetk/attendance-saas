"""Canonical published FAQ entries (Japanese). Create-if-missing; do not duplicate into frontends."""

from content.models import FaqCategory

FAQ_ENTRIES_JA = (
    # Getting Started
    {
        "slug": "how-do-i-create-my-workspace",
        "question": "ワークスペースはどうやって作成しますか？",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "register, signup, account, workspace, get started, 登録, アカウント, ワークスペース",
        "related_document_slug": "getting-started",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "CheckStation ウェブサイトで **はじめる** を開く（または `/register` にアクセス）。"
            "メールとパスワードでアカウントを作成するか、有効な場合は Google または Apple を使用。"
            "ワークスペースは **7 日間の Business トライアル**（カード不要）付きで作成されます。"
            "メールとパスワードで登録した場合、ワークスペースを利用する前にメール認証が必要です。"
        ),
    },
    {
        "slug": "do-i-need-to-name-my-workspace",
        "question": "ワークスペースに名前を付ける必要がありますか？",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "workspace name, organization name, ワークスペース名, 組織名",
        "related_document_slug": "getting-started",
        "sort_order": 20,
        "answer": (
            "登録時にワークスペースは自動作成されます。サインアップ中に別途ワークスペース名を"
            "入力する画面はありません。メール認証とサインイン後、その 1 つのワークスペースで作業します。"
        ),
    },
    {
        "slug": "where-do-i-create-my-first-group",
        "question": "最初のグループはどこで作成しますか？",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "create group, first group, groups page, グループ作成, 最初のグループ",
        "related_document_slug": "getting-started",
        "featured": True,
        "sort_order": 30,
        "answer": (
            "オーナーとしてサインインし、**グループ** を開いて **グループを作成**。"
            "名前を付け、Standard（全プラン）または Structured（Business のみ）を選択。"
            "タイプは後から変更できません。[CheckStation をはじめる](/getting-started) を参照。"
        ),
    },
    {
        "slug": "what-happens-after-i-register",
        "question": "登録後は何が起きますか？",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "verify email, check your email, confirmation, メール認証",
        "related_document_slug": "getting-started",
        "sort_order": 40,
        "answer": (
            "**メールを確認してください** 画面に移動します。認証リンクを開く（24 時間で失効）。"
            "必要なら **認証メールを再送**。認証後、CheckStation に進むか **ログイン** からサインイン。"
        ),
    },
    {
        "slug": "is-there-an-events-area",
        "question": "イベント領域はありますか？",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "events, event, one-time, イベント",
        "sort_order": 50,
        "answer": (
            "現在の製品にはありません。チェックイン文脈は **グループ** です。"
            "各有料オーナーは正確に 1 つのワークスペースを持ちます。"
        ),
    },
    {
        "slug": "how-do-i-record-a-test-check-in",
        "question": "テストチェックインはどう記録しますか？",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "test check-in, first check-in, launch kiosk, テストチェックイン",
        "related_document_slug": "getting-started",
        "sort_order": 60,
        "answer": (
            "グループを作成し、少なくとも 1 人の参加者を追加、グループとキオスク設定を完了"
            "（終了コードを含む）して **キオスクを起動**。人物を特定し、アクションを選び、"
            "確認。後で **履歴** で確認。"
        ),
    },
    {
        "slug": "what-is-on-the-workspace-sidebar",
        "question": "ワークスペースのサイドバーには何がありますか？",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "dashboard, members, groups, history, staff, account, サイドバー",
        "sort_order": 70,
        "answer": (
            "ダッシュボード、メンバー、グループ、履歴、スタッフ（Plus と Business。Basic ではロック）、"
            "アカウント（オーナーのみ）。"
        ),
    },
    {
        "slug": "owners-vs-staff-login",
        "question": "オーナーとスタッフは同じログイン画面を使いますか？",
        "category": FaqCategory.GETTING_STARTED,
        "keywords": "staff login, owner login, workspace id, スタッフログイン",
        "related_document_slug": "getting-started",
        "sort_order": 80,
        "answer": (
            "いいえ。オーナーは **ログイン** でメールとパスワード。スタッフは **スタッフログイン** で"
            "ワークスペース ID + ユーザー名 + パスワード。"
        ),
    },
    # Account & Security
    {
        "slug": "where-do-i-change-my-password",
        "question": "パスワードはどこで変更しますか？",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "password, security, owner account, パスワード, セキュリティ",
        "sort_order": 10,
        "answer": (
            "オーナーは **アカウント → セキュリティ** を開く。スタッフのパスワードリセットは"
            "オーナー／Admin がスタッフページで行い、オーナーのアカウント領域では行いません。"
        ),
    },
    {
        "slug": "can-i-turn-on-2fa",
        "question": "二要素認証を有効にできますか？",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "2fa, totp, two factor, security, 二要素認証",
        "sort_order": 20,
        "answer": (
            "オーナーは **アカウント → セキュリティ** で任意の TOTP 2FA を有効化可能。"
            "ワークスペース Staff/Admin ログインは別アカウントで、オーナーの 2FA 設定は使用しません。"
        ),
    },
    {
        "slug": "what-is-backup-email",
        "question": "バックアップメールとは何ですか？",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "backup email, recovery, security, バックアップメール",
        "sort_order": 30,
        "answer": (
            "オーナーは **アカウント → セキュリティ** でバックアップメールを設定可能。"
            "アカウント復旧用であり、グループのアクション後出席メール用ではありません。"
        ),
    },
    {
        "slug": "can-i-delete-my-account",
        "question": "アカウントを削除できますか？",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "delete account, danger zone, permanent deletion, アカウント削除",
        "related_document_slug": "privacy-policy",
        "featured": True,
        "sort_order": 40,
        "answer": (
            "はい。ライブ有料サブスクリプションがブロックしていない場合、オーナーは "
            "**アカウント → セキュリティ**（危険ゾーン）からアカウントとワークスペースを完全削除できます。"
            "組み込みの無料 Business トライアルのみではブロックされません。"
            "期間終了時キャンセル中も有料アクセスが続く間はブロックされます。"
            "削除は Stripe 請求を自動キャンセルしません。サブスクリプションのキャンセルとは異なります。"
        ),
    },
    {
        "slug": "why-cant-i-use-the-workspace-yet",
        "question": "登録後すぐにワークスペースを使えないのはなぜですか？",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "email verification, unverified, check your email, メール未認証",
        "sort_order": 50,
        "answer": (
            "メール認証が必要です。認証メールのリンクを開くか、"
            "メール確認画面から再送してください。"
        ),
    },
    {
        "slug": "can-staff-change-owner-security",
        "question": "スタッフはオーナーのログインや請求を変更できますか？",
        "category": FaqCategory.ACCOUNT_SECURITY,
        "keywords": "staff billing, owner security, スタッフ, 請求",
        "related_document_slug": "groups-members",
        "sort_order": 60,
        "answer": (
            "いいえ。請求、オーナーログインメール、パスワード、2FA、アカウント削除はオーナーのみ。"
        ),
    },
    # Members & Groups
    {
        "slug": "what-is-a-member",
        "question": "メンバーとは何ですか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "member, person, profile, メンバー",
        "related_document_slug": "groups-members",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "メンバーはワークスペース内の再利用可能な人物レコード。ログインしません。"
            "名前が必須。他のプロフィールフィールドは任意。"
            "[グループとメンバー](/groups-members) を参照。"
        ),
    },
    {
        "slug": "member-vs-participant",
        "question": "メンバーと参加者の違いは何ですか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "participant, membership, visitor, 参加者, ビジター",
        "related_document_slug": "groups-members",
        "featured": True,
        "sort_order": 20,
        "answer": (
            "**メンバー** は再利用可能なワークスペースの人物。**参加者** は特定グループでの"
            "その人物の参加（グループメール、PIN、グループ参加者コード）。"
            "ビジターはメンバーではない参加者です。"
        ),
    },
    {
        "slug": "can-two-members-have-the-same-name",
        "question": "2 人のメンバーが同じ名前でも大丈夫ですか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "duplicate names, same name, member id, 同名",
        "related_document_slug": "groups-members",
        "sort_order": 30,
        "answer": (
            "はい。名前は一意ではありません。Member # ID、任意のメール、写真、メモ、"
            "またはキオスクのグループ参加者コード／PIN で区別してください。"
        ),
    },
    {
        "slug": "what-happens-when-i-archive-a-member",
        "question": "メンバーをアーカイブするとどうなりますか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "archive member, restore, inactive, アーカイブ",
        "related_document_slug": "groups-members",
        "sort_order": 40,
        "answer": (
            "メンバーは開いたり編集したりできず、グループとキオスクで非アクティブ。"
            "同じ ID、プロフィール、グループ紐付けは残ります。後で復元可能。"
            "完全削除はアーカイブ後のみ。Action Record は保持。"
        ),
    },
    {
        "slug": "standard-vs-structured-groups",
        "question": "Standard Group と Structured Group の違いは何ですか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "structured, classes, standard group, business, Structured",
        "related_document_slug": "groups-members",
        "featured": True,
        "sort_order": 50,
        "answer": (
            "Standard Group は参加者をグループに直接配置（全プラン）。"
            "Structured Group は参加者をグループ内の **クラス** に配置（**Business** のみ）。"
            "タイプは作成時に選択し、変更不可。"
        ),
    },
    {
        "slug": "why-is-my-group-plan-locked",
        "question": "グループがプラン制限になるのはなぜですか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "plan locked, plan-locked, downgrade, locked group, プラン制限",
        "related_document_slug": "groups-members",
        "featured": True,
        "sort_order": 60,
        "answer": (
            "ダウングレード後、新上限を超えるグループ（または Structured Group を含まない"
            "プラン上の Structured Group）はワークスペースに残るが開いたり起動したりできません。"
            "自動削除はありません。余分なグループをアーカイブするかアップグレードでロック解除。"
        ),
    },
    {
        "slug": "what-happens-to-data-if-i-downgrade",
        "question": "ダウングレードするとデータはどうなりますか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "downgrade members, data deletion, plan lock, ダウングレード",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 70,
        "answer": (
            "レコードは削除されません。余分なメンバーとグループはプラン制限。"
            "上限超過の利用を増やす作成や復元は、利用を減らすかプランを変更するまでブロック。"
        ),
    },
    {
        "slug": "what-is-a-visitor",
        "question": "ビジターとは何ですか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "visitor, group-only, lightweight participant, ビジター",
        "related_document_slug": "groups-members",
        "sort_order": 80,
        "answer": (
            "ビジターはグループ限定参加者。そのグループ（またはクラス）にのみ存在し、"
            "メンバー一覧には表示されません。ビジターをメンバーに変換する機能は未実装。"
        ),
    },
    {
        "slug": "how-do-group-participant-codes-work",
        "question": "グループ参加者コードはどう機能しますか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "participant code, g1-5679, identifier, 参加者コード",
        "related_document_slug": "groups-members",
        "sort_order": 90,
        "answer": (
            "CheckStation はグループに追加されたとき `G{group id}-{4 digits}` 形式で"
            "コードを自動割り当て。そのグループ内で一意で、同じコードを保持。"
            "自分で作る必要はありません。"
        ),
    },
    {
        "slug": "where-do-pins-live",
        "question": "PIN はどこに保存されますか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "pin, participation pin, attendance code, PIN",
        "related_document_slug": "groups-members",
        "sort_order": 100,
        "answer": (
            "出席 PIN は **グループ参加** に属し、メンバープロフィールではありません。"
            "PIN は 4〜12 文字の英数字。グループで PIN 必須の場合、各運用中参加者に必要。"
            "Structured Group ではキオスクでクラス PIN も要求可能。"
        ),
    },
    {
        "slug": "can-i-add-an-existing-member-to-a-group",
        "question": "既存メンバーをグループに追加できますか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "add member, existing member, participants, メンバー追加",
        "related_document_slug": "groups-members",
        "sort_order": 110,
        "answer": (
            "はい。グループ → 参加者 → **既存メンバーを追加**。Structured Group ではクラスを選択。"
            "グループで必須の場合、グループメール／PIN を入力。"
        ),
    },
    {
        "slug": "does-removing-a-member-from-a-group-delete-them",
        "question": "グループからメンバーを削除すると削除されますか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "remove from group, deactivate membership, グループから削除",
        "related_document_slug": "groups-members",
        "sort_order": 120,
        "answer": (
            "いいえ。削除はそのグループメンバーシップを無効化。メンバーはワークスペースに残り、"
            "過去の Action Record は履歴に残ります。"
        ),
    },
    {
        "slug": "are-member-emails-required",
        "question": "メンバーのメールは必須ですか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "require email, participation email, member email, メール必須",
        "related_document_slug": "groups-members",
        "sort_order": 130,
        "answer": (
            "メンバープロフィールでは必須ではありません。グループで **メールを必須にする** が"
            "オンの場合、各運用中参加者に少なくとも 1 つの **グループ参加メール**"
            "（最大 3 アドレス）が必要。"
        ),
    },
    {
        "slug": "can-i-change-group-type-later",
        "question": "後から Standard を Structured に変更できますか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "immutable type, convert group, タイプ変更",
        "related_document_slug": "groups-members",
        "sort_order": 140,
        "answer": (
            "いいえ。作成後にタイプは変更不可。Business では Standard Group のスナップショットを"
            "Structured Group のクラスにインポート可能。元グループの変換や履歴／キオスクデザインの"
            "コピーにはなりません。"
        ),
    },
    {
        "slug": "how-do-i-permanently-delete-a-member",
        "question": "メンバーを完全削除するには？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "permanent delete, delete member, 完全削除",
        "related_document_slug": "groups-members",
        "sort_order": 150,
        "answer": (
            "先にアーカイブ。アクティブメンバーでは完全削除不可。完全削除後も Action Record は"
            "閲覧可能で、ライブメンバー紐付けはクリアされます。"
        ),
    },
    {
        "slug": "what-is-member-number",
        "question": "Member # とは何ですか？",
        "category": FaqCategory.MEMBERS_GROUPS,
        "keywords": "member id, member number, display id, Member #",
        "related_document_slug": "groups-members",
        "sort_order": 160,
        "answer": (
            "そのメンバーレコードの表示用ワークスペース ID。**Member #** と番号で表示。"
            "キオスクログインでもグループ参加者コードでもありません。"
        ),
    },
    # Kiosk
    {
        "slug": "how-do-i-launch-a-kiosk",
        "question": "キオスクはどう起動しますか？",
        "category": FaqCategory.KIOSK,
        "keywords": "launch kiosk, start kiosk, キオスク起動",
        "related_document_slug": "kiosk-setup",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "グループを開き、セットアップを完了し、キオスク **終了コード** を保存して "
            "**キオスクを起動**。[キオスク設定](/kiosk-setup) を参照。"
        ),
    },
    {
        "slug": "why-cant-i-launch-my-kiosk",
        "question": "キオスクを起動できないのはなぜですか？",
        "category": FaqCategory.KIOSK,
        "keywords": "setup incomplete, launch disabled, exit code required, 起動不可",
        "related_document_slug": "kiosk-setup",
        "featured": True,
        "sort_order": 20,
        "answer": (
            "一般的な原因: セットアップ未完了（必須メール/PIN 欠落、Structured Group に"
            "参加者がいるクラスがない）、終了コードなし、無効なキオスク設定、"
            "アーカイブまたはプラン制限グループ、権限不足、このブラウザがすでに"
            "キオスクセッションでロックされている。"
        ),
    },
    {
        "slug": "can-i-change-kiosk-design-later",
        "question": "後からキオスクデザインを変更できますか？",
        "category": FaqCategory.KIOSK,
        "keywords": "kiosk builder, templates, edit design, デザイン変更",
        "related_document_slug": "kiosk-setup",
        "sort_order": 30,
        "answer": (
            "はい。グループから **キオスクデザインを編集** をいつでも再開。"
            "起動がブロックされていてもデザイン編集可能。テンプレートは全プランで利用可能。"
        ),
    },
    {
        "slug": "how-does-kiosk-lock-work",
        "question": "キオスクリロックはどう機能しますか？",
        "category": FaqCategory.KIOSK,
        "keywords": "kiosk lock, locked session, kiosk_locked, ロック",
        "related_document_slug": "kiosk-setup",
        "sort_order": 40,
        "answer": (
            "実際の起動後、このブラウザセッションはそのグループキオスクにロックされ、"
            "ワークスペースダッシュボードを開けません。グループ **終了コード** で終了"
            "（オーナーパスワードではない）。"
        ),
    },
    {
        "slug": "how-do-kiosk-pins-work",
        "question": "キオスクでの PIN はどう機能しますか？",
        "category": FaqCategory.KIOSK,
        "keywords": "pin, class pin, participant pin, exit code, キオスク PIN",
        "related_document_slug": "kiosk-setup",
        "sort_order": 50,
        "answer": (
            "グループで PIN 必須の場合、本人特定時に **グループ参加 PIN** を入力。"
            "Structured Group キオスクでは **クラス PIN** も要求される場合あり。"
            "キオスク **終了コード** は別物: スタッフ／admin セッションの解除用で、"
            "参加者チェックイン用ではありません。"
        ),
    },
    {
        "slug": "can-i-use-a-kiosk-on-a-tablet",
        "question": "タブレットでキオスクを使えますか？",
        "category": FaqCategory.KIOSK,
        "keywords": "tablet, ipad, mobile browser, kiosk device, タブレット",
        "related_document_slug": "kiosk-setup",
        "sort_order": 60,
        "answer": (
            "はい。タブレットのブラウザでグループキオスクを起動。専用 iOS/Android キオスクアプリは"
            "現在の製品には含まれません。ライブキオスクのタブを維持。"
            "ワークスペースが必要なら終了コードで終了。"
        ),
    },
    {
        "slug": "are-kiosk-templates-plan-gated",
        "question": "キオスクテンプレートはプランで制限されますか？",
        "category": FaqCategory.KIOSK,
        "keywords": "templates, card, input, basic, テンプレート",
        "related_document_slug": "kiosk-setup",
        "sort_order": 70,
        "answer": (
            "いいえ。カードと入力テンプレートは Basic、Plus、Business すべてで利用可能。"
            "Basic では起動／終了周辺とワークスペースバナーに広告が表示される場合あり。"
        ),
    },
    {
        "slug": "can-i-turn-off-kiosk-header-footer",
        "question": "キオスクのヘッダーまたはフッターをオフにできますか？",
        "category": FaqCategory.KIOSK,
        "keywords": "header, footer, builder, ヘッダー, フッター",
        "related_document_slug": "kiosk-setup",
        "sort_order": 80,
        "answer": (
            "いいえ。ヘッダーとフッターはオフにできません。キオスクビルダーで内容は変更可能。"
        ),
    },
    {
        "slug": "is-the-builder-the-live-kiosk",
        "question": "キオスクビルダーはライブキオスクですか？",
        "category": FaqCategory.KIOSK,
        "keywords": "preview, canvas, fake sample, プレビュー",
        "related_document_slug": "kiosk-setup",
        "sort_order": 90,
        "answer": (
            "いいえ。ビルダーキャンバスはプレビュー（セットアップ未完了時はサンプルコンテンツ含む）。"
            "ライブ出席は **キオスクを起動** 後のみ。"
        ),
    },
    {
        "slug": "who-owns-the-kiosk",
        "question": "キオスクの所有者は誰ですか？",
        "category": FaqCategory.KIOSK,
        "keywords": "group-owned kiosk, workspace kiosk, キオスク所有",
        "related_document_slug": "kiosk-setup",
        "sort_order": 100,
        "answer": (
            "各グループが独自のキオスクを所有。任意のグループに割り当てる"
            "別のワークスペースキオスクはありません。"
        ),
    },
    # Attendance
    {
        "slug": "where-do-i-see-attendance-history",
        "question": "出席履歴はどこで見られますか？",
        "category": FaqCategory.ATTENDANCE,
        "keywords": "history, action record, attendance report, 履歴",
        "related_document_slug": "getting-started",
        "sort_order": 10,
        "answer": (
            "**履歴** を開く。実行された各アクションは **Action Record** を作成。"
            "レポートのエクスポートは Plus と Business。"
        ),
    },
    {
        "slug": "are-records-deleted-when-i-archive-someone",
        "question": "アーカイブすると出席レコードは削除されますか？",
        "category": FaqCategory.ATTENDANCE,
        "keywords": "history preservation, action records, archive, 履歴保持",
        "related_document_slug": "groups-members",
        "sort_order": 20,
        "answer": (
            "いいえ。アーカイブまたは参加者削除でも Action Record は保持。"
            "完全削除はライブ人物紐付けをクリアするが、履歴行は消しません。"
        ),
    },
    {
        "slug": "can-i-export-attendance",
        "question": "出席をエクスポートできますか？",
        "category": FaqCategory.ATTENDANCE,
        "keywords": "export, csv, xlsx, pdf, reports, エクスポート",
        "related_document_slug": "billing-plans",
        "sort_order": 30,
        "answer": (
            "Plus と Business は出席レポートを CSV、Excel (.xlsx)、PDF でエクスポート可能。"
            "Basic はワークスペース内でレポートを閲覧できますが、ファイルエクスポートは不可。"
        ),
    },
    {
        "slug": "does-check-in-overwrite-history",
        "question": "新しいチェックインで履歴は上書きされますか？",
        "category": FaqCategory.ATTENDANCE,
        "keywords": "action record, historical integrity, 履歴",
        "sort_order": 40,
        "answer": (
            "いいえ。実行された各アクションは新しい Action Record を作成。"
            "CheckStation は現在状態のみを保存しません。"
        ),
    },
    {
        "slug": "can-staff-see-all-history",
        "question": "スタッフはすべての履歴を見られますか？",
        "category": FaqCategory.ATTENDANCE,
        "keywords": "staff history, assigned groups, スタッフ履歴",
        "related_document_slug": "groups-members",
        "sort_order": 50,
        "answer": (
            "スタッフは割り当てグループの履歴のみ閲覧・エクスポート可能。"
            "Owner と Admin はロールに応じてワークスペース履歴を閲覧。"
        ),
    },
    # Email
    {
        "slug": "why-was-an-email-not-sent",
        "question": "メールが送信されなかったのはなぜですか？",
        "category": FaqCategory.EMAIL,
        "keywords": "email not sent, after-action, smtp, resend, メール未送信",
        "related_document_slug": "getting-started",
        "sort_order": 10,
        "answer": (
            "グループでアクション後メールが有効か、参加者に参加メールがあるか、"
            "送信者が設定済みか、アドレスが有効か確認。プラットフォームの登録／認証メールは Resend。"
            "グループ出席メールは設定したグループ送信者（カスタム SMTP、Gmail アプリパスワード、"
            "Outlook / Microsoft 365 SMTP、Yahoo Mail アプリパスワード）。"
            "広告やプラン制限はメールを送信しません。"
        ),
    },
    {
        "slug": "can-i-use-gmail",
        "question": "Gmail でグループメールを送れますか？",
        "category": FaqCategory.EMAIL,
        "keywords": "gmail, app password, smtp, Gmail",
        "sort_order": 20,
        "answer": (
            "はい。グループカスタム送信者として **Gmail アプリパスワード** を使用"
            "（通常のアカウントパスワードではない）。Gmail OAuth は提供されていません。"
            "Outlook / Microsoft 365 SMTP または Yahoo Mail アプリパスワードも使用可能。"
        ),
    },
    {
        "slug": "can-i-use-my-own-smtp",
        "question": "独自 SMTP プロバイダーを使えますか？",
        "category": FaqCategory.EMAIL,
        "keywords": "smtp, custom sender, company email, SMTP",
        "sort_order": 30,
        "answer": (
            "はい。各グループは独自のメール送信者（カスタム会社 SMTP、Gmail、"
            "Outlook / Microsoft 365、Yahoo Mail）を設定します。プラットフォームの"
            "トランザクションメール（Resend）は別で、アカウント、認証、請求警告メールに使用されます。"
        ),
    },
    {
        "slug": "what-are-forward-emails",
        "question": "転送メールとは何ですか？",
        "category": FaqCategory.EMAIL,
        "keywords": "forward emails, private copies, plus, business, 転送メール",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 40,
        "answer": (
            "転送メールはグループのアクション後メッセージの追加非公開コピー（最大 3 アドレス）。"
            "Plus と Business に含まれ、Basic には含まれません。"
            "参加者自身の通知アドレスではありません。"
        ),
    },
    {
        "slug": "how-many-participation-emails",
        "question": "参加者はいくつのメールを持てますか？",
        "category": FaqCategory.EMAIL,
        "keywords": "participation emails, three addresses, 参加メール",
        "related_document_slug": "groups-members",
        "sort_order": 50,
        "answer": (
            "グループ／クラス参加あたり最大 3 アドレス。**メールを必須にする** がオンの場合、"
            "少なくとも 1 つが必要。設定済みの全アドレスがアクション後メッセージを受信可能。"
        ),
    },
    {
        "slug": "does-member-profile-email-sync-to-the-group",
        "question": "メンバープロフィールメールはグループに同期されますか？",
        "category": FaqCategory.EMAIL,
        "keywords": "profile email, prefill, sync, 同期",
        "related_document_slug": "groups-members",
        "sort_order": 60,
        "answer": (
            "メンバー追加時、プロフィールメールがグループ参加メールの事前入力に使われる場合あり。"
            "後からメンバーを編集しても、保存済みグループメールは変更されません。"
        ),
    },
    {
        "slug": "is-platform-email-resend",
        "question": "CheckStation アカウントメールは何が送信しますか？",
        "category": FaqCategory.EMAIL,
        "keywords": "resend, verification email, platform email, Resend",
        "sort_order": 70,
        "answer": (
            "アカウント、認証、プラットフォーム請求警告メールは CheckStation の"
            "プラットフォームメール経路（Resend）。グループのカスタム SMTP 送信者とは別。"
        ),
    },
    # Staff
    {
        "slug": "what-can-staff-see",
        "question": "スタッフは何を見られますか？",
        "category": FaqCategory.STAFF,
        "keywords": "staff permissions, assigned groups, スタッフ権限",
        "related_document_slug": "groups-members",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "Staff はグループスコープ。割り当てグループで参加者操作、キオスク起動／終了、"
            "それらのグループの履歴閲覧／エクスポート。未割り当てグループや"
            "グローバルメンバー一覧は開けません。"
        ),
    },
    {
        "slug": "can-staff-edit-groups",
        "question": "スタッフはグループを編集できますか？",
        "category": FaqCategory.STAFF,
        "keywords": "staff configure, group settings, kiosk design, グループ編集",
        "related_document_slug": "groups-members",
        "sort_order": 20,
        "answer": (
            "いいえ。Staff はグループ、キオスク、メール送信者を設定できません。"
            "Owner と Admin が行います。"
        ),
    },
    {
        "slug": "can-staff-manage-members",
        "question": "スタッフはメンバーを管理できますか？",
        "category": FaqCategory.STAFF,
        "keywords": "staff members directory, メンバー管理",
        "related_document_slug": "groups-members",
        "sort_order": 30,
        "answer": (
            "Staff はグローバルメンバー一覧／プロフィール管理を使用できません。"
            "割り当てグループ内の参加者操作は可能。"
        ),
    },
    {
        "slug": "why-cant-a-staff-account-log-in",
        "question": "スタッフアカウントがログインできないのはなぜですか？",
        "category": FaqCategory.STAFF,
        "keywords": "staff login failed, workspace id, username, ログイン失敗",
        "related_document_slug": "getting-started",
        "sort_order": 40,
        "answer": (
            "オーナーのログインではなく **スタッフログイン** を使用。"
            "ワークスペース ID、ユーザー名、パスワードが必要。アカウントがアクティブであること。"
            "Staff はオーナーのメールではサインインしません。"
        ),
    },
    {
        "slug": "what-can-admin-do",
        "question": "ワークスペース Admin は何ができますか？",
        "category": FaqCategory.STAFF,
        "keywords": "admin permissions, workspace admin, Admin",
        "related_document_slug": "groups-members",
        "sort_order": 50,
        "answer": (
            "Admin はメンバー、グループ、キオスク、メール設定、履歴、Staff アカウントを管理。"
            "請求、オーナーセキュリティ、他 Admin アカウント、ワークスペース削除は不可。"
            "プラン上限は適用。"
        ),
    },
    {
        "slug": "does-basic-include-staff",
        "question": "Basic に Staff または Admin シートは含まれますか？",
        "category": FaqCategory.STAFF,
        "keywords": "basic staff, zero admin, Basic スタッフ",
        "related_document_slug": "billing-plans",
        "sort_order": 60,
        "answer": (
            "いいえ。Basic では Admin {{PLAN_BASIC_LIMIT_WORKSPACE_ADMINS}}、"
            "Staff {{PLAN_BASIC_LIMIT_WORKSPACE_STAFF}}。Basic ではスタッフページはロック。"
            "Plus では Admin {{PLAN_PLUS_LIMIT_WORKSPACE_ADMINS}}、"
            "Staff {{PLAN_PLUS_LIMIT_WORKSPACE_STAFF}}。"
        ),
    },
    # Plans
    {
        "slug": "what-is-included-in-basic",
        "question": "Basic には何が含まれますか？",
        "category": FaqCategory.PLANS,
        "keywords": "basic plan, free, ads, Basic プラン",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "Basic は無料。Standard Group（アクティブ最大 "
            "{{PLAN_BASIC_LIMIT_ACTIVE_STANDARD_GROUPS}}）、"
            "メンバー {{PLAN_BASIC_LIMIT_MEMBERS}}、全テンプレート付きキオスクビルダー、"
            "履歴を含みます。Structured Group、Staff/Admin シート、ファイルエクスポート、"
            "転送メールは含まれません。指定配置に広告が表示される場合あり。"
            "詳細: [請求とプラン](/billing-plans)。"
        ),
    },
    {
        "slug": "what-does-plus-include",
        "question": "Plus には何が含まれますか？",
        "category": FaqCategory.PLANS,
        "keywords": "plus plan, exports, staff, Plus プラン",
        "related_document_slug": "billing-plans",
        "sort_order": 20,
        "answer": (
            "Plus は有料（月額 {{PLAN_PRICE_PLUS_MONTHLY}}、年額 {{PLAN_PRICE_PLUS_YEARLY}}）。"
            "広告なし。Standard 上限拡大、Admin/Staff シート、CSV/Excel/PDF エクスポート、"
            "転送メール。Structured Group は引き続き Business のみ。"
        ),
    },
    {
        "slug": "what-does-business-include",
        "question": "Business には何が含まれますか？",
        "category": FaqCategory.PLANS,
        "keywords": "business plan, structured groups, classes, Business プラン",
        "related_document_slug": "billing-plans",
        "sort_order": 30,
        "answer": (
            "Business は有料（月額 {{PLAN_PRICE_BUSINESS_MONTHLY}}、"
            "年額 {{PLAN_PRICE_BUSINESS_YEARLY}}）。Plus に加え Structured Group、"
            "クラス、より大きな上限、Standard → クラススナップショットインポート。"
        ),
    },
    {
        "slug": "how-do-i-upgrade",
        "question": "アップグレードするには？",
        "category": FaqCategory.PLANS,
        "keywords": "upgrade, stripe, subscription, アップグレード",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 40,
        "answer": (
            "オーナーが **アカウント → サブスクリプション** で有料プランを選択。"
            "Web 購入は Stripe。同一間隔の Plus → Business は即時、Stripe 按分あり。"
        ),
    },
    {
        "slug": "current-plan-prices",
        "question": "現在の価格はいくらですか？",
        "category": FaqCategory.PLANS,
        "keywords": "price, pricing, usd, 9.99, 14.99, 価格",
        "related_document_slug": "billing-plans",
        "sort_order": 50,
        "answer": (
            "Plus は {{PLAN_PRICE_PLUS_MONTHLY}} / 月 または {{PLAN_PRICE_PLUS_YEARLY}} / 年。"
            "Business は {{PLAN_PRICE_BUSINESS_MONTHLY}} / 月 または "
            "{{PLAN_PRICE_BUSINESS_YEARLY}} / 年。Basic は無料。年額は月額で 12 か月"
            "支払う場合と比べて約 2 か月分お得。"
            "税金と Stripe 按分は Stripe が計算。"
        ),
    },
    {
        "slug": "are-kiosk-templates-on-basic",
        "question": "Basic にキオスクテンプレートは含まれますか？",
        "category": FaqCategory.PLANS,
        "keywords": "basic templates, kiosk builder, Basic テンプレート",
        "related_document_slug": "billing-plans",
        "sort_order": 60,
        "answer": (
            "はい。すべてのカードと入力キオスクテンプレートは Basic を含む全プランで利用可能。"
        ),
    },
    {
        "slug": "does-basic-have-ads",
        "question": "Basic に広告は表示されますか？",
        "category": FaqCategory.PLANS,
        "keywords": "ads, interstitial, banner, 広告",
        "related_document_slug": "billing-plans",
        "sort_order": 70,
        "answer": (
            "はい。ダッシュボードとグループのバナー、キオスク起動前、終了後、"
            "キオスクビルダー離脱時のインタースティシャル。ライブキオスク操作中は表示されません。"
            "Plus と Business には広告なし。"
        ),
    },
    {
        "slug": "where-are-invoices",
        "question": "請求書はどこにありますか？",
        "category": FaqCategory.PLANS,
        "keywords": "invoices, receipts, customer portal, 請求書",
        "related_document_slug": "billing-plans",
        "sort_order": 80,
        "answer": (
            "オーナーが **アカウント → 請求** を開く。Stripe 管理サブスクリプションでは"
            "請求書と領収書は Stripe Customer Portal にあります。"
            "CheckStation は第 2 の請求書ストアを保持しません。"
        ),
    },
    # Subscription changes
    {
        "slug": "when-does-a-downgrade-take-effect",
        "question": "ダウングレードはいつ有効になりますか？",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "downgrade, period end, business to plus, ダウングレード",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "Business → Plus は **現在の有料期間終了** に予定。それまで Business を維持。"
            "同一間隔の Plus → Business アップグレードは即時。"
        ),
    },
    {
        "slug": "what-happens-when-i-cancel",
        "question": "キャンセルするとどうなりますか？",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "cancel subscription, period end, basic, キャンセル",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 20,
        "answer": (
            "キャンセルは有料期間終了またはトライアル終了に予定。それまでアクセスを維持。"
            "その後ワークスペースは Basic。データは削除されません。"
            "有効日前なら **再開** 可能。"
        ),
    },
    {
        "slug": "can-i-change-monthly-to-yearly",
        "question": "月額から年額に変更できますか？",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "interval, yearly, monthly, schedule, 月額, 年額",
        "related_document_slug": "billing-plans",
        "sort_order": 30,
        "answer": (
            "はい。間隔変更は常に期間終了に予定。月額 ↔ 年額に即時請求や按分はありません。"
        ),
    },
    {
        "slug": "are-records-deleted-when-i-downgrade",
        "question": "ダウングレードでレコードは削除されますか？",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "downgrade delete, data loss, plan-locked, データ削除",
        "related_document_slug": "billing-plans",
        "sort_order": 40,
        "answer": (
            "いいえ。ダウングレードでメンバー、グループ、Action Record を"
            "自動削除することはありません。余分な項目はプラン制限。"
        ),
    },
    {
        "slug": "why-is-my-subscription-in-grace",
        "question": "サブスクリプションが猶予期間中なのはなぜですか？",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "grace period, payment failed, past due, 猶予期間",
        "related_document_slug": "billing-plans",
        "featured": True,
        "sort_order": 50,
        "answer": (
            "定期支払いが失敗しました。{{PAYMENT_GRACE_DAYS}} 日間有料アクセスを維持。"
            "支払い方法を更新。猶予後も未解決ならワークスペースは Basic。"
        ),
    },
    {
        "slug": "how-do-i-cancel-a-scheduled-change",
        "question": "予定プラン変更をキャンセルするには？",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "keep business, resume, cancel schedule, 予定変更",
        "related_document_slug": "billing-plans",
        "sort_order": 60,
        "answer": (
            "有効日前に **アカウント → サブスクリプション** を開く。"
            "保留中キャンセルの **再開**、Business → Plus 予定の **Business を維持**、"
            "予定間隔／組み合わせ変更のキャンセル。Stripe 管理のみ。"
        ),
    },
    {
        "slug": "combined-plan-and-interval-change",
        "question": "プランと月額/年額を同時に変更すると？",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "combined change, plus monthly business yearly, 組み合わせ変更",
        "related_document_slug": "billing-plans",
        "sort_order": 70,
        "answer": (
            "プラン + 間隔の組み合わせ変更は期間終了まで待機。"
            "その組み合わせ変更に即時アップグレードや按分はありません。"
        ),
    },
    {
        "slug": "is-there-a-business-trial",
        "question": "Business トライアルはありますか？",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "trial, business trial, 7 days, no card, トライアル",
        "related_document_slug": "billing-plans",
        "sort_order": 80,
        "answer": (
            "はい。すべての新規ワークスペースは自動的に 7 日間 Business — カード不要、"
            "追加ステップなし。現在の環境: トライアルは {{TRIAL_STATUS}}。"
            "トライアルは 1 回限り。その週に Plus または Business を選ぶと、"
            "無料 1 週間終了後に有料請求開始。"
        ),
    },
    {
        "slug": "cancel-vs-delete-account",
        "question": "キャンセルとアカウント削除は同じですか？",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "cancel vs delete, danger zone, キャンセル, 削除",
        "related_document_slug": "billing-plans",
        "sort_order": 90,
        "answer": (
            "いいえ。キャンセルは有料更新を停止し、期間終了時に Basic に戻る。"
            "アカウント削除はアカウント → セキュリティからワークスペースを完全削除。"
        ),
    },
    {
        "slug": "apple-billing",
        "question": "Apple で請求を管理できますか？",
        "category": FaqCategory.SUBSCRIPTION_CHANGES,
        "keywords": "apple, iap, app store, purchase source, Apple 請求",
        "related_document_slug": "billing-plans",
        "sort_order": 100,
        "answer": (
            "アカウントは Apple 購入元を記録可能。Apple 管理サブスクリプションでは"
            "Stripe ポータルアクションを非表示。Apple アプリ内課金チェックアウトは"
            "現在の製品では未実装。"
        ),
    },
    # Troubleshooting
    {
        "slug": "kiosk-locked-and-cannot-open-workspace",
        "question": "キオスクがロックされワークスペースに戻れません。どうすれば？",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "kiosk_locked, exit code, unlock, ロック解除",
        "related_document_slug": "kiosk-setup",
        "sort_order": 10,
        "answer": (
            "グループキオスク **終了コード**（4〜10 文字の英数字）を入力。"
            "オーナーパスワードではありません。持っていない場合、グループを開ける"
            "Owner/Admin がグループキオスク設定から終了コードを確認またはリセット可能。"
        ),
    },
    {
        "slug": "plan-locked-member-cannot-open",
        "question": "プラン変更後メンバーを開けないのはなぜですか？",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "plan-locked member, downgrade members, プラン制限メンバー",
        "related_document_slug": "groups-members",
        "sort_order": 20,
        "answer": (
            "そのメンバーは新プランのメンバー上限を超えています。一覧には残りますが、"
            "他のメンバーをアーカイブするかアップグレードするまで開けません。"
        ),
    },
    {
        "slug": "cannot-create-structured-group",
        "question": "Structured Group を作成できないのはなぜですか？",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "structured locked, plus, business only, Structured",
        "related_document_slug": "billing-plans",
        "sort_order": 30,
        "answer": (
            "Structured Group には **Business** が必要。Plus と Basic では作成不可。"
            "Admin ロール権限はプランを上書きしません。"
        ),
    },
    {
        "slug": "staff-page-locked",
        "question": "スタッフページがロックされているのはなぜですか？",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "staff locked, basic, スタッフロック",
        "related_document_slug": "billing-plans",
        "sort_order": 40,
        "answer": (
            "Basic には Admin または Staff シートがありません。"
            "Staff を使うには Plus または Business にアップグレード。"
        ),
    },
    {
        "slug": "export-buttons-missing",
        "question": "レポートをエクスポートできないのはなぜですか？",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "export locked, csv, basic, エクスポート",
        "related_document_slug": "billing-plans",
        "sort_order": 50,
        "answer": (
            "ファイルエクスポートは Plus と Business。Basic はワークスペース内閲覧のみ。"
            "Staff もそのグループに割り当てが必要。"
        ),
    },
    {
        "slug": "scheduled-downgrade-still-on-business",
        "question": "ダウングレードを予定したのに Business のままです。なぜ？",
        "category": FaqCategory.TROUBLESHOOTING,
        "keywords": "scheduled change, still business, period end, 予定ダウングレード",
        "related_document_slug": "billing-plans",
        "sort_order": 60,
        "answer": (
            "想定どおりです。期間終了まで現在のプランを維持。プラン制限は早期適用されません。"
            "Business を維持したい場合は予定変更をキャンセル。"
        ),
    },
    # Privacy
    {
        "slug": "who-controls-member-data",
        "question": "メンバーデータの管理主体は誰ですか？",
        "category": FaqCategory.PRIVACY,
        "keywords": "tenant, organization, member data, privacy, データ管理",
        "related_document_slug": "privacy-policy",
        "featured": True,
        "sort_order": 10,
        "answer": (
            "各 Organization ワークスペースが独自のメンバーとグループデータを管理。"
            "Organization A は Organization B にアクセスできません。"
            "[プライバシーポリシー](/privacy-policy) を参照。"
        ),
    },
    {
        "slug": "where-is-the-privacy-policy",
        "question": "プライバシーポリシーはどこで読めますか？",
        "category": FaqCategory.PRIVACY,
        "keywords": "privacy policy, legal, プライバシーポリシー",
        "related_document_slug": "privacy-policy",
        "sort_order": 20,
        "answer": (
            "Docs で [プライバシーポリシー](/privacy-policy) を読む。"
            "ウェブサイトフッターも同じ正規ドキュメントを新しいタブで開きます。"
        ),
    },
    {
        "slug": "where-are-the-terms",
        "question": "利用規約はどこで読めますか？",
        "category": FaqCategory.PRIVACY,
        "keywords": "terms, legal, agreement, 利用規約",
        "related_document_slug": "terms-of-use",
        "sort_order": 30,
        "answer": "[利用規約](/terms-of-use) を読む。",
    },
    {
        "slug": "does-downgrade-delete-personal-data",
        "question": "プラン変更で個人データは削除されますか？",
        "category": FaqCategory.PRIVACY,
        "keywords": "gdpr, deletion, downgrade privacy, 個人データ",
        "related_document_slug": "privacy-policy",
        "sort_order": 40,
        "answer": (
            "いいえ。プラン変更でメンバーまたは出席データを自動削除しません。"
            "アカウント削除はアカウント → セキュリティの別オーナー操作。"
        ),
    },
    {
        "slug": "are-pins-passwords",
        "question": "グループ PIN はパスワードですか？",
        "category": FaqCategory.PRIVACY,
        "keywords": "pin security, attendance code, PIN セキュリティ",
        "related_document_slug": "groups-members",
        "sort_order": 50,
        "answer": (
            "いいえ。グループ PIN は低セキュリティの出席チェックインコードです。"
            "管理者は設定・変更・リセットできますが、保存済み PIN は再表示されません。"
            "ワークスペースログインではありません。キオスクリストのペイロードは参加者から PIN を隠します。"
        ),
    },
    # General
    {
        "slug": "is-there-an-ios-or-android-app",
        "question": "iOS または Android アプリはありますか？",
        "category": FaqCategory.GENERAL,
        "keywords": "mobile, ios, android, app store, desktop, モバイルアプリ",
        "sort_order": 10,
        "answer": (
            "まだありません。CheckStation は現在 Web 製品。モバイルまたはタブレットブラウザで"
            "グループキオスクを実行可能。ネイティブ iOS、Android、デスクトップアプリは"
            "後日予定で、現在は利用不可。"
        ),
    },
    {
        "slug": "is-checkstation-only-for-schools",
        "question": "CheckStation は学校専用ですか？",
        "category": FaqCategory.GENERAL,
        "keywords": "industry, schools, gyms, generic, 業界",
        "sort_order": 20,
        "answer": (
            "いいえ。CheckStation はマルチテナント、業界非依存のチェックインプラットフォーム。"
            "学校、クラブ、企業、その他の組織が独自の方法でグループを使用可能。"
        ),
    },
    {
        "slug": "how-do-i-search-this-faq",
        "question": "この FAQ を検索するには？",
        "category": FaqCategory.GENERAL,
        "keywords": "search, help, categories, FAQ 検索",
        "related_document_slug": "faq",
        "sort_order": 30,
        "answer": (
            "このページの検索ボックスに入力。マッチングは即時で、質問、回答、"
            "カテゴリ、キーワードを参照。`/faq?q=` で検索を共有可能。"
            "将来のアプリは同じ FAQ API を使用可能。"
        ),
    },
    {
        "slug": "where-is-status",
        "question": "システムステータスはどこですか？",
        "category": FaqCategory.GENERAL,
        "keywords": "status page, outage, health, ステータス",
        "sort_order": 40,
        "answer": (
            "ウェブサイトフッターの **Status** リンクを使用。"
            "CheckStation Status サイトを新しいタブで開きます。Status は Docs とは別サービス。"
        ),
    },
)
