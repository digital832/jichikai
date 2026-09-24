require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

module.exports = {
  port: process.env.PORT || 3000,
  communityName: process.env.COMMUNITY_NAME || '',
  google: {
    spreadsheetId: required('GOOGLE_SHEETS_SPREADSHEET_ID'),
    sheetName: process.env.GOOGLE_SHEETS_SHEET_NAME || '名簿',
    eventsSheetName: process.env.GOOGLE_SHEETS_EVENTS_SHEET_NAME || 'Events',
    templatesSheetName: process.env.GOOGLE_SHEETS_TEMPLATES_SHEET_NAME || '定型文マスタ',
    placesSheetName: process.env.GOOGLE_SHEETS_PLACES_SHEET_NAME || '場所マスタ',
    groupMasterSheetName: process.env.GOOGLE_SHEETS_GROUP_MASTER_SHEET_NAME || 'グループマスタ',
    roleMasterSheetName: process.env.GOOGLE_SHEETS_ROLE_MASTER_SHEET_NAME || '役職マスタ',
    attendanceSessionSheetName: process.env.GOOGLE_SHEETS_ATTENDANCE_SESSION_SHEET_NAME || '出欠セッション',
    attendanceResponseSheetName: process.env.GOOGLE_SHEETS_ATTENDANCE_RESPONSE_SHEET_NAME || '出欠回答',
    safetySessionSheetName: process.env.GOOGLE_SHEETS_SAFETY_SESSION_SHEET_NAME || '安否セッション',
    safetyResponseSheetName: process.env.GOOGLE_SHEETS_SAFETY_RESPONSE_SHEET_NAME || '安否回答',
    transactionsSheetName: process.env.GOOGLE_SHEETS_TRANSACTIONS_SHEET_NAME || '入出金',
    statementsSheetName: process.env.GOOGLE_SHEETS_STATEMENTS_SHEET_NAME || '決算書',
    budgetsSheetName: process.env.GOOGLE_SHEETS_BUDGETS_SHEET_NAME || '予算マスタ',
    categoriesSheetName: process.env.GOOGLE_SHEETS_CATEGORIES_SHEET_NAME || '科目マスタ',
    disasterSheetName: process.env.GOOGLE_SHEETS_DISASTER_SHEET_NAME || '防災設定',
    scheduleSheetName: process.env.GOOGLE_SHEETS_SCHEDULE_SHEET_NAME || '予約配信',
    adminSettingsSheetName: process.env.GOOGLE_SHEETS_ADMIN_SETTINGS_SHEET_NAME || '管理設定',
    adminAccountsSheetName: process.env.GOOGLE_SHEETS_ADMIN_ACCOUNTS_SHEET_NAME || '管理者アカウント',
    loginLogSheetName: process.env.GOOGLE_SHEETS_LOGIN_LOG_SHEET_NAME || 'ログイン履歴',
    handoverSheetName: process.env.GOOGLE_SHEETS_HANDOVER_SHEET_NAME || 'ログイン引き継ぎ',
    districtFolderId: process.env.GOOGLE_DRIVE_DISTRICT_FOLDER_ID || '',
    clientEmail: required('GOOGLE_SA_CLIENT_EMAIL'),
    // JSONキーファイルのprivate_keyは "\n" が文字として入っているため、実際の改行に変換する
    privateKey: required('GOOGLE_SA_PRIVATE_KEY').replace(/\\n/g, '\n'),
  },
  // 対象グループのうち常に固定で表示する選択肢（それ以外は役職マスタ・管理地区フォルダから動的に取得する）
  fixedGroups: ['全員'],
  printFolderUrl: process.env.PRINT_FOLDER_URL || '',
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    // 文字起こし専用モデル（要約用のmodelより精度重視。音声→テキストの最初の段階だけに使う）
    transcribeModel: process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-3.5-transcribe',
  },
  minutes: {
    // 議事録(PDF)の保存先Drive フォルダID。未設定の間は議事録の自動作成機能は使えない
    driveFolderId: process.env.MINUTES_DRIVE_FOLDER_ID || '',
    sheetName: process.env.GOOGLE_SHEETS_MINUTES_SHEET_NAME || '議事録',
  },
  accounting: {
    // 決算書(Excel)の保存先Driveフォルダ。未設定の間は決算書作成機能は使えない
    driveFolderId: process.env.ACCOUNTING_DRIVE_FOLDER_ID || '',
  },
  qrCode: {
    // 住民用・役員班長用QRコード(PDF)が入っているDriveフォルダのID。
    // このフォルダをGOOGLE_SA_CLIENT_EMAILのサービスアカウントに「閲覧者」で共有しておく必要がある
    // （管理地区フォルダと同様、フォルダごとの個別共有が必要）
    driveFolderId: process.env.QR_CODE_DRIVE_FOLDER_ID || '',
  },
  // 議事録PDFを本人のGoogleアカウント名義でDriveに保存するためのOAuth設定
  // （サービスアカウントはDrive容量を持たないため、ファイル作成だけはこちらを使う）
  oauth: {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN || '',
  },
  // 予約配信で出欠・安否確認リンクを作る際に使うURL（例: https://jichikai.example.com）。未設定の場合、予約配信での出欠・安否確認は使えない
  baseUrl: process.env.BASE_URL || '',
  // 予約配信の送信予定を何秒おきに確認するか
  scheduleCheckIntervalMs: Number(process.env.SCHEDULE_CHECK_INTERVAL_MS || 60000),
  // 管理画面ログイン用の6桁番号。未設定の場合はログイン機能自体が無効になる（誰でも入れる＝現状維持）
  adminPasscode: process.env.ADMIN_PASSCODE || '',
  // 自治会長引き継ぎの期限（ミリ秒）。通常は30日。動作テスト用に HANDOVER_LIMIT_MINUTES（分）で短縮できる
  handoverLimitMs: process.env.HANDOVER_LIMIT_MINUTES
    ? Number(process.env.HANDOVER_LIMIT_MINUTES) * 60 * 1000
    : 30 * 24 * 60 * 60 * 1000,
  // ログインセッションの署名に使う鍵。未設定ならADMIN_PASSCODEを流用する
  sessionSecret: process.env.SESSION_SECRET || process.env.ADMIN_PASSCODE || '',
};
