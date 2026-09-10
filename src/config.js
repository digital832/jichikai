require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

module.exports = {
  port: process.env.PORT || 3000,
  google: {
    spreadsheetId: required('GOOGLE_SHEETS_SPREADSHEET_ID'),
    sheetName: process.env.GOOGLE_SHEETS_SHEET_NAME || '名簿',
    eventsSheetName: process.env.GOOGLE_SHEETS_EVENTS_SHEET_NAME || 'Events',
    groupMasterSheetName: process.env.GOOGLE_SHEETS_GROUP_MASTER_SHEET_NAME || 'グループマスタ',
    roleMasterSheetName: process.env.GOOGLE_SHEETS_ROLE_MASTER_SHEET_NAME || '役職マスタ',
    attendanceSessionSheetName: process.env.GOOGLE_SHEETS_ATTENDANCE_SESSION_SHEET_NAME || '出欠セッション',
    attendanceResponseSheetName: process.env.GOOGLE_SHEETS_ATTENDANCE_RESPONSE_SHEET_NAME || '出欠回答',
    safetySessionSheetName: process.env.GOOGLE_SHEETS_SAFETY_SESSION_SHEET_NAME || '安否セッション',
    safetyResponseSheetName: process.env.GOOGLE_SHEETS_SAFETY_RESPONSE_SHEET_NAME || '安否回答',
    districtFolderId: process.env.GOOGLE_DRIVE_DISTRICT_FOLDER_ID || '',
    clientEmail: required('GOOGLE_SA_CLIENT_EMAIL'),
    // JSONキーファイルのprivate_keyは "\n" が文字として入っているため、実際の改行に変換する
    privateKey: required('GOOGLE_SA_PRIVATE_KEY').replace(/\\n/g, '\n'),
  },
  // 対象グループのうち常に固定で表示する選択肢（それ以外は役職マスタ・管理地区フォルダから動的に取得する）
  fixedGroups: ['全員'],
  printFolderUrl: process.env.PRINT_FOLDER_URL || '',
};
