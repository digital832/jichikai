require('dotenv').config();
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
  const sheetName = config.google.placesSheetName;
  const spreadsheetId = config.google.spreadsheetId;

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = meta.data.sheets.some((s) => s.properties.title === sheetName);
  if (exists) {
    console.log(`「${sheetName}」タブは既に存在します。何もしません。`);
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [['場所名']] },
  });

  console.log(`「${sheetName}」タブを作成しました。`);
}

main().catch((err) => {
  console.error('失敗しました:', err.message);
  process.exit(1);
});
