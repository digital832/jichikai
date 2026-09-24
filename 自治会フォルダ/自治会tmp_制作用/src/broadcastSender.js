const sheetsClient = require('./sheetsClient');
const lineClient = require('./lineClient');
const attendanceToken = require('./attendanceToken');

// この役職の会員には、出欠・安否の確認リンクに加えて「集計結果（役員用）」のリンクも送る
const OFFICER_ROLES = ['自治会長', '役員'];
const isOfficer = (member) => OFFICER_ROLES.includes(member.role);

function buildMessageText(fields) {
  const lines = [];
  if (fields.eventName) lines.push(fields.eventName);
  if (fields.eventDate) lines.push(`日時: ${fields.eventDate}${fields.timeStart ? ' ' + fields.timeStart : ''}${fields.timeEnd ? '〜' + fields.timeEnd : ''}`);
  if (fields.place) lines.push(`場所: ${fields.place}`);
  if (fields.belongings) lines.push(`持ち物: ${fields.belongings}`);
  lines.push('');
  lines.push(fields.messageBody || '');
  return lines.join('\n');
}

// 「LINEで送信する」ボタン（即時配信）と予約配信（時刻がきたら自動配信）の両方から呼ばれる、配信の本体処理
async function sendBroadcast(fields, baseUrl) {
  const { groups, withoutToken } = await sheetsClient.getMembersByGroupGroupedByToken(fields.group);
  const baseText = buildMessageText(fields);
  const allMembers = [].concat(...Array.from(groups.values()));

  let successCount = 0;
  const failedTokens = [];
  let attendanceSessionId = null;
  let safetySessionId = null;

  const needsPersonalizedLinks = fields.confirmAttendance || fields.confirmSafety;

  if (needsPersonalizedLinks) {
    if (fields.confirmAttendance) {
      attendanceSessionId = await sheetsClient.createAttendanceSession({
        eventName: fields.eventName || 'お知らせ',
        eventDate: fields.eventDate || '',
        totalRecipients: allMembers.length,
      });
    }
    if (fields.confirmSafety) {
      safetySessionId = await sheetsClient.createSafetySession({
        eventName: fields.eventName || 'お知らせ',
        eventDate: fields.eventDate || '',
        totalRecipients: allMembers.length,
        recipients: allMembers.map((m) => ({ lineUserId: m.lineUserId, realName: m.realName })),
      });
    }

    for (const [accessToken, members] of groups.entries()) {
      for (const member of members) {
        let text = baseText;
        if (attendanceSessionId) {
          const token = attendanceToken.encode(attendanceSessionId, member.lineUserId);
          text += `\n\n${baseUrl}/attend.html?token=${token}`;
          if (isOfficer(member)) {
            const summaryToken = attendanceToken.encodeSummary(attendanceSessionId);
            text += `\n\n${baseUrl}/attendance-status.html?token=${summaryToken}`;
          }
        }
        if (safetySessionId) {
          const token = attendanceToken.encode(safetySessionId, member.lineUserId);
          text += `\n\n${baseUrl}/safety.html?token=${token}`;
          if (isOfficer(member)) {
            const summaryToken = attendanceToken.encodeSummary(safetySessionId);
            text += `\n\n${baseUrl}/safety-status.html?token=${summaryToken}`;
          }
        }
        try {
          await lineClient.sendPush(accessToken, member.lineUserId, text);
          successCount += 1;
        } catch (err) {
          console.error('push送信に失敗:', err.message);
          if (!failedTokens.includes(accessToken)) failedTokens.push(accessToken);
        }
      }
    }
  } else {
    for (const [accessToken, members] of groups.entries()) {
      const lineUserIds = members.map((m) => m.lineUserId);
      try {
        await lineClient.sendMulticast(accessToken, lineUserIds, baseText);
        successCount += lineUserIds.length;
      } catch (err) {
        console.error('multicast送信に失敗:', err.message);
        failedTokens.push(accessToken);
      }
    }
  }

  return {
    successCount,
    skippedNoToken: withoutToken.length,
    failedAccountCount: failedTokens.length,
    attendanceSessionId,
    safetySessionId,
  };
}

module.exports = { buildMessageText, sendBroadcast };
