const express = require('express');
const sheetsClient = require('../sheetsClient');
const attendanceToken = require('../attendanceToken');

const router = express.Router();

function summarize(responses) {
  const safe = responses.filter((r) => r.status === '全員無事').length;
  const missing = responses.filter((r) => r.status === '行方不明').length;
  return { safe, missing, responded: responses.length };
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
    res.json({ session, responses, summary: summarize(responses) });
  } catch (err) {
    console.error('安否詳細取得に失敗:', err);
    res.status(500).json({ error: '安否状況の取得に失敗しました' });
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

router.post('/respond', async (req, res) => {
  const { token, status, missingNames } = req.body;
  if (!token || (status !== '全員無事' && status !== '行方不明')) {
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
    res.json({ ok: true });
  } catch (err) {
    console.error('安否回答の記録に失敗:', err);
    res.status(400).json({ error: 'このリンクは無効です' });
  }
});

module.exports = router;
