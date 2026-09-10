const express = require('express');
const sheetsClient = require('../sheetsClient');
const lineClient = require('../lineClient');
const attendanceToken = require('../attendanceToken');
const { buildAnnouncementDocx } = require('../docxBuilder');

const router = express.Router();

function buildMessageText(fields) {
  const lines = [];
  if (fields.eventName) lines.push(fields.eventName);
  if (fields.eventDate) lines.push(`日時: ${fields.eventDate}${fields.timeStart ? ' ' + fields.timeStart : ''}${fields.timeEnd ? '〜' + fields.timeEnd : ''}`);
  if (fields.place) lines.push(`場所: ${fields.place}`);
  if (fields.belongings) lines.push(`持ち物: ${fields.belongings}`);
  lines.push('');
  lines.push(fields.messageBody || '');
  if (fields.confirmSafety) lines.push('\n※安否確認のため、無事であればご返信をお願いします。');
  return lines.join('\n');
}

router.post('/', async (req, res) => {
  const fields = req.body || {};
  try {
    const { groups, withoutToken } = await sheetsClient.getMembersByGroupGroupedByToken(fields.group);
    const baseText = buildMessageText(fields);
    const allMembers = [].concat(...Array.from(groups.values()));

    let successCount = 0;
    const failedTokens = [];
    let attendanceSessionId = null;

    if (fields.confirmAttendance) {
      attendanceSessionId = await sheetsClient.createAttendanceSession({
        eventName: fields.eventName || 'お知らせ',
        eventDate: fields.eventDate || '',
        totalRecipients: allMembers.length,
      });
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      for (const [accessToken, members] of groups.entries()) {
        for (const member of members) {
          const token = attendanceToken.encode(attendanceSessionId, member.lineUserId);
          const link = `${baseUrl}/attend.html?token=${token}`;
          const text = `${baseText}\n\n▼出欠のご連絡はこちらから\n${link}`;
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

    res.json({
      ok: true,
      successCount,
      skippedNoToken: withoutToken.length,
      failedAccountCount: failedTokens.length,
      attendanceSessionId,
    });
  } catch (err) {
    console.error('配信処理に失敗:', err);
    res.status(500).json({ error: '配信に失敗しました' });
  }
});

router.post('/docx', async (req, res) => {
  try {
    const buffer = await buildAnnouncementDocx(req.body || {});
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="announcement.docx"',
    });
    res.send(buffer);
  } catch (err) {
    console.error('Word生成に失敗:', err);
    res.status(500).json({ error: 'Wordファイルの生成に失敗しました' });
  }
});

module.exports = router;
