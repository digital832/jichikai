const crypto = require('crypto');

// 6桁の数字パスワードを、ソルト付きでハッシュ化して1つの文字列(salt:hash)にする
function hashPassword(password) {
  const salt = crypto.randomBytes(8).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  let check;
  try {
    check = crypto.scryptSync(password, salt, 32).toString('hex');
  } catch (err) {
    return false;
  }
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };
