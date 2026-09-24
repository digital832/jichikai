const crypto = require('crypto');
const config = require('./config');

const VALID_MS = 30 * 24 * 60 * 60 * 1000; // 削除から30日は取り消せる

function sign(payload) {
  return crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
}

// 「この行の、この人の削除を取り消してよい」という署名つきの文字列を作る
function create(row, lineUserId) {
  const payload = Buffer.from(JSON.stringify({ row, lineUserId, exp: Date.now() + VALID_MS })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verify(token) {
  if (typeof token !== 'string' || !config.sessionSecret) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.row || !data.lineUserId || Date.now() > data.exp) return null;
    return data;
  } catch (err) {
    return null;
  }
}

module.exports = { create, verify };
