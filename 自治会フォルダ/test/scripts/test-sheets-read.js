// 名簿の読み取り・グループ抽出・トークン別グループ化が正しく動くかを確認するスクリプト（書き込みは行わない）
const sheetsClient = require('../src/sheetsClient');

async function main() {
  const members = await sheetsClient.getAllMembers();
  console.log(`名簿の会員数: ${members.length}件`);

  const { groups, withoutToken } = await sheetsClient.getMembersByGroupGroupedByToken('全員');
  console.log(`アクセストークンの種類数: ${groups.size}`);
  for (const [token, list] of groups.entries()) {
    console.log(` - トークン(先頭8文字:${token.slice(0, 8)}...): ${list.length}人`);
  }
  console.log(`トークン未設定: ${withoutToken.length}人`);

  const events = await sheetsClient.getEvents();
  console.log(`イベント数: ${events.length}件`);
}

main().catch((err) => {
  console.error('確認に失敗しました:', err.message);
  process.exit(1);
});
