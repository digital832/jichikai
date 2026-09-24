const { google } = require('googleapis');
const { Readable } = require('stream');
const config = require('./config');

// サービスアカウントはDriveの保存容量を持たない（0GB）ため、ファイル作成は
// 本人のGoogleアカウント名義のOAuthトークンで行う（議事録機能と同じ認証情報を流用）
const oauthClient = new google.auth.OAuth2(config.oauth.clientId, config.oauth.clientSecret);
oauthClient.setCredentials({ refresh_token: config.oauth.refreshToken });

const drive = google.drive({ version: 'v3', auth: oauthClient });

const PDF_MIME_TYPE = 'application/pdf';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

// 決算書フォルダ（会計フォルダ）の直下に、年度名のフォルダ（例：2026年度）を探し、無ければ作る。
// 「決算書」フォルダ自体はデータ（テンプレート）が入っているので複製せず、その横に年度ごとのフォルダを並べる。
async function getOrCreateYearFolder(parentFolderId, yearLabel) {
  const escaped = yearLabel.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents and name = '${escaped}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
    fields: 'files(id, name)',
  });
  const existing = res.data.files && res.data.files[0];
  if (existing) return existing.id;
  const created = await drive.files.create({
    requestBody: { name: yearLabel, mimeType: FOLDER_MIME_TYPE, parents: [parentFolderId] },
    fields: 'id',
  });
  return created.data.id;
}

async function uploadStatementPdf(buffer, name, folderId) {
  const res = await drive.files.create({
    requestBody: { name: `${name}.pdf`, parents: [folderId], mimeType: PDF_MIME_TYPE },
    media: { mimeType: PDF_MIME_TYPE, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  });
  return res.data;
}

// 既存の決算書PDFを編集後の内容で上書きする（ファイルID・リンクは変わらない）
async function replaceStatementPdf(fileId, buffer, name) {
  const res = await drive.files.update({
    fileId,
    requestBody: { name: `${name}.pdf` },
    media: { mimeType: PDF_MIME_TYPE, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  });
  return res.data;
}

async function deleteStatementFile(fileId) {
  if (!fileId) return;
  await drive.files.delete({ fileId }).catch(() => {});
}

module.exports = { getOrCreateYearFolder, uploadStatementPdf, replaceStatementPdf, deleteStatementFile };
