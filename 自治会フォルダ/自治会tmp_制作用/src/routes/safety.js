const express = require('express');
const sheetsClient = require('../sheetsClient');
const attendanceToken = require('../attendanceToken');
const lineClient = require('../lineClient');
const config = require('../config');

const router = express.Router();

// SOSは役員が画面を見ていなくても気づけるよう、送信された瞬間にLINEで自治会長・役員へ知らせる
const OFFICER_ROLES = ['自治会長', '役員'];

async function notifySosToOfficers(session, sessionId, member) {
  try {
    const members = await sheetsClient.getAllMembers();
    const officers = members.filter((m) => OFFICER_ROLES.includes(m.role) && m.accessToken && m.lineUserId);
    if (officers.length === 0) return;

    const name = member ? (member.realName || member.lineName) : '（名前未登録）';
    const lines = [
      '【緊急】安否確認でSOSが送信されました',
      session.eventName || 'お知らせ',
      `SOSを送信した方: ${name}`,
    ];
    if (config.baseUrl) {
      const token = attendanceToken.encodeSummary(sessionId);
      lines.push('', '安否状況を確認してください:', `${config.baseUrl}/safety-status.html?token=${token}`);
    }
    const text = lines.join('\n');

    const groups = new Map();
    officers.forEach((o) => {
      if (!groups.has(o.accessToken)) groups.set(o.accessToken, []);
      groups.get(o.accessToken).push(o.lineUserId);
    });
    for (const [accessToken, lineUserIds] of groups.entries()) {
      await lineClient.sendMulticast(accessToken, lineUserIds, text);
    }
  } catch (err) {
    // SOS通知が失敗しても、本人の回答自体は記録済みなのでエラーは飲み込む（画面にはエラーを出さない）
    console.error('SOS通知の送信に失敗:', err);
  }
}

function summarize(responses) {
  const safe = responses.filter((r) => r.status === '全員無事').length;
  const missing = responses.filter((r) => r.status === '行方不明').length;
  const sos = responses.filter((r) => r.status === 'SOS').length;
  return { safe, missing, sos, responded: responses.length };
}

// セッションの送信対象者のうち、まだ回答していない人を割り出す
function findUnresponded(session, responses) {
  const respondedIds = new Set(responses.map((r) => r.lineUserId));
  return (session.recipients || []).filter((r) => !respondedIds.has(r.lineUserId));
}

router.get('/sessions', async (req, res) => {
  try {
    const sessions = await sheetsClient.getSafetySessions();
    const allResponses = await sheetsClient.getSafetyResponses();
    const enriched = sessions
      .map((s) => ({
        ...s,
        ...summarize(allResponses.filter((r) => r.sessionId === s.id)),
        missingNames: allResponses
          .filter((r) => r.sessionId === s.id && r.status === '行方不明' && r.missingNames)
          .map((r) => r.missingNames),
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    res.json({ sessions: enriched });
  } catch (err) {
    console.error('安否セッション取得に失敗:', err);
    res.status(500).json({ error: '安否状況の取得に失敗しました' });
  }
});

router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await sheetsClient.getSafetySession(req.params.id);
    if (!session) return res.status(404).json({ error: 'セッションが見つかりません' });
    const responses = await sheetsClient.getSafetyResponses(req.params.id);
    const unresponded = findUnresponded(session, responses);
    // 送信対象者リストが無い古いセッション（この機能追加より前に送信したもの）は、
    // 名前までは分からないが、人数だけは合計人数から逆算できる
    const unrespondedCount = session.recipients && session.recipients.length > 0
      ? unresponded.length
      : Math.max(0, session.totalRecipients - responses.length);
    res.json({ session, responses, unresponded, summary: { ...summarize(responses), unresponded: unrespondedCount } });
  } catch (err) {
    console.error('安否詳細取得に失敗:', err);
    res.status(500).json({ error: '安否状況の取得に失敗しました' });
  }
});

router.delete('/sessions/:id', async (req, res) => {
  try {
    await sheetsClient.deleteSafetySession(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('安否セッション削除に失敗:', err);
    res.status(500).json({ error: '安否状況の削除に失敗しました' });
  }
});

// 役員向け：集計結果をトークンから取得（ログイン不要。個人を特定しないURLで、誰が開いても同じ結果が見える）
router.get('/summary/:token', async (req, res) => {
  try {
    const { sessionId } = attendanceToken.decodeSummary(req.params.token);
    const session = await sheetsClient.getSafetySession(sessionId);
    if (!session) return res.status(404).json({ error: 'このリンクは無効です' });
    const responses = await sheetsClient.getSafetyResponses(sessionId);
    const unresponded = findUnresponded(session, responses);
    const unrespondedCount = session.recipients && session.recipients.length > 0
      ? unresponded.length
      : Math.max(0, session.totalRecipients - responses.length);
    res.json({ session, responses, unresponded, summary: { ...summarize(responses), unresponded: unrespondedCount } });
  } catch (err) {
    res.status(400).json({ error: 'このリンクは無効です' });
  }
});

router.get('/respond/:token', async (req, res) => {
  try {
    const { sessionId } = attendanceToken.decode(req.params.token);
    const session = await sheetsClient.getSafetySession(sessionId);
    if (!session) return res.status(404).json({ error: 'このリンクは無効です' });
    res.json({ eventName: session.eventName, eventDate: session.eventDate });
  } catch (err) {
    res.status(400).json({ error: 'このリンクは無効です' });
  }
});

const VALID_STATUSES = ['全員無事', '行方不明', 'SOS'];

router.post('/respond', async (req, res) => {
  const { token, status, missingNames } = req.body;
  if (!token || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: '不正なリクエストです' });
  }
  try {
    const { sessionId, lineUserId } = attendanceToken.decode(token);
    const session = await sheetsClient.getSafetySession(sessionId);
    if (!session) return res.status(404).json({ error: 'このリンクは無効です' });

    const members = await sheetsClient.getAllMembers();
    const member = members.find((m) => m.lineUserId === lineUserId);
    await sheetsClient.recordSafetyResponse({
      sessionId,
      lineUserId,
      realName: member ? member.realName : '',
      status,
      missingNames: status === '行方不明' ? (missingNames || '') : '',
    });
    if (status === 'SOS') {
      await notifySosToOfficers(session, sessionId, member);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('安否回答の記録に失敗:', err);
    res.status(400).json({ error: 'このリンクは無効です' });
  }
});

router.post('/respond/location', async (req, res) => {
  const { token, lat, lng } = req.body;
  if (!token || !lat || !lng) {
    return res.status(400).json({ error: '不正なリクエストです' });
  }
  try {
    const { sessionId, lineUserId } = attendanceToken.decode(token);
    await sheetsClient.reportSafetyLocation({ sessionId, lineUserId, lat: Number(lat), lng: Number(lng) });
    res.json({ ok: true });
  } catch (err) {
    console.error('現在地の報告に失敗:', err);
    res.status(400).json({ error: 'このリンクは無効です' });
  }
});

module.exports = router;
