const { google } = require('googleapis');
const config = require('./config');

// サービスアカウントとしてGoogleにログインするための認証クライアント（アプリ起動時に1回だけ作る）
const authClient = new google.auth.JWT(
  config.google.clientEmail,
  null,
  config.google.privateKey,
  ['https://www.googleapis.com/auth/spreadsheets']
);

const sheets = google.sheets({ version: 'v4', auth: authClient });

// 名簿タブの列順: A:LINE名, B:本名, C:役職, D:LINEID, E:所属, F:アクセストークン, G:削除済み(TRUE)
function rowToMember(row, index) {
  return {
    // シート上の行番号（2行目始まり）
    row: index + 2,
    lineName: row[0] || '',
    realName: row[1] || '',
    role: row[2] || '',
    lineUserId: row[3] || '',
    group: row[4] || '',
    accessToken: row[5] || '',
    deleted: row[6] === 'TRUE',
  };
}

async function getAllMembers() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.sheetName}!A2:G`,
  });
  return (res.data.values || []).map(rowToMember).filter((m) => m.lineUserId && !m.deleted);
}

// 名簿から削除する。行は消さず、G列に印を付ける。
// （班シート→名簿の自動反映は、LINEIDが名簿にあれば「新規追加」しないため、行を消すと10分後に復活してしまう）
async function deleteMember(row) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.sheetName}!G${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['TRUE']] },
  });
}

// 削除済みの人も含めて、指定の行を1件読む（取り消し用）
async function getMemberIncludingDeleted(row) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.sheetName}!A${row}:G${row}`,
  });
  const values = (res.data.values || [])[0];
  return values ? rowToMember(values, row - 2) : null;
}

// 削除の印（G列）を外して、名簿に戻す
async function restoreMember(row) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.sheetName}!G${row}`,
  });
}

async function updateMemberRole(row, role) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.sheetName}!C${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[role]] },
  });
}

async function updateMemberRealName(row, realName) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.sheetName}!B${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[realName]] },
  });
}

// 対象グループのボタン（全員・役職マスタの役職・管理地区フォルダの班名）で名簿を絞り込む
// 「所属」列（班） または 「役職」列 のどちらかが一致すれば対象にする
function filterByGroup(members, group) {
  if (!group || group === '全員') return members;
  return members.filter((m) => m.group === group || m.role === group);
}

// アクセストークンごとに会員をグループ化する（班ごとに別のLINE公式アカウントのため）
function groupByAccessToken(members) {
  const map = new Map();
  const withoutToken = [];
  members.forEach((m) => {
    if (!m.accessToken) {
      withoutToken.push(m);
      return;
    }
    if (!map.has(m.accessToken)) map.set(m.accessToken, []);
    map.get(m.accessToken).push(m);
  });
  return { groups: map, withoutToken };
}

async function getMembersByGroupGroupedByToken(group) {
  const members = await getAllMembers();
  const filtered = filterByGroup(members, group);
  return groupByAccessToken(filtered);
}

// --- Events タブ ---
// 列順: A:行事名, B:場所, C:開始時刻, D:終了時刻, E:持ち物

function rowToEvent(row, index) {
  return {
    // シート上の行番号（2行目始まり）をIDとして使う
    id: index + 2,
    name: row[0] || '',
    place: row[1] || '',
    timeStart: row[2] || '',
    timeEnd: row[3] || '',
    belongings: row[4] || '',
  };
}

async function getEvents() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.eventsSheetName}!A2:E`,
  });
  return (res.data.values || []).map(rowToEvent).filter((e) => e.name);
}

async function addEvent(fields) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.eventsSheetName}!A:E`,
    // RAW: "10:00"のような文字列がSheets側で時刻のシリアル値に自動変換されるのを防ぎ、そのまま文字列として保存する
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[fields.name, fields.place, fields.timeStart, fields.timeEnd, fields.belongings]],
    },
  });
}

async function updateEvent(id, fields) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.eventsSheetName}!A${id}:E${id}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[fields.name, fields.place, fields.timeStart, fields.timeEnd, fields.belongings]],
    },
  });
}

async function deleteEvent(id) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.eventsSheetName}!A${id}:E${id}`,
  });
}

// --- 定型文マスタ タブ（メッセージのひな形） ---
// 列順: A:本文

function rowToTemplate(row, index) {
  return {
    // シート上の行番号（2行目始まり）をIDとして使う
    id: index + 2,
    text: row[0] || '',
  };
}

async function getTemplates() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.templatesSheetName}!A2:A`,
  });
  return (res.data.values || []).map(rowToTemplate).filter((t) => t.text);
}

async function addTemplate(text) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.templatesSheetName}!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[text]] },
  });
}

async function updateTemplate(id, text) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.templatesSheetName}!A${id}:A${id}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[text]] },
  });
}

async function deleteTemplate(id) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.templatesSheetName}!A${id}:A${id}`,
  });
}

// --- 場所マスタ タブ（配信画面で選べる「場所」の一覧） ---
// 列: A:場所名, B:住所

function rowToPlace(row, index) {
  return {
    id: index + 2,
    name: row[0] || '',
    address: row[1] || '',
  };
}

async function getPlaces() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.placesSheetName}!A2:B`,
  });
  return (res.data.values || []).map(rowToPlace).filter((p) => p.name);
}

async function addPlace(name, address) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.placesSheetName}!A:B`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[name, address || '']] },
  });
}

async function updatePlace(id, name, address) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.placesSheetName}!A${id}:B${id}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[name, address || '']] },
  });
}

async function deletePlace(id) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.placesSheetName}!A${id}:B${id}`,
  });
}

// --- グループマスタ タブ（対象グループの班名一覧） ---
// 列: A:グループ名

async function getGroupMasterList() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.groupMasterSheetName}!A2:A`,
  });
  return (res.data.values || []).map((row) => row[0]).filter(Boolean);
}

// 管理地区フォルダから取得した班名一覧で、グループマスタタブを丸ごと置き換える
async function replaceGroupMasterList(groupNames) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.groupMasterSheetName}!A2:A1000`,
  });
  if (groupNames.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.groupMasterSheetName}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: groupNames.map((name) => [name]) },
  });
}

// --- 役職マスタ タブ（自由に追加・編集・削除できる役職の一覧） ---
// 列: A:役職名, B:色（16進カラーコード）

const DEFAULT_ROLE_COLOR = '#6b716f';

function rowToRole(row, index) {
  return { id: index + 2, name: row[0] || '', color: row[1] || DEFAULT_ROLE_COLOR };
}

async function getRoles() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.roleMasterSheetName}!A2:B`,
  });
  return (res.data.values || []).map(rowToRole).filter((r) => r.name);
}

async function addRole(name, color) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.roleMasterSheetName}!A:B`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[name, color || DEFAULT_ROLE_COLOR]] },
  });
}

async function updateRole(id, name, color) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.roleMasterSheetName}!A${id}:B${id}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[name, color || DEFAULT_ROLE_COLOR]] },
  });
}

async function deleteRole(id) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.roleMasterSheetName}!A${id}:B${id}`,
  });
}

// 役職の並び順を丸ごと入れ替える（渡された順番で name/color の2列を上書きする）
async function reorderRoles(orderedRoles) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.roleMasterSheetName}!A2:B1000`,
  });
  if (orderedRoles.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.roleMasterSheetName}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: orderedRoles.map((r) => [r.name, r.color || DEFAULT_ROLE_COLOR]) },
  });
}

// --- 出欠セッション / 出欠回答 タブ ---

function rowToSession(row) {
  return {
    id: row[0] || '',
    eventName: row[1] || '',
    eventDate: row[2] || '',
    totalRecipients: Number(row[3] || 0),
    createdAt: row[4] || '',
  };
}

async function createAttendanceSession({ eventName, eventDate, totalRecipients }) {
  const id = `s${Date.now()}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.attendanceSessionSheetName}!A:E`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[id, eventName, eventDate, totalRecipients, new Date().toISOString()]],
    },
  });
  return id;
}

async function getAttendanceSessions() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.attendanceSessionSheetName}!A2:E`,
  });
  return (res.data.values || []).map(rowToSession).filter((s) => s.id);
}

async function getAttendanceSession(sessionId) {
  const sessions = await getAttendanceSessions();
  return sessions.find((s) => s.id === sessionId) || null;
}

function rowToResponse(row, index) {
  return {
    row: index + 2,
    sessionId: row[0] || '',
    lineUserId: row[1] || '',
    realName: row[2] || '',
    status: row[3] || '',
    respondedAt: row[4] || '',
  };
}

async function getAttendanceResponses(sessionId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.attendanceResponseSheetName}!A2:E`,
  });
  const all = (res.data.values || []).map(rowToResponse).filter((r) => r.sessionId);
  return sessionId ? all.filter((r) => r.sessionId === sessionId) : all;
}

// 同じ会員が同じセッションに再回答した場合は上書きし、初回なら新規追加する
async function recordAttendanceResponse({ sessionId, lineUserId, realName, status }) {
  const existing = await getAttendanceResponses(sessionId);
  const match = existing.find((r) => r.lineUserId === lineUserId);
  const now = new Date().toISOString();
  if (match) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.attendanceResponseSheetName}!A${match.row}:E${match.row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[sessionId, lineUserId, realName, status, now]] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.attendanceResponseSheetName}!A:E`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[sessionId, lineUserId, realName, status, now]] },
    });
  }
}

// セッション本体と、紐づく回答をすべて削除する
async function deleteAttendanceSession(sessionId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.attendanceSessionSheetName}!A2:E`,
  });
  const rows = res.data.values || [];
  const index = rows.findIndex((row) => row[0] === sessionId);
  if (index === -1) return;
  const row = index + 2;
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.attendanceSessionSheetName}!A${row}:E${row}`,
  });

  const responses = await getAttendanceResponses(sessionId);
  await Promise.all(responses.map((r) => sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.attendanceResponseSheetName}!A${r.row}:E${r.row}`,
  })));
}

// --- 安否セッション / 安否回答 タブ ---
// 安否セッション 列: A:ID, B:行事名, C:日付, D:送信対象人数, E:作成日時, F:送信対象者（JSON配列。未回答の判定に使う）

function rowToSafetySession(row) {
  let recipients = [];
  try {
    recipients = row[5] ? JSON.parse(row[5]) : [];
  } catch (err) {
    recipients = [];
  }
  return {
    id: row[0] || '',
    eventName: row[1] || '',
    eventDate: row[2] || '',
    totalRecipients: Number(row[3] || 0),
    createdAt: row[4] || '',
    recipients,
  };
}

async function createSafetySession({ eventName, eventDate, totalRecipients, recipients }) {
  const id = `a${Date.now()}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.safetySessionSheetName}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[id, eventName, eventDate, totalRecipients, new Date().toISOString(), JSON.stringify(recipients || [])]],
    },
  });
  return id;
}

async function getSafetySessions() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.safetySessionSheetName}!A2:F`,
  });
  return (res.data.values || []).map(rowToSafetySession).filter((s) => s.id);
}

async function getSafetySession(sessionId) {
  const sessions = await getSafetySessions();
  return sessions.find((s) => s.id === sessionId) || null;
}

function rowToSafetyResponse(row, index) {
  return {
    row: index + 2,
    sessionId: row[0] || '',
    lineUserId: row[1] || '',
    realName: row[2] || '',
    status: row[3] || '',
    missingNames: row[4] || '',
    respondedAt: row[5] || '',
    lat: row[6] ? Number(row[6]) : null,
    lng: row[7] ? Number(row[7]) : null,
  };
}

async function getSafetyResponses(sessionId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.safetyResponseSheetName}!A2:H`,
  });
  const all = (res.data.values || []).map(rowToSafetyResponse).filter((r) => r.sessionId);
  return sessionId ? all.filter((r) => r.sessionId === sessionId) : all;
}

// 回答済みの人が、追加で現在地だけを報告する（回答内容はそのまま、G・H列だけ更新する）
async function reportSafetyLocation({ sessionId, lineUserId, lat, lng }) {
  const existing = await getSafetyResponses(sessionId);
  const match = existing.find((r) => r.lineUserId === lineUserId);
  if (!match) {
    throw new Error('先に安否確認への回答が必要です');
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.safetyResponseSheetName}!G${match.row}:H${match.row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[lat, lng]] },
  });
}

async function recordSafetyResponse({ sessionId, lineUserId, realName, status, missingNames }) {
  const existing = await getSafetyResponses(sessionId);
  const match = existing.find((r) => r.lineUserId === lineUserId);
  const now = new Date().toISOString();
  const values = [[sessionId, lineUserId, realName, status, missingNames || '', now]];
  if (match) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.safetyResponseSheetName}!A${match.row}:F${match.row}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.safetyResponseSheetName}!A:F`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  }
}

// セッション本体と、紐づく回答をすべて削除する
async function deleteSafetySession(sessionId) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.safetySessionSheetName}!A2:F`,
  });
  const rows = res.data.values || [];
  const index = rows.findIndex((row) => row[0] === sessionId);
  if (index === -1) return;
  const row = index + 2;
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.safetySessionSheetName}!A${row}:F${row}`,
  });

  const responses = await getSafetyResponses(sessionId);
  await Promise.all(responses.map((r) => sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.safetyResponseSheetName}!A${r.row}:H${r.row}`,
  })));
}

// --- 入出金 タブ ---
// 列: A:日付, B:種別(入金/出金), C:金額, D:内容, E:登録日時, F:科目（決算書の項目名。科目マスタタブ参照）

function rowToTransaction(row, index) {
  return {
    row: index + 2,
    date: row[0] || '',
    type: row[1] || '',
    amount: Number(row[2] || 0),
    description: row[3] || '',
    createdAt: row[4] || '',
    category: row[5] || '',
  };
}

async function getTransactions() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.transactionsSheetName}!A2:F`,
  });
  return (res.data.values || [])
    .map(rowToTransaction)
    .filter((t) => t.date || t.amount)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function addTransaction({ date, type, amount, description, category }) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.transactionsSheetName}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[date, type, amount, description, new Date().toISOString(), category || '']],
    },
  });
}

async function updateTransaction(row, { date, type, amount, description, category }) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.transactionsSheetName}!E${row}`,
  });
  const createdAt = (res.data.values && res.data.values[0] && res.data.values[0][0]) || new Date().toISOString();
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.transactionsSheetName}!A${row}:F${row}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[date, type, amount, description, createdAt, category || '']],
    },
  });
}

async function deleteTransaction(row) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.transactionsSheetName}!A${row}:F${row}`,
  });
}

// --- 科目マスタ タブ（入出金の登録・決算書で使う科目の一覧。管理画面から自由に追加・編集・削除できる） ---
// 列: A:科目名, B:区分(収入/支出), C:グループ（支出のみ。事業費/団体負担金等/事務費/予備費）
//
// このタブが空の場合、初回アクセス時にだけ下のDEFAULT_CATEGORIES（もともとコードに固定で書かれていた
// 伊都の杜自治会の科目一覧）で自動的に初期化する。タブ自体は事前に手動で作っておく必要がある。
const DEFAULT_CATEGORIES = [
  { name: 'コミュニティ事業費', section: '支出', group: '事業費' },
  { name: '環境整備費', section: '支出', group: '事業費' },
  { name: '防犯・防災・交通対策費', section: '支出', group: '事業費' },
  { name: '広報活動費', section: '支出', group: '事業費' },

  { name: '行政区負担金', section: '支出', group: '団体負担金等' },
  { name: '体育活動助成金', section: '支出', group: '団体負担金等' },
  { name: '文化活動助成金', section: '支出', group: '団体負担金等' },
  { name: '市民祭り協賛金', section: '支出', group: '団体負担金等' },
  { name: '消防団負担金', section: '支出', group: '団体負担金等' },
  { name: '電気料金負担金', section: '支出', group: '団体負担金等' },
  { name: '各種募金', section: '支出', group: '団体負担金等' },
  { name: '子ども会活動助成金', section: '支出', group: '団体負担金等' },

  { name: '事務費', section: '支出', group: '事務費' },
  { name: '集会所管理運営費', section: '支出', group: '事務費' },
  { name: '防犯カメラ管理費', section: '支出', group: '事務費' },
  { name: '自治会役員報酬', section: '支出', group: '事務費' },
  { name: '租税公課', section: '支出', group: '事務費' },

  { name: '予備費', section: '支出', group: '予備費' },

  { name: '自治会費', section: '収入', group: '' },
  { name: '集会所利用料収入', section: '収入', group: '' },
  { name: '集会所太陽光売電収入', section: '収入', group: '' },
  { name: 'ごみ集積所等設置補助金', section: '収入', group: '' },
  { name: '有価資源回収活動奨励補助金', section: '収入', group: '' },
  { name: '自動販売機販売手数料', section: '収入', group: '' },
  { name: '雑収入', section: '収入', group: '' },
];

function rowToCategory(row, index) {
  return { id: index + 2, name: row[0] || '', section: row[1] || '', group: row[2] || '' };
}

async function getCategories() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.categoriesSheetName}!A2:C`,
  });
  const rows = (res.data.values || []).map(rowToCategory).filter((c) => c.name);
  if (rows.length > 0) return rows;

  // タブがまだ空なら、これまで固定だった科目一覧で一度だけ初期化する
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.categoriesSheetName}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: DEFAULT_CATEGORIES.map((c) => [c.name, c.section, c.group || '']) },
  });
  return DEFAULT_CATEGORIES.map((c, index) => ({ id: index + 2, ...c }));
}

async function addCategory({ name, section, group }) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.categoriesSheetName}!A:C`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[name, section, section === '支出' ? (group || '') : '']] },
  });
}

async function updateCategory(id, { name, section, group }) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.categoriesSheetName}!A${id}:C${id}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[name, section, section === '支出' ? (group || '') : '']] },
  });
}

async function deleteCategory(id) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.categoriesSheetName}!A${id}:C${id}`,
  });
}

// --- 予算マスタ タブ（決算書作成時に入力した年度ごとの予算額。次回作成時の初期値として使う） ---
// 列: A:年度ラベル, B:科目, C:予算額

async function getBudgets(yearLabel) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.budgetsSheetName}!A2:C`,
  });
  const rows = (res.data.values || []).filter((row) => row[0] === yearLabel);
  const map = {};
  rows.forEach((row) => { map[row[1]] = Number(row[2] || 0); });
  return map;
}

// 直近（最後に保存された年度）の予算額を、新しい年度のデフォルト値として使うために取得する
async function getLatestBudgets() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.budgetsSheetName}!A2:C`,
  });
  const rows = res.data.values || [];
  if (rows.length === 0) return {};
  const latestYearLabel = rows[rows.length - 1][0];
  return getBudgets(latestYearLabel);
}

// 指定した年度の予算額をまるごと保存し直す（既存分は同じ年度ラベルの行を消してから追記する）
async function saveBudgets(yearLabel, budgetMap) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.budgetsSheetName}!A2:C`,
  });
  const rows = res.data.values || [];
  const keepRows = rows.filter((row) => row[0] !== yearLabel);
  const newRows = Object.entries(budgetMap).map(([category, amount]) => [yearLabel, category, Number(amount || 0)]);
  const allRows = [...keepRows, ...newRows];

  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.budgetsSheetName}!A2:C100000`,
  });
  if (allRows.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.budgetsSheetName}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: allRows },
  });
}

// --- 決算書 タブ（作成した決算書Excelの一覧） ---
// 列: A:年度ラベル, B:期間開始, C:期間終了, D:DriveファイルID, E:DriveURL, F:作成日時, G:入力データJSON（編集画面の再表示用）

function rowToStatement(row, index) {
  return {
    id: index + 2,
    yearLabel: row[0] || '',
    periodStart: row[1] || '',
    periodEnd: row[2] || '',
    driveFileId: row[3] || '',
    driveUrl: row[4] || '',
    createdAt: row[5] || '',
    inputData: (() => {
      try { return JSON.parse(row[6] || '{}'); } catch { return {}; }
    })(),
  };
}

function statementSortKey(s) {
  return s.periodEnd || s.createdAt;
}

async function getStatements() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.statementsSheetName}!A2:G`,
  });
  return (res.data.values || [])
    .map(rowToStatement)
    .filter((s) => s.yearLabel)
    .sort((a, b) => (statementSortKey(a) < statementSortKey(b) ? 1 : -1));
}

async function getStatementById(id) {
  const list = await getStatements();
  return list.find((s) => s.id === Number(id)) || null;
}

async function addStatement({ yearLabel, periodStart, periodEnd, driveFileId, driveUrl, inputData }) {
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.statementsSheetName}!A:G`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[yearLabel, periodStart, periodEnd, driveFileId, driveUrl, new Date().toISOString(), JSON.stringify(inputData || {})]],
    },
  });
  const range = res.data.updates.updatedRange;
  const rowMatch = range.match(/(\d+):[A-Z]+\d+$/);
  return Number(rowMatch[1]);
}

async function updateStatement(id, { yearLabel, periodStart, periodEnd, driveUrl, inputData }) {
  const existing = await getStatementById(id);
  if (!existing) throw new Error('対象の決算書が見つかりません');
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.statementsSheetName}!A${id}:G${id}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        yearLabel, periodStart, periodEnd, existing.driveFileId,
        driveUrl || existing.driveUrl, existing.createdAt, JSON.stringify(inputData || {}),
      ]],
    },
  });
}

async function deleteStatement(id) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.statementsSheetName}!A${id}:G${id}`,
  });
}

// --- 防災設定 タブ ---
// 列: A:種別(拠点/避難所), B:名称, C:住所, D:緯度, E:経度, F:登録日時

function rowToDisasterEntry(row, index) {
  return {
    row: index + 2,
    type: row[0] || '',
    name: row[1] || '',
    address: row[2] || '',
    lat: Number(row[3] || 0),
    lng: Number(row[4] || 0),
    createdAt: row[5] || '',
  };
}

async function getDisasterEntries() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.disasterSheetName}!A2:F`,
  });
  return (res.data.values || []).map(rowToDisasterEntry).filter((e) => e.type);
}

// 拠点（自治会館など）は1件だけ。既存があれば上書きし、なければ追加する
async function setBaseEntry({ name, address, lat, lng }) {
  const entries = await getDisasterEntries();
  const existing = entries.find((e) => e.type === '拠点');
  const values = [['拠点', name, address, lat, lng, new Date().toISOString()]];
  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.disasterSheetName}!A${existing.row}:F${existing.row}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.disasterSheetName}!A:F`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  }
}

async function addShelter({ name, address, lat, lng }) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.disasterSheetName}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [['避難所', name, address, lat, lng, new Date().toISOString()]],
    },
  });
}

async function updateShelter(row, { name, address, lat, lng }) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.disasterSheetName}!A${row}:F${row}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [['避難所', name, address, lat, lng, new Date().toISOString()]],
    },
  });
}

async function deleteShelter(row) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.disasterSheetName}!A${row}:F${row}`,
  });
}

// --- 予約配信 タブ ---
// 列順: A:行事名, B:行事日, C:開始時刻, D:終了時刻, E:場所, F:持ち物,
//       G:対象グループ, H:参加確認する(TRUE/FALSE), I:本文,
//       J:配信予定日, K:配信予定時刻, L:ステータス(pending/sent/failed), M:登録日時, N:送信日時

function rowToSchedule(row, index) {
  return {
    // シート上の行番号（2行目始まり）をIDとして使う
    id: index + 2,
    eventName: row[0] || '',
    eventDate: row[1] || '',
    timeStart: row[2] || '',
    timeEnd: row[3] || '',
    place: row[4] || '',
    belongings: row[5] || '',
    group: row[6] || '全員',
    confirmAttendance: row[7] === 'TRUE' || row[7] === true,
    messageBody: row[8] || '',
    sendDate: row[9] || '',
    sendTime: row[10] || '',
    status: row[11] || 'pending',
    createdAt: row[12] || '',
    sentAt: row[13] || '',
  };
}

function scheduleToRow(fields) {
  return [
    fields.eventName || '',
    fields.eventDate || '',
    fields.timeStart || '',
    fields.timeEnd || '',
    fields.place || '',
    fields.belongings || '',
    fields.group || '全員',
    fields.confirmAttendance ? 'TRUE' : 'FALSE',
    fields.messageBody || '',
    fields.sendDate || '',
    fields.sendTime || '',
  ];
}

async function getSchedules() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.scheduleSheetName}!A2:N`,
  });
  return (res.data.values || []).map(rowToSchedule).filter((s) => s.eventName || s.messageBody);
}

async function getSchedule(id) {
  const schedules = await getSchedules();
  return schedules.find((s) => s.id === Number(id)) || null;
}

async function addSchedule(fields) {
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.scheduleSheetName}!A:N`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[...scheduleToRow(fields), 'pending', now, '']],
    },
  });
}

async function updateSchedule(id, fields) {
  // 内容を編集した予約は、まだ送信していなければ pending のままにする
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.scheduleSheetName}!A${id}:K${id}`,
    valueInputOption: 'RAW',
    requestBody: { values: [scheduleToRow(fields)] },
  });
}

async function deleteSchedule(id) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.scheduleSheetName}!A${id}:N${id}`,
  });
}

// 配信済み・失敗の予約に未来の日時を入れ直した時に、もう一度「予約中」へ戻す（使い回し用）。送信日時の記録は消す
async function resetScheduleToPending(id) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.scheduleSheetName}!L${id}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['pending']] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.scheduleSheetName}!N${id}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['']] },
  });
}

async function markScheduleStatus(id, status) {
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    // L列(ステータス)とN列(送信日時)だけを更新する。M列(登録日時)は上書きしない
    range: `${config.google.scheduleSheetName}!L${id}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[status]] },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.scheduleSheetName}!N${id}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[now]] },
  });
}

// --- 議事録 タブ ---
// 列: A:日付, B:時刻, C:タイトル, D:場所, E:出席者, F:議事録本文, G:文字起こし, H:DriveファイルID, I:DriveURL

function rowToMinutes(row, index) {
  return {
    id: index + 2,
    meetingDate: row[0] || '',
    meetingTime: row[1] || '',
    title: row[2] || '',
    place: row[3] || '',
    attendees: row[4] ? row[4].split('、').filter(Boolean) : [],
    summaryText: row[5] || '',
    transcriptText: row[6] || '',
    driveFileId: row[7] || '',
    driveUrl: row[8] || '',
  };
}

function minutesSortKey(m) {
  return `${m.meetingDate}T${m.meetingTime || '00:00'}`;
}

async function getMinutesList() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.minutes.sheetName}!A2:I`,
  });
  return (res.data.values || [])
    .map(rowToMinutes)
    .filter((m) => m.title)
    .sort((a, b) => (minutesSortKey(a) < minutesSortKey(b) ? 1 : -1));
}

async function getMinutesById(id) {
  const list = await getMinutesList();
  return list.find((m) => m.id === Number(id)) || null;
}

async function addMinutes({ meetingDate, meetingTime, title, place, attendees, summaryText, transcriptText, driveFileId, driveUrl }) {
  // values.appendの「空いている行を自動で探すテーブル検出」は、途中に列がズレた行が1つでもあると
  // 以後の追加まで巻き込んでズレる問題があったため、次の行番号を自分で計算し、決め打ちのセル範囲に書く
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.minutes.sheetName}!A:A`,
  });
  const nextRow = (existing.data.values || []).length + 1;

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.minutes.sheetName}!A${nextRow}:I${nextRow}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        meetingDate, meetingTime, title, place || '', (attendees || []).join('、'),
        summaryText, transcriptText, driveFileId, driveUrl,
      ]],
    },
  });
  return nextRow;
}

async function updateMinutesContent(id, { meetingDate, meetingTime, title, place, attendees, summaryText, transcriptText, driveUrl }) {
  const existing = await getMinutesById(id);
  if (!existing) throw new Error('対象の議事録が見つかりません');
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.minutes.sheetName}!A${id}:I${id}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        meetingDate || existing.meetingDate,
        meetingTime || existing.meetingTime,
        title,
        place != null ? place : existing.place,
        attendees != null ? attendees.join('、') : existing.attendees.join('、'),
        summaryText,
        transcriptText != null ? transcriptText : existing.transcriptText,
        existing.driveFileId,
        driveUrl || existing.driveUrl,
      ]],
    },
  });
}

async function deleteMinutes(id) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.minutes.sheetName}!A${id}:F${id}`,
  });
}

// --- 管理設定 タブ（管理画面ログイン番号） ---
// 列: A:ログイン番号（B2セル1つだけを使う）

async function getAdminPasscode() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.adminSettingsSheetName}!A2`,
  });
  const rows = res.data.values || [];
  return rows[0] && rows[0][0] ? String(rows[0][0]) : '';
}

async function setAdminPasscode(code) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.adminSettingsSheetName}!A2`,
    valueInputOption: 'RAW',
    requestBody: { values: [[code]] },
  });
}

// 引き継ぎ後も一定期間だけ使える「旧番号」と、その有効期限（管理設定タブの B2 / C2）
async function getAdminOldPasscode() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.adminSettingsSheetName}!B2:C2`,
  });
  const row = (res.data.values || [])[0] || [];
  return { code: row[0] ? String(row[0]) : '', expiresAt: row[1] ? String(row[1]) : '' };
}

async function setAdminOldPasscode(code, expiresAt) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.adminSettingsSheetName}!B2:C2`,
    valueInputOption: 'RAW',
    requestBody: { values: [[code, expiresAt]] },
  });
}

// --- 管理者アカウント タブ（役員ごとのログイン番号） ---
// 列: A:LINEID, B:氏名, C:パスワードハッシュ(salt:hash), D:役職, E:登録日時

function rowToAdminAccount(row, index) {
  return {
    row: index + 2,
    lineUserId: row[0] || '',
    name: row[1] || '',
    passwordHash: row[2] || '',
    role: row[3] || '',
    createdAt: row[4] || '',
  };
}

async function getAdminAccounts() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.adminAccountsSheetName}!A2:E`,
  });
  return (res.data.values || []).map(rowToAdminAccount).filter((a) => a.lineUserId);
}

// 同じ役員に再設定した場合は上書きする
async function upsertAdminAccount({ lineUserId, name, passwordHash, role }) {
  const accounts = await getAdminAccounts();
  const existing = accounts.find((a) => a.lineUserId === lineUserId);
  const values = [[lineUserId, name, passwordHash, role || '', new Date().toISOString()]];
  if (existing) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.adminAccountsSheetName}!A${existing.row}:E${existing.row}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `${config.google.adminAccountsSheetName}!A:E`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
  }
}

// --- ログイン履歴 タブ ---
// 列: A:氏名, B:日時

async function appendLoginLog(name) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.loginLogSheetName}!A:B`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[name, new Date().toISOString()]] },
  });
}

async function getRecentLoginLog(limit) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.loginLogSheetName}!A2:B`,
  });
  const rows = (res.data.values || []).map((row) => ({ name: row[0] || '', at: row[1] || '' }));
  return rows.slice(-limit).reverse();
}

// --- ログイン引き継ぎ タブ ---
// 列: A:token, B:送信元LINEID, C:送信元氏名, D:相手LINEID, E:相手氏名, F:使用済み(TRUE/FALSE), G:作成日時

function rowToHandoverRequest(row, index) {
  return {
    row: index + 2,
    token: row[0] || '',
    fromLineUserId: row[1] || '',
    fromName: row[2] || '',
    toLineUserId: row[3] || '',
    toName: row[4] || '',
    used: row[5] === 'TRUE',
    createdAt: row[6] || '',
    notified: row[7] === 'TRUE',
    remindSent: row[8] === 'TRUE',
    expiredHandled: row[9] === 'TRUE',
  };
}

async function createHandoverRequest({ token, fromLineUserId = '', fromName = '', toLineUserId, toName }) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.handoverSheetName}!A:J`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[token, fromLineUserId, fromName, toLineUserId, toName, 'FALSE', new Date().toISOString(), 'FALSE', 'FALSE', 'FALSE']],
    },
  });
}

async function getHandoverRequest(token) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.handoverSheetName}!A2:J`,
  });
  const rows = (res.data.values || []).map(rowToHandoverRequest);
  return rows.find((r) => r.token === token) || null;
}

// 新パスワードが設定済みで、旧会長へまだ通知していない引き継ぎのうち、いちばん新しいもの
async function getPendingHandoverNotice() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.handoverSheetName}!A2:J`,
  });
  const rows = (res.data.values || []).map(rowToHandoverRequest);
  const pending = rows.filter((r) => r.used && !r.notified && r.fromLineUserId);
  return pending.length > 0 ? pending[pending.length - 1] : null;
}

// 期限の管理用：全件と、I列（1週間前の通知済み）／J列（期限切れの対応済み）の更新
async function getAllHandoverRequests() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.handoverSheetName}!A2:J`,
  });
  return (res.data.values || []).map(rowToHandoverRequest).filter((r) => r.token);
}

async function markHandoverFlag(row, column) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.handoverSheetName}!${column}${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['TRUE']] },
  });
}

async function markHandoverNotified(row) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.handoverSheetName}!H${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['TRUE']] },
  });
}

async function markHandoverUsed(row) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.handoverSheetName}!F${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['TRUE']] },
  });
}

module.exports = {
  getAllMembers,
  updateMemberRole,
  updateMemberRealName,
  deleteMember,
  getMemberIncludingDeleted,
  restoreMember,
  getMembersByGroupGroupedByToken,
  getEvents,
  addEvent,
  updateEvent,
  deleteEvent,
  getTemplates,
  addTemplate,
  updateTemplate,
  deleteTemplate,
  getPlaces,
  addPlace,
  updatePlace,
  deletePlace,
  getGroupMasterList,
  replaceGroupMasterList,
  getRoles,
  addRole,
  updateRole,
  deleteRole,
  reorderRoles,
  createAttendanceSession,
  getAttendanceSessions,
  getAttendanceSession,
  getAttendanceResponses,
  recordAttendanceResponse,
  deleteAttendanceSession,
  createSafetySession,
  getSafetySessions,
  getSafetySession,
  getSafetyResponses,
  recordSafetyResponse,
  reportSafetyLocation,
  deleteSafetySession,
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getBudgets,
  getLatestBudgets,
  saveBudgets,
  getStatements,
  getStatementById,
  addStatement,
  updateStatement,
  deleteStatement,
  getDisasterEntries,
  setBaseEntry,
  addShelter,
  updateShelter,
  deleteShelter,
  getSchedules,
  getSchedule,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  markScheduleStatus,
  resetScheduleToPending,
  getMinutesList,
  getMinutesById,
  addMinutes,
  updateMinutesContent,
  deleteMinutes,
  getAdminPasscode,
  setAdminPasscode,
  getAdminOldPasscode,
  setAdminOldPasscode,
  getPendingHandoverNotice,
  getAllHandoverRequests,
  markHandoverFlag,
  markHandoverNotified,
  getAdminAccounts,
  upsertAdminAccount,
  appendLoginLog,
  getRecentLoginLog,
  createHandoverRequest,
  getHandoverRequest,
  markHandoverUsed,
};
