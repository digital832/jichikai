const config = require('./config');
const sheetsClient = require('./sheetsClient');
const { sendBroadcast } = require('./broadcastSender');
const { notifyScheduleFailure } = require('./scheduleFailureNotifier');

// 「YYYY-MM-DD」と「HH:MM」から、日本時間として解釈したDateを作る
function toDate(sendDate, sendTime) {
  if (!sendDate || !sendTime) return null;
  const date = new Date(`${sendDate}T${sendTime}:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

let checking = false;

async function checkAndSendDueSchedules() {
  if (checking) return; // 前回の確認がまだ終わっていなければ重複実行しない
  checking = true;
  try {
    const schedules = await sheetsClient.getSchedules();
    const now = new Date();
    const due = schedules.filter((s) => {
      if (s.status !== 'pending') return false;
      const sendAt = toDate(s.sendDate, s.sendTime);
      return sendAt && sendAt <= now;
    });

    for (const schedule of due) {
      if (schedule.confirmAttendance && !config.baseUrl) {
        console.error(`予約配信(id:${schedule.id})は出欠確認つきですが BASE_URL が未設定のため送信できません`);
        await sheetsClient.markScheduleStatus(schedule.id, 'failed');
        await notifyScheduleFailure(schedule);
        continue;
      }
      try {
        await sendBroadcast(schedule, config.baseUrl);
        await sheetsClient.markScheduleStatus(schedule.id, 'sent');
        console.log(`予約配信(id:${schedule.id} ${schedule.eventName})を自動送信しました`);
      } catch (err) {
        console.error(`予約配信(id:${schedule.id})の自動送信に失敗:`, err);
        await sheetsClient.markScheduleStatus(schedule.id, 'failed');
        await notifyScheduleFailure(schedule);
      }
    }
  } catch (err) {
    console.error('予約配信の確認に失敗:', err);
  } finally {
    checking = false;
  }
}

function startScheduler() {
  checkAndSendDueSchedules();
  setInterval(checkAndSendDueSchedules, config.scheduleCheckIntervalMs);
}

module.exports = { startScheduler, checkAndSendDueSchedules };
