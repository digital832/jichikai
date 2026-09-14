const { google } = require('googleapis');
const config = require('./config');

const authClient = new google.auth.JWT(
  config.google.clientEmail,
  null,
  config.google.privateKey,
  ['https://www.googleapis.com/auth/drive.readonly']
);

const drive = google.drive({ version: 'v3', auth: authClient });

// 管理地区フォルダの中にあるスプレッドシート（班ごとのブック）の名前一覧を取得する
async function listDistrictBookNames() {
  if (!config.google.districtFolderId) return [];
  const res = await drive.files.list({
    q: `'${config.google.districtFolderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet'`,
    fields: 'files(id, name)',
  });
  return (res.data.files || []).map((f) => f.name);
}

module.exports = { listDistrictBookNames };
