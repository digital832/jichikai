// 科目管理機能に必要な「科目マスタ」タブが無ければ作成し、見出し行を入れる。
// データ行は入れない（sheetsClient.getCategoriesが空タブを検知して、初回アクセス時に自動で初期データを入れる）。
const { google } = require('googleapis');
const config = require('../src/config');

const authClient = new google.auth.JWT(
  config.google.clientEmail,
  null,
  config.google.privateKey,
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth: authClient });

async function main() {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: config.google.spreadsheetId });
  const existingTitles = meta.data.sheets.map((s) => s.properties.title);

  if (!existingTitles.includes(config.google.categoriesSheetName)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: config.google.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: config.google.categoriesSheetName } } }],
      },
    });
    console.log(`タブを作成しました: ${config.google.categoriesSheetName}`);
  } else {
    console.log(`タブは既に存在します: ${config.google.categoriesSheetName}`);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.categoriesSheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [['科目名', '区分', 'グループ']] },
  });
  console.log('科目マスタの見出し行を更新しました。');
}

main().catch((err) => {
  console.error('セットアップに失敗しました:', err.message);
  process.exit(1);
});
