// 議事録PDFを本人のGoogleアカウント名義でDriveに保存するための、初回だけのOAuth認可スクリプト。
// 実行するとブラウザで開くべきURLが表示される。そのURLで許可すると、このスクリプトが
// ローカルで一時的に待ち受けて認可コードを受け取り、リフレッシュトークンを.envに自動で書き込む。
const http = require('http');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
require('dotenv').config();

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const PORT = 4756;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;
const ENV_PATH = path.join(__dirname, '..', '.env');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('先に.envへ GOOGLE_OAUTH_CLIENT_ID と GOOGLE_OAUTH_CLIENT_SECRET を設定してください');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive'],
});

console.log('\n以下のURLをブラウザで開いて、ご自身のGoogleアカウントでログインし、許可してください:\n');
console.log(authUrl);
console.log(`\n(このターミナルはそのまま開いたままにしてください。ポート${PORT}で待機中...)\n`);

function saveRefreshToken(token) {
  let envContent = fs.readFileSync(ENV_PATH, 'utf8');
  if (envContent.includes('GOOGLE_OAUTH_REFRESH_TOKEN=')) {
    envContent = envContent.replace(/GOOGLE_OAUTH_REFRESH_TOKEN=.*/g, `GOOGLE_OAUTH_REFRESH_TOKEN=${token}`);
  } else {
    envContent += `\nGOOGLE_OAUTH_REFRESH_TOKEN=${token}\n`;
  }
  fs.writeFileSync(ENV_PATH, envContent, 'utf8');
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  try {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== '/') return;
    const code = url.searchParams.get('code');
    if (!code) {
      res.end('認可コードが見つかりませんでした。もう一度やり直してください。');
      return;
    }
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      res.end('リフレッシュトークンが取得できませんでした。既に一度許可済みの可能性があります。ターミナルの案内を確認してください。');
      console.log('\nリフレッシュトークンが返ってきませんでした。');
      console.log('Googleアカウントの「サードパーティのアクセス権」からこのアプリのアクセスを一度取り消してから、再実行してください。');
      server.close();
      return;
    }
    res.end('許可が完了しました。このタブは閉じて、ターミナルに戻ってください。');
    saveRefreshToken(tokens.refresh_token);
    console.log('完了しました。.envにGOOGLE_OAUTH_REFRESH_TOKENを保存しました。');
    server.close();
  } catch (err) {
    res.end('エラーが発生しました: ' + err.message);
    console.error('認可処理に失敗しました:', err.message);
    server.close();
  }
});

server.listen(PORT);
