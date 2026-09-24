---
name: jichikai-deploy
description: >
  自治会システム(jichikai)の「自治会tmp_制作用」フォルダのコードを、Google Cloud Run
  (プロジェクト jichikai-tmp、サービス jichikai、リージョン asia-northeast1)に反映(ビルド+デプロイ)する。
  ユーザーが「アップお願いします」「アップして」「デプロイお願いします」「本番に反映して」「Cloud Runに上げて」
  のように、このアプリの最新化・公開・反映を指す言葉を口にしたら、他の説明がなくても即このスキルで動くこと。
  特に「アップお願いします」は合言葉として登録されているので、それだけ言われても迷わず発火する。
  素のgcloudコマンドを都度組み立てるのではなく、このスキルの手順(ビルドとデプロイを分離する回避策込み)を使うこと。
---

# jichikai デプロイ

自治会システムの検証用/本番動作確認用サービス(Cloud Run: `jichikai`, project `jichikai-tmp`, region
`asia-northeast1`)に、マスターテンプレート「自治会tmp_制作用」のコードを反映する。

ソースフォルダ: `C:\Users\user\Desktop\阿部弘行\プロジェクト\自治会システム_JS\自治会フォルダ\自治会tmp_制作用`

## 前提として知っておくこと

- **PowerShellを使うこと。** このマシンではBash側のgcloudがPython絡みで壊れており、`gcloud`コマンドは
  PowerShell経由でないとまともに動かない。
- `.env`は`.dockerignore`で除外済みなので、機密情報がコンテナイメージに混入する心配はない。
- 「自治会tmp_制作用」はマスターテンプレートであり、実際に量産済みの各自治会(本番)へ反映するのは別ツール
  「一斉反映アプリ」(自治会フォルダ/一斉反映アプリ)の役目。このスキルはtmp_制作用単体をCloud Run上の
  検証・動作確認用サービスへ反映するものであり、一斉反映アプリの代わりにはならない。他自治会への展開を
  頼まれた場合はこのスキルではなく一斉反映アプリの話だと確認すること。

## 手順

`gcloud run deploy --source .`(ビルドとデプロイを1コマンドで行う方式)は、過去に3回連続で
`ContainerImageImportFailed`エラーを起こし、ビルドとデプロイを分離したら一発で成功したという実績がある。
これはビルド自体の失敗ではなく、Cloud Run側がビルド済みイメージを取り込む段階で起きる不具合だったため、
最初から分離方式で進める方が早い。

1. ソースフォルダに移動する。
2. タイムスタンプ付きのイメージタグを作り、ビルドとpushを行う(通常30秒〜1分程度で終わる):
   ```powershell
   Set-Location "C:\Users\user\Desktop\阿部弘行\プロジェクト\自治会システム_JS\自治会フォルダ\自治会tmp_制作用"
   $tag = "manual-" + (Get-Date -Format "yyyyMMddHHmmss")
   $image = "asia-northeast1-docker.pkg.dev/jichikai-tmp/cloud-run-source-deploy/jichikai:$tag"
   gcloud builds submit --tag $image --region=asia-northeast1 .
   ```
3. ビルド出力に表示されるdigest(`sha256:...`)を使ってデプロイする(タグではなくdigestを使うのは、
   タグ解決のあいまいさを避けて確実に今ビルドしたイメージを指すため):
   ```powershell
   gcloud run deploy jichikai --image "asia-northeast1-docker.pkg.dev/jichikai-tmp/cloud-run-source-deploy/jichikai@<digest>" --region asia-northeast1 --platform managed
   ```
4. 疎通確認する:
   ```powershell
   curl.exe -s -o NUL -w "%{http_code}`n" "https://jichikai-1048017269324.asia-northeast1.run.app/admin/broadcast.html"
   ```
   (200が返ればOK)

## もし失敗したら

- 上記の分離方式でも同じ`ContainerImageImportFailed`が出た場合、無理に何度もリトライで粘らない。
  ビルド成功/失敗、デプロイのどの段階で失敗したか、既存リビジョンが引き続きトラフィックを処理しているか
  (=サイトがダウンしていないか)を`gcloud run revisions list --service jichikai --region asia-northeast1`
  などで確認し、その状況を率直にユーザーへ伝える。
- Cloud Runは新リビジョンが正常に立ち上がるまで旧リビジョンがトラフィックを処理し続けるので、
  デプロイ失敗がそのままサイトダウンに直結するわけではない。まずそこを確認して安心材料として伝える。

## 報告のしかた

ユーザーは技術的な詳細よりも「今どうなっているか」を知りたい非エンジニア寄りの立場。結果は日本語で簡潔に:

- 成功時: 新しいリビジョン名、URL、疎通確認の結果(例: 200 OK)を一言で
- 失敗時: どこで失敗したか、サイトが今も正常に動いているか(ダウンタイムの有無)を率直に伝える。
  技術的な言い訳を並べず、次にどうするか(様子を見て再試行/一斉反映アプリの話ではないか確認、など)を添える
