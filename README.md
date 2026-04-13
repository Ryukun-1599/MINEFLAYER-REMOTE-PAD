# mineflayer-remote-pad

[Mineflayer](https://github.com/PrismarineJS/mineflayer) ボットを、ブラウザのバーチャルパッド・キーボード・マウスから **WebSocket** で操作する小さなサーバーです。スマホと PC の同一 LAN から使えます。

## リポジトリのファイル数

コミット対象は **11 ファイル**（`node_modules` は `.gitignore` で除外）。**100 ファイル未満**の要件を満たします。

公開用に GitHub リポジトリを作ったら、`package.json` に任意で `"repository"` / `"bugs"` / `"homepage"` を追記すると npm / GitHub の表示が揃いやすいです。

## 必要環境

- Node.js **18 以上**
- 接続先の Minecraft サーバー（オフライン / オンラインは `MC_AUTH` に依存）

## セットアップ

```bash
git clone <このリポジトリの URL>
cd mineflayer-remote-pad
npm install
```

### このフォルダを新規 GitHub リポジトリに載せる例

```bash
cd mineflayer-remote-pad
git init
git add .
git commit -m "Initial commit: mineflayer remote pad"
git branch -M main
git remote add origin https://github.com/<あなたのユーザー名>/<リポジトリ名>.git
git push -u origin main
```

GitHub 上で先に空のリポジトリを作成してから `remote add` / `push` してください。

環境変数の例は [.env.example](.env.example) を参照してください。Windows PowerShell の例:

```powershell
$env:MC_HOST="localhost"
$env:MC_PORT="25565"
$env:MC_USERNAME="RemotePad"
npm start
```

起動後、ブラウザで `http://localhost:3847`（既定ポート）。スマホからは `http://<PCのLAN IP>:3847` を開きます。

## 主な環境変数

| 変数 | 説明 | 既定 |
|------|------|------|
| `MC_HOST` | サーバーアドレス | `localhost` |
| `MC_PORT` | ポート | `25565` |
| `MC_USERNAME` | ボット名 | `RemotePad` |
| `MC_VERSION` | プロトコル版（省略で自動） | なし |
| `MC_AUTH` | `offline` または `microsoft` 等 | `offline` |
| `PAD_HTTP_PORT` | Web + WebSocket の待受ポート | `3847` |
| `PAD_TOKEN` | 設定時、WebSocket 接続後に認証が必要 | なし |

## 免責・遵守事項

- 接続先サーバーの **利用規約・ボット可否** を必ず確認してください。
- `PAD_TOKEN` を使わない場合、LAN 内の誰でも操作できるため、信頼できるネットワークでのみ利用してください。

## ライセンス

[MIT](LICENSE)

Mineflayer および各依存パッケージはそれぞれのライセンスに従います。
