const config = require('./config');
const sheetsClient = require('./sheetsClient');

// 起動直後はまず.envの値を仮の正とし、シートから読めたらシートの値で上書きする
let current = config.adminPasscode || '';
// 引き継ぎ後、一定期間だけ使える旧番号
let oldCode = '';
let oldExpiresAt = 0;

async function init() {
  try {
    const stored = await sheetsClient.getAdminPasscode();
    if (stored) {
      current = stored;
    } else if (current) {
      // シートがまだ空の場合は.envの値を書き込み、以後はシートを正とする
      await sheetsClient.setAdminPasscode(current);
    }
  } catch (err) {
    console.error('ログイン番号の読み込みに失敗しました（.envの値を使用します）:', err.message);
  }
  try {
    const old = await sheetsClient.getAdminOldPasscode();
    oldCode = old.code;
    oldExpiresAt = old.expiresAt ? new Date(old.expiresAt).getTime() : 0;
  } catch (err) {
    console.error('旧ログイン番号の読み込みに失敗しました:', err.message);
  }
}

function get() {
  return current;
}

async function set(newCode) {
  await sheetsClient.setAdminPasscode(newCode);
  current = newCode;
}

// 旧番号を、期限つきで残す（期限を過ぎたら自動で使えなくなる）
async function setOld(code, expiresAtMs) {
  await sheetsClient.setAdminOldPasscode(code, new Date(expiresAtMs).toISOString());
  oldCode = code;
  oldExpiresAt = expiresAtMs;
}

function isOldValid(code) {
  return Boolean(oldCode) && code === oldCode && Date.now() < oldExpiresAt;
}

// 現在の番号 または 引き継ぎ猶予中の旧番号 のどちらでも一致すればOK。
// 自治会長の確認を求める画面（役員任命・削除・パスワード共有など）はすべてこれで判定し、
// 引き継ぎ直後で旧自治会長がまだ旧番号を使っている間も操作できるようにする。
function isValid(code) {
  return Boolean(current) && code === current ? true : isOldValid(code);
}

function getOldExpiresAt() {
  return oldExpiresAt;
}

module.exports = { init, get, set, setOld, isOldValid, isValid, getOldExpiresAt };
