const crypto = require('crypto');
const config = require('./config');
const passcodeStore = require('./adminPasscodeStore');

const COOKIE_NAME = 'jichikai_admin';
// ブラウザを閉じるとログインが切れる「セッションCookie」にするため、Set-CookieにMax-Ageは付けない。
// ここでの時間は、万一ブラウザがセッションを復元してしまった場合の保険的な上限（サーバー側の有効期限）。
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12時間

// 会員向け（ログイン不要）で公開しておくAPI
const PUBLIC_API_PATHS = [
  '/api/auth/login',
  '/api/attendance/respond',
  '/api/safety/respond',
  '/api/attendance/summary',
  '/api/safety/summary',
];

function sign(value) {
  const hmac = crypto.createHmac('sha256', config.sessionSecret).update(value).digest('hex');
  return `${value}.${hmac}`;
}

function verify(signed) {
  if (!signed) return false;
  const dot = signed.lastIndexOf('.');
  if (dot === -1) return false;
  const value = signed.slice(0, dot);
  const hmac = signed.slice(dot + 1);
  const expected = crypto.createHmac('sha256', config.sessionSecret).update(value).digest('hex');
  const hmacBuf = Buffer.from(hmac);
  const expectedBuf = Buffer.from(expected);
  if (hmacBuf.length !== expectedBuf.length) return false;
  if (!crypto.timingSafeEqual(hmacBuf, expectedBuf)) return false;
  const expiresAt = Number(value);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((part) => {
    const eq = part.indexOf('=');
    if (eq === -1) return;
    cookies[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  });
  return cookies;
}

function isLoggedIn(req) {
  if (!passcodeStore.get()) return true; // 番号未設定＝ログイン機能オフ（従来どおり誰でも入れる）
  return verify(parseCookies(req)[COOKIE_NAME]);
}

function issueCookie(res) {
  const expiresAt = Date.now() + MAX_AGE_MS;
  const token = encodeURIComponent(sign(String(expiresAt)));
  // Max-Age/Expiresを付けない＝セッションCookie。ブラウザを閉じると次回は再ログインが必要になる。
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function isPublicApiPath(path) {
  return PUBLIC_API_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

function requireAuth(req, res, next) {
  const path = req.path;
  const isAdminPage = path.startsWith('/admin/') && path !== '/admin/login.html';
  const isApi = path.startsWith('/api/');
  if (!isAdminPage && !isApi) return next();
  if (isApi && ((path === '/api/disaster' && req.method === 'GET') || isPublicApiPath(path))) {
    return next();
  }
  if (isLoggedIn(req)) return next();
  if (isApi) return res.status(401).json({ error: 'ログインが必要です' });
  return res.redirect(`/admin/login.html?next=${encodeURIComponent(req.originalUrl)}`);
}

module.exports = { requireAuth, isLoggedIn, issueCookie, clearCookie };
