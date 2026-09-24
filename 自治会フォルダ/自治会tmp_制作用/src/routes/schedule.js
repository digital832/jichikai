const express = require('express');
const sheetsClient = require('../sheetsClient');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const schedules = await sheetsClient.getSchedules();
    res.json({ schedules });
  } catch (err) {
    console.error('予約配信の取得に失敗:', err);
    res.status(500).json({ error: '予約配信の取得に失敗しました' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const schedule = await sheetsClient.getSchedule(req.params.id);
    if (!schedule) return res.status(404).json({ error: '予約が見つかりません' });
    res.json({ schedule });
  } catch (err) {
    console.error('予約配信の取得に失敗:', err);
    res.status(500).json({ error: '予約配信の取得に失敗しました' });
  }
});

router.post('/', async (req, res) => {
  const fields = req.body || {};
  if (!fields.sendDate || !fields.sendTime) {
    return res.status(400).json({ error: '配信日時を指定してください' });
  }
  try {
    await sheetsClient.addSchedule(fields);
    res.json({ ok: true });
  } catch (err) {
    console.error('予約配信の登録に失敗:', err);
    res.status(500).json({ error: '予約配信の登録に失敗しました' });
  }
});

router.put('/:id', async (req, res) => {
  const fields = req.body || {};
  if (!fields.sendDate || !fields.sendTime) {
    return res.status(400).json({ error: '配信日時を指定してください' });
  }
  try {
    const existing = await sheetsClient.getSchedule(req.params.id);
    if (!existing) return res.status(404).json({ error: '予約が見つかりません' });
    // 配信済みでも記録の訂正・使い回しのため内容は編集できる。
    // updateSchedule はステータス列(L)には触れないため、日時を変えなければ再送信されることはない。
    await sheetsClient.updateSchedule(req.params.id, fields);
    // 配信済み・失敗の予約に「未来の日時」を入れ直したら、予約中に戻して再利用できるようにする
    const sendAt = new Date(`${fields.sendDate}T${fields.sendTime}:00+09:00`);
    if (existing.status !== 'pending' && !Number.isNaN(sendAt.getTime()) && sendAt > new Date()) {
      await sheetsClient.resetScheduleToPending(req.params.id);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('予約配信の更新に失敗:', err);
    res.status(500).json({ error: '予約配信の更新に失敗しました' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await sheetsClient.deleteSchedule(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('予約配信の削除に失敗:', err);
    res.status(500).json({ error: '予約配信の削除に失敗しました' });
  }
});

module.exports = router;
