const config = require('./config');
const sheetsClient = require('./sheetsClient');
const lineClient = require('./lineClient');
const memberRestoreToken = require('./memberRestoreToken');

const RETRY_MARKER = 'schedule-retry';

// 予約配信が失敗したとき、自治会長のLINEに「もう一度送る」ページへのリンクを送る
async function notifyScheduleFailure(schedule) {
  try {
    const members = await sheetsClient.getAllMembers();
    const chair = members.find((m) => m.role === '自治会長' && m.accessToken);
    if (!chair) return;
    const when = schedule.sendDate && schedule.sendTime ? `${schedule.sendDate.replace(/-/g, '/')} ${schedule.sendTime}` : '';
    const lines = [
      '【自治会システム】',
      `${chair.realName || chair.lineName}様`,
      `予約配信「${schedule.eventName || '（行事名未設定）'}」${when ? `（${when}予定）` : ''}を送信できませんでした。`,
    ];
    if (config.baseUrl) {
      const t = memberRestoreToken.create(schedule.id, RETRY_MARKER);
      lines.push('', 'もう一度送る場合は、こちらのページの「もう一度送る」を押してください。', `${config.baseUrl}/schedule-retry.html?t=${encodeURIComponent(t)}`);
    }
    await lineClient.sendPush(chair.accessToken, chair.lineUserId, lines.join('\n'));
  } catch (err) {
    console.error('予約配信の失敗の通知に失敗:', err.message);
  }
}

module.exports = { notifyScheduleFailure, RETRY_MARKER };
