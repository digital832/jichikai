const { google } = require('googleapis');
const { Readable } = require('stream');
const config = require('./config');

// サービスアカウントはDriveの保存容量を持たない（0GB）ため、ファイル作成は
// 本人のGoogleアカウント名義のOAuthトークンで行う（scripts/drive-oauth-setup.js で発行）
const oauthClient = new google.auth.OAuth2(config.oauth.clientId, config.oauth.clientSecret);
oauthClient.setCredentials({ refresh_token: config.oauth.refreshToken });

const drive = google.drive({ version: 'v3', auth: oauthClient });

// Word(.docx)のバッファをGoogleドキュメントに変換してPDFとして書き出す
// （直接PDFを組み立てず、Driveの変換エンジンを間借りすることで日本語フォントの心配をなくしている）
async function convertDocxToPdf(docxBuffer, name, folderId) {
  const tempDoc = await drive.files.create({
    requestBody: {
      name: `${name}_tmp`,
      parents: [folderId],
      mimeType: 'application/vnd.google-apps.document',
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Readable.from(docxBuffer),
    },
    fields: 'id',
  });

  const pdfRes = await drive.files.export(
    { fileId: tempDoc.data.id, mimeType: 'application/pdf' },
    { responseType: 'arraybuffer' }
  );

  await drive.files.delete({ fileId: tempDoc.data.id }).catch(() => {});

  return Buffer.from(pdfRes.data);
}

// 議事録PDFを新規に保存する
async function uploadMinutesPdf(docxBuffer, name, folderId) {
  const pdfBuffer = await convertDocxToPdf(docxBuffer, name, folderId);
  const res = await drive.files.create({
    requestBody: { name: `${name}.pdf`, parents: [folderId] },
    media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
    fields: 'id, webViewLink',
  });
  return res.data;
}

// 既存の議事録PDFを編集後の内容で上書きする（ファイルID・リンクは変わらない）
async function replaceMinutesPdf(fileId, docxBuffer, name, folderId) {
  const pdfBuffer = await convertDocxToPdf(docxBuffer, name, folderId);
  const res = await drive.files.update({
    fileId,
    media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
    fields: 'id, webViewLink',
  });
  return res.data;
}

async function deleteMinutesFile(fileId) {
  if (!fileId) return;
  await drive.files.delete({ fileId }).catch(() => {});
}

module.exports = { uploadMinutesPdf, replaceMinutesPdf, deleteMinutesFile };
