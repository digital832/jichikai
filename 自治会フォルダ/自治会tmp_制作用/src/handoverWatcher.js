const sheetsClient = require('./sheetsClient');
const lineClient = require('./lineClient');

const config = require('./config');

const LIMIT_MS = config.handoverLimitMs;
const REMIND_AFTER_MS = (LIMIT_MS * 23) / 30; // 期限の1週間前（30日のうち23日目）
// 通常は1時間おき。テストで期限を短くした時は、それに合わせて細かく確認する
const CHECK_INTERVAL = Math.min(60 * 60 * 1000, Math.max(15 * 1000, LIMIT_MS / 12));
const MIN_INTERVAL = Math.min(10 * 60 * 1000, CHECK_INTERVAL);

let lastRun = 0;
let running = false;

function jpDate(ms) {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  const day = `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  // 期限が1日未満（テスト時）は時刻まで表示する
  return LIMIT_MS < 24 * 60 * 60 * 1000
    ? `${day}${d.getUTCHours()}時${String(d.getUTCMinutes()).padStart(2, '0')}分`
    : day;
}

// 引き継ぎを送ったのに、新自治会長がまだ新パスワードを決めていない場合の見張り。
//  ・23日目（期限の1週間前）に、旧自治会長へ「まだです」とLINEで知らせる
//  ・30日目で期限切れ：引き継ぎを取り消し（これまでのパスワードのまま）、旧自治会長へLINEで知らせる
// 新パスワードが決まるまでログイン番号は入れ替えていないので、取り消しても番号を戻す作業は要らない。
async function checkHandoverDeadlines(force) {
  if (running) return;
  if (!force && Date.now() - lastRun < MIN_INTERVAL) return;
  running = true;
  lastRun = Date.now();
  try {
    const requests = (await sheetsClient.getAllHandoverRequests()).filter((r) => !r.used && !r.expiredHandled);
    if (requests.length === 0) return;
    const members = await sheetsClient.getAllMembers();
    const now = Date.now();

    for (const r of requests) {
      const sentAt = r.createdAt ? new Date(r.createdAt).getTime() : NaN;
      if (Number.isNaN(sentAt)) continue;
      const age = now - sentAt;
      const deadline = sentAt + LIMIT_MS;
      const oldChair = members.find((m) => m.lineUserId === r.fromLineUserId);
      const canNotify = Boolean(oldChair && oldChair.accessToken);
      const chairName = oldChair ? oldChair.realName || oldChair.lineName : '';

      if (age >= LIMIT_MS) {
        if (canNotify) {
          const text = [
            '【自治会システム】',
            `${chairName}様`,
            `${r.toName}さんへの自治会長の引き継ぎ（${jpDate(sentAt)}に送信）は、1か月たっても新しいパスワードが設定されなかったため、取り消しました。`,
            'これまでのパスワードをそのままお使いください。',
          ].join('\n');
          await lineClient.sendPush(oldChair.accessToken, r.fromLineUserId, text);
        }
        await sheetsClient.markHandoverFlag(r.row, 'J');
      } else if (age >= REMIND_AFTER_MS && !r.remindSent) {
        if (canNotify) {
          const text = [
            '【自治会システム】',
            `${chairName}様`,
            `${r.toName}さんへ自治会長の引き継ぎを送りましたが、まだ新しいパスワードが設定されていません。`,
            `${jpDate(deadline)}までに設定されない場合、引き継ぎは取り消され、これまでのパスワードのままになります。`,
            `${r.toName}さんに、LINEに届いたリンクから設定するようお伝えください。`,
          ].join('\n');
          await lineClient.sendPush(oldChair.accessToken, r.fromLineUserId, text);
        }
        await sheetsClient.markHandoverFlag(r.row, 'I');
      }
    }
  } catch (err) {
    console.error('引き継ぎの期限確認に失敗:', err);
  } finally {
    running = false;
  }
}

function startHandoverWatcher() {
  checkHandoverDeadlines(true);
  setInterval(() => checkHandoverDeadlines(false), CHECK_INTERVAL);
}

module.exports = { startHandoverWatcher, checkHandoverDeadlines, LIMIT_MS };
