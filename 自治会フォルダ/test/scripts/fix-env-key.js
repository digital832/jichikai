// .envのGOOGLE_SA_PRIVATE_KEY行に紛れ込んだ余計なJSON構文（"private_key": " など）を取り除く一度きりの修正スクリプト。
// 秘密鍵の中身は一切表示しない。
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
const content = fs.readFileSync(envPath, 'utf8');
const lines = content.split('\n');

const idx = lines.findIndex((l) => l.startsWith('GOOGLE_SA_PRIVATE_KEY='));
if (idx === -1) {
  console.log('GOOGLE_SA_PRIVATE_KEY の行が見つかりませんでした。');
  process.exit(1);
}

const value = lines[idx].slice('GOOGLE_SA_PRIVATE_KEY='.length);

const beginMarker = '-----BEGIN PRIVATE KEY-----';
const endMarker = '-----END PRIVATE KEY-----';

const beginIdx = value.indexOf(beginMarker);
const endIdx = value.lastIndexOf(endMarker);

if (beginIdx === -1 || endIdx === -1) {
  console.log('BEGIN/ENDのマーカーが見つかりませんでした。手動確認が必要です。');
  process.exit(1);
}

let endOfCore = endIdx + endMarker.length;
// 末尾に文字としての \n (バックスラッシュ+n) が残っていれば含める
if (value.slice(endOfCore, endOfCore + 2) === '\\n') {
  endOfCore += 2;
}

const core = value.slice(beginIdx, endOfCore);
const cleanedValue = '"' + core + '"';
lines[idx] = 'GOOGLE_SA_PRIVATE_KEY=' + cleanedValue;

fs.writeFileSync(envPath, lines.join('\n'));
console.log('修正しました。新しい値の長さ:', cleanedValue.length, '文字');
