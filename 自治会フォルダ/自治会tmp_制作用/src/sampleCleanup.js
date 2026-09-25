const config = require('./config');
const sheetsClient = require('./sheetsClient');

// サンプル自治会専用の機能。現場でQRコードを読んで自由に登録できる環境のため、
// 自治会長以外（役員に変更されていても含む）の会員は、初めて見つけてから24時間経ったら
// 自動で名簿から削除する（deleteMemberと同じソフトデリート。班シート同期で復活しない）。
//
// 「初めて見つけた時刻」はこのプロセスのメモリ上でだけ管理する。サーバー再起動（デプロイ等）で
// リセットされ、その会員の猶予は再び24時間からになるが、サンプル用の一時データなので許容している。
// SAMPLE_AUTO_CLEANUP=true を設定した自治会（Cloud Runサービス）だけで動く。

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30分おきに確認
const DELETE_AFTER_MS = 24 * 60 * 60 * 1000; // 24時間

const firstSeenAt = new Map(); // lineUserId -> 初めて確認した時刻(ms)

async function runOnce() {
  if (!config.sampleAutoCleanup) return;
  try {
    const members = await sheetsClient.getAllMembers();
    const targets = members.filter((m) => m.role !== '自治会長');
    const stillPresent = new Set();

    for (const m of targets) {
      stillPresent.add(m.lineUserId);
      const seenAt = firstSeenAt.get(m.lineUserId);
      if (!seenAt) {
        firstSeenAt.set(m.lineUserId, Date.now());
        continue;
      }
      if (Date.now() - seenAt >= DELETE_AFTER_MS) {
        await sheetsClient.deleteMember(m.row);
        firstSeenAt.delete(m.lineUserId);
        console.log(`サンプル自治会: ${m.realName || m.lineName || m.lineUserId} を登録から24時間経過のため自動削除しました`);
      }
    }

    // 名簿から既にいなくなった人（手動削除や役職変更前に消えた等）の記録は溜め込まず掃除する
    for (const lineUserId of [...firstSeenAt.keys()]) {
      if (!stillPresent.has(lineUserId)) firstSeenAt.delete(lineUserId);
    }
  } catch (err) {
    console.error('サンプル自治会の自動削除チェックに失敗:', err);
  }
}

function start() {
  if (!config.sampleAutoCleanup) return;
  console.log('サンプル自治会モード: 自治会長以外の会員は登録から24時間で自動削除します');
  runOnce();
  setInterval(runOnce, CHECK_INTERVAL_MS);
}

module.exports = { start, runOnce };
