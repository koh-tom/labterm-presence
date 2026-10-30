# labterm-presence

[labterm](https://github.com/koh-tom/m5_terminal) (M5Stack CoreS3) の入室 / 外出 / 退室を USB で受け取って、
研究室にいた時間をマス目で振り返るためのローカル専用アプリ。

- CoreS3 で押した操作が 1 秒以内に画面に出る
- PC を落としていた間の操作も、次に繋いだ時に取り込む (端末側の通し番号で差分を取る)
- 接続した時に端末の時計を PC に合わせる
- 月・3か月・任意の期間を、30分 / 15分のマス目で表示。研究タイマーで研究していた時間は濃い緑
- 統計タブ: 前の期間との比較、曜日×時間の「いつもの在室」、曜日ごとの来た / 帰った時間、週ごと・月ごとの合計
- タブの名前に状態と今日の時間 (`● 6:34 在室`)。`t` で今日に戻る、`f` か右上のボタンで全画面
- Slack のステータスに在室状態を出せる (在室 🏢 研究室 / 外出 🚶 外出中 / 退室 🏠 不在)
- 毎日バックアップ、毎月 CSV を自動で書き出す
- 127.0.0.1 だけで動く。クラウドは使わない

## 構成

```text
apps/daemon   シリアル + SQLite + API (Hono) + Web配信。labterm コマンドもここ
apps/web      React + Tailwind の画面
packages/core プロトコルの parser と集計 (pure function)
```

Node 24 以上 (TypeScript をそのまま実行する)。

## 使い方

```sh
pnpm install
pnpm build              # Web をビルド
pnpm start              # http://127.0.0.1:8787
```

開発時は `pnpm dev` (Web は http://127.0.0.1:5173、`/api` は daemon に proxy)。
`http://127.0.0.1:5173/?demo` で daemon 無しのデモデータを表示できる。

実機が無いときは偽の端末で試せる (socat が必要):

```sh
pnpm fake-device        # 表示されたコマンドで daemon を起動し、i/a/o/u キーで入室・外出・退室・取消
```

常駐させる場合:

```sh
node apps/daemon/src/cli.ts install-service
systemctl --user daemon-reload
systemctl --user enable --now labterm-presence
```

Tailscale の自分の端末から見る場合 (tailnet の外には出ない):

```sh
mkdir -p ~/.config/labterm
echo "LABTERM_ALLOWED_HOSTS=$(tailscale status --json | jq -r .Self.DNSName | sed 's/\.$//')" > ~/.config/labterm/env
systemctl --user restart labterm-presence
tailscale serve --bg 8787
```

### Slack のステータス

1. https://api.slack.com/apps で「Create New App」→「From a manifest」でワークスペースを選び、次を貼る

   ```json
   {
     "display_information": { "name": "labterm presence" },
     "oauth_config": {
       "scopes": { "user": ["users.profile:read", "users.profile:write", "users:write"] }
     }
   }
   ```

2. 「Install to Workspace」して、OAuth & Permissions の **User OAuth Token** (`xoxp-` で始まる) をコピー
3. daemon を動かしている PC で保存して再起動 (トークンは画面にもログにも出さない)

   ```sh
   mkdir -p ~/.config/labterm
   install -m 600 /dev/null ~/.config/labterm/slack-token
   read -rs TOKEN && printf '%s' "$TOKEN" > ~/.config/labterm/slack-token && unset TOKEN
   systemctl --user restart labterm-presence
   ```

状態が変わってから6秒後に送る (取消で戻った時は送らない)。手で設定したステータス (会議中など) は上書きしない。
退室の時はオンライン表示も「離席」にする。

シリアルポートを読むには、ユーザーが `uucp` (Arch) か `dialout` (Debian 系) グループに入っている必要がある。

## labterm の他のツールと使う

daemon がポートを開いている間は、書き込みや `tools/*.py` は使えない。`labterm release` で一時的に空ける。

```sh
labterm release -- pio run -t upload
labterm release -- uv run tools/shot.py
labterm release --seconds 60         # 60秒だけ空ける
```

## データ

| 場所 | 中身 |
| --- | --- |
| `~/.local/share/labterm/labterm.db` | イベントログ (SQLite, 0600) |
| `~/.local/share/labterm/backups/` | 毎日 4:00 のバックアップ (14日 + 月初12か月) |
| `~/.local/share/labterm/exports/` | 月ごとの CSV |

イベントは削除しない。取消は void イベントで打ち消す。区間や集計は毎回イベントから作り直す。

- 2分未満の在室は押し間違いとして数えない
- 15分以上いた日を「在室日」とする
- 日付は 0 時で区切る (23:00〜翌2:00 なら前の日に1時間、次の日に2時間)

## API

`127.0.0.1:8787` のみ。Host / Origin を確認し、POST は JSON だけ受け付ける (DNS rebinding / CSRF 対策)。

| | |
| --- | --- |
| `GET /api/status` | 端末の接続、在室状態、同期の状態 |
| `GET /api/presence?from=&to=` | 期間の日ごとの区間と集計 (最大366日) |
| `GET /api/presence/events?from=&to=` | イベント |
| `GET /api/stats?from=&to=` | 統計タブ用の集計 |
| `POST /api/presence/events` | 手動修正 (イベントの追加 / void) |
| `GET /api/events` | SSE |
| `POST /api/sync` | 端末と同期し直す |
| `GET /api/export.csv?from=&to=&detail=day\|interval` | CSV |
| `GET /api/export.json?from=&to=` | JSON |

## テスト

```sh
pnpm test     # vitest (集計 / parser / API / 同期)
pnpm check    # biome + tsc
```
