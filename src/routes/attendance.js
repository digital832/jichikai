const express = require('express');
const sheetsClient = require('../sheetsClient');
const attendanceToken = require('../attendanceToken');

const router = express.Router();

function summarize(responses) {
  const attending = responses.filter((r) => r.status === '参加').length;
  const notAttending = responses.filter((r) => r.status === '不参加').length;
  return { attending, notAttending, responded: responses.length };
}

function isOngoing(session) {
  if (!session.eventDate) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(session.eventDate);
  return eventDate >= today;
}

// 管理画面用：セッション一覧＋集計（現在開催前のものと、過去分）
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await sheetsClient.getAttendanceSessions();
    const allResponses = await sheetsClient.getAttendanceResponses();
    const enriched = sessions
      .map((s) => ({
        ...s,
        ...summarize(allResponses.filter((r) => r.sessionId === s.id)),
        ongoing: isOngoing(s),
      }))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    res.json({
      ongoing: enriched.filter((s) => s.ongoing),
      past: enriched.filter((s) => !s.ongoing),
    });
  } catch (err) {
    console.error('出欠セッション取得に失敗:', err);
    res.status(500).json({ error: '出欠状況の取得に失敗しました' });
  }
});

router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await sheetsClient.getAttendanceSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'セッションが見つかりません' });
    const responses = await sheetsClient.getAttendanceResponses(req.params.id);
    res.json({ session, responses, summary: summarize(responses) });
  } catch (err) {
    console.error('出欠詳細取得に失敗:', err);
    res.status(500).json({ error: '出欠状況の取得に失敗しました' });
  }
});

// 会員向け：トークンからイベント情報を取得（回答フォーム表示用）
router.get('/respond/:token', async (req, res) => {
  try {
    const { sessionId } = attendanceToken.decode(req.params.token);
    const session = await sheetsClient.getAttendanceSession(sessionId);
    if (!session) return res.status(404).json({ error: 'このリンクは無効です' });
    res.json({ eventName: session.eventName, eventDate: session.eventDate });
  } catch (err) {
    res.status(400).json({ error: 'このリンクは無効です' });
  }
});

// 会員向け：出欠回答の送信
router.post('/respond', async (req, res) => {
  const { token, status } = req.body;
  if (!token || (status !== '参加' && status !== '不参加')) {
    return res.status(400).json({ error: '不正なリクエストです' });
  }
  try {
    const { sessionId, lineUserId } = attendanceToken.decode(token);
    const session = await sheetsClient.getAttendanceSession(sessionId);
    if (!session) return res.status(404).json({ error: 'このリンクは無効です' });

    const members = await sheetsClient.getAllMembers();
    const member = members.find((m) => m.lineUserId === lineUserId);
    await sheetsClient.recordAttendanceResponse({
      sessionId,
      lineUserId,
      realName: member ? member.realName : '',
      status,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('出欠回答の記録に失敗:', err);
    res.status(400).json({ error: 'このリンクは無効です' });
  }
});

module.exports = router;
