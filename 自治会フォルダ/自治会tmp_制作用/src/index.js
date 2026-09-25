const path = require('path');
const express = require('express');
const config = require('./config');
const sheetsClient = require('./sheetsClient');
const eventsRouter = require('./routes/events');
const templatesRouter = require('./routes/templates');
const placesRouter = require('./routes/places');
const broadcastRouter = require('./routes/broadcast');
const groupsRouter = require('./routes/groups');
const rolesRouter = require('./routes/roles');
const membersRouter = require('./routes/members');
const attendanceRouter = require('./routes/attendance');
const safetyRouter = require('./routes/safety');
const transactionsRouter = require('./routes/transactions');
const categoriesRouter = require('./routes/categories');
const statementsRouter = require('./routes/statements');
const disasterRouter = require('./routes/disaster');
const scheduleRouter = require('./routes/schedule');
const settingsRouter = require('./routes/settings');
const minutesRouter = require('./routes/minutes');
const qrcodeRouter = require('./routes/qrcode');
const syncRouter = require('./routes/sync');
const authRouter = require('./routes/auth');
const auth = require('./auth');
const passcodeStore = require('./adminPasscodeStore');
const { startScheduler } = require('./scheduler');
const { startHandoverWatcher } = require('./handoverWatcher');
const sampleCleanup = require('./sampleCleanup');

const app = express();

app.get('/', (req, res) => res.redirect('/admin/home.html'));
// ブラウザが<link>より先に自動で取りに行く /favicon.ico にも同じアイコンを返す
app.get('/favicon.ico', (req, res) => res.type('image/png').sendFile(path.join(__dirname, '..', 'public', 'favicon-32.png')));

app.use('/api/auth', express.json(), authRouter);
app.use(auth.requireAuth);

app.use('/api/events', express.json(), eventsRouter);
app.use('/api/templates', express.json(), templatesRouter);
app.use('/api/places', express.json(), placesRouter);
app.use('/api/broadcast', express.json(), broadcastRouter);
app.use('/api/groups', express.json(), groupsRouter);
app.use('/api/roles', express.json(), rolesRouter);
app.use('/api/members', express.json(), membersRouter);
app.use('/api/attendance', express.json(), attendanceRouter);
app.use('/api/safety', express.json(), safetyRouter);
app.use('/api/transactions', express.json(), transactionsRouter);
app.use('/api/categories', express.json(), categoriesRouter);
app.use('/api/statements', express.json(), statementsRouter);
app.use('/api/disaster', express.json(), disasterRouter);
app.use('/api/schedule', express.json(), scheduleRouter);
app.use('/api/settings', express.json(), settingsRouter);
// 役員ごとの個別パスワード機能は廃止済み（自治会長の共通番号を選んだ人にだけ共有する方式に統一）。
// routes/adminAccounts.js は使われていないため未マウント（ファイルは履歴のため残置）。
app.use('/api/minutes', minutesRouter);
app.use('/api/qrcode', qrcodeRouter);
app.use('/api/sync-roster', syncRouter);

app.use(express.static('public'));

async function boot() {
  try {
    await sheetsClient.ensureRequiredSheets();
  } catch (err) {
    console.error('必要なシートタブの確認・作成に失敗:', err.message);
  }
  // ログイン番号の読み込みが終わってから受付を始める（起動直後に番号が空のまま応答しないように）
  await passcodeStore.init();
  if (!passcodeStore.get()) {
    console.warn('警告: ログイン番号が未設定のため、管理画面のログイン機能は無効です（誰でもアクセスできます）');
  }
  app.listen(config.port, () => {
    console.log(`サーバーが起動しました: http://localhost:${config.port}`);
    startScheduler();
    startHandoverWatcher();
    sampleCleanup.start();
  });
}

boot();
