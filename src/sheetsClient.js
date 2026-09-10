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

// 名簿タブの列順: A:LINE名, B:本名, C:役職, D:LINEID, E:所属, F:アクセストークン
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
  };
}

async function getAllMembers() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.google.spreadsheetId,
    range: `${config.google.sheetName}!A2:F`,
  });
  return (res.data.values || []).map(rowToMember).filter((m) => m.lineUserId);
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
// 列順: A:イベント名, B:場所, C:開始時刻, D:終了時刻, E:持ち物

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

module.exports = {
  getAllMembers,
  updateMemberRole,
  updateMemberRealName,
  getMembersByGroupGroupedByToken,
  getEvents,
  addEvent,
  updateEvent,
  deleteEvent,
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
};
