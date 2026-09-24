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

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const QR_ORIGINALS_FOLDER_NAME = 'QRコード_原紙';
const QR_FLYER_FOLDER_NAME = 'QRコードチラシ';

// 指定フォルダの直下から、名前が一致するサブフォルダのIDを探す
async function findSubfolderId(parentFolderId, name) {
  const escaped = name.replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `'${parentFolderId}' in parents and name = '${escaped}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
    fields: 'files(id, name)',
  });
  const found = res.data.files && res.data.files[0];
  return found ? found.id : null;
}

// 指定フォルダ直下のファイル一覧（descriptionには友だち追加URLが入っていることがある）
async function listFilesInFolder(folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, description)',
    orderBy: 'name',
  });
  return res.data.files || [];
}

// QRコードフォルダの中の「QRコード_原紙」「QRコードチラシ」を、それぞれ別枠で一覧取得する
async function listQrCodeCategories() {
  if (!config.qrCode.driveFolderId) return { originals: [], flyers: [] };
  const [originalsFolderId, flyersFolderId] = await Promise.all([
    findSubfolderId(config.qrCode.driveFolderId, QR_ORIGINALS_FOLDER_NAME),
    findSubfolderId(config.qrCode.driveFolderId, QR_FLYER_FOLDER_NAME),
  ]);
  const [originals, flyers] = await Promise.all([
    originalsFolderId ? listFilesInFolder(originalsFolderId) : [],
    flyersFolderId ? listFilesInFolder(flyersFolderId) : [],
  ]);
  return { originals, flyers };
}

// QRコードフォルダ内の1ファイルの中身を取得する（原紙・チラシフォルダ内に実在するファイルIDのみ許可）
async function getQrCodeFile(fileId) {
  const { originals, flyers } = await listQrCodeCategories();
  const target = [...originals, ...flyers].find((f) => f.id === fileId);
  if (!target) return null;
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return { name: target.name, mimeType: target.mimeType, buffer: Buffer.from(res.data) };
}

module.exports = { listDistrictBookNames, listQrCodeCategories, getQrCodeFile };
