// 決算書機能に必要なタブ（決算書・予算マスタ）が無ければ作成し、見出し行を入れる。
// 入出金タブにも F列(科目) の見出しを追加する（既存データ行はそのまま、科目は空欄のまま残る）。
const { google } = require('googleapis');
const config = require('../src/config');

const authClient = new google.auth.JWT(
  config.google.clientEmail,
  null,
  config.google.privateKey,
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth: authClient });

const SHEETS_TO_CREATE = [
  { name: config.google.statementsSheetName, headers: ['年度ラベル', '期間開始', '期間終了', 'DriveファイルID', 'DriveURL', '作成日時', '入力データJSON'] },
  { name: config.google.budgetsSheetName, headers: ['年度ラベル', '科目', '予算額'] },
];

async function main() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: config.google.spreadsheetId });
  const existingTitles = meta.data.sheets.map((s) => s.properties.title);

  const toCreate = SHEETS_TO_CREATE.filter((s) => !existingTitles.includes(s.name));
  if (toCreate.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.spreadsheetId,
      requestBody: {
        requests: toCreate.map((s) => ({ addSheet: { properties: { title: s.name } } })),
      },
    });
    console.log(`タブを作成しました: ${toCreate.map((s) => s.name).join('、')}`);
  }

  for (const s of SHEETS_TO_CREATE) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${s.name}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [s.headers] },
    });
  }
  console.log('決算書・予算マスタの見出し行を更新しました。');

  if (existingTitles.includes(config.google.transactionsSheetName)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.transactionsSheetName}!F1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['科目']] },
    });
    console.log('入出金タブにF列（科目）の見出しを追加しました。');
  } else {
    console.warn(`警告: 「${config.google.transactionsSheetName}」タブが見つかりませんでした。`);
  }
}

main().catch((err) => {
  console.error('セットアップに失敗しました:', err.message);
  process.exit(1);
});
