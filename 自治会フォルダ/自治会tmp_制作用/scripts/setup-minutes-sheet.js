// 議事録タブがスプレッドシートに無ければ作成し、見出し行を入れる（既にあれば何もしない）
const { google } = require('googleapis');
const config = require('../src/config');

const authClient = new google.auth.JWT(
  config.google.clientEmail,
  null,
  config.google.privateKey,
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth: authClient });

const HEADERS = ['日付', '時刻', 'タイトル', '場所', '出席者', '議事録本文', '文字起こし', 'DriveファイルID', 'DriveURL'];

async function main() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: config.google.spreadsheetId });
  const exists = meta.data.sheets.some((s) => s.properties.title === config.minutes.sheetName);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: config.minutes.sheetName } } }],
      },
    });
    console.log(`タブ「${config.minutes.sheetName}」を作成しました。`);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.minutes.sheetName}!A1:I1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADERS] },
  });
  console.log('見出し行を更新しました。');
}

main().catch((err) => {
  console.error('セットアップに失敗しました:', err.message);
  process.exit(1);
});
