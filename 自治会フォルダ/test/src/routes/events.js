const express = require('express');
const sheetsClient = require('../sheetsClient');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const events = await sheetsClient.getEvents();
    res.json({ events });
  } catch (err) {
    console.error('イベント取得に失敗:', err);
    res.status(500).json({ error: 'イベントの取得に失敗しました' });
  }
});

router.post('/', async (req, res) => {
  const { name, place, timeStart, timeEnd, belongings } = req.body;
  if (!name) return res.status(400).json({ error: 'イベント名が必要です' });
  try {
    await sheetsClient.addEvent({ name, place, timeStart, timeEnd, belongings });
    res.json({ ok: true });
  } catch (err) {
    console.error('イベント追加に失敗:', err);
    res.status(500).json({ error: 'イベントの追加に失敗しました' });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, place, timeStart, timeEnd, belongings } = req.body;
  if (!name) return res.status(400).json({ error: 'イベント名が必要です' });
  try {
    await sheetsClient.updateEvent(id, { name, place, timeStart, timeEnd, belongings });
    res.json({ ok: true });
  } catch (err) {
    console.error('イベント更新に失敗:', err);
    res.status(500).json({ error: 'イベントの更新に失敗しました' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await sheetsClient.deleteEvent(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('イベント削除に失敗:', err);
    res.status(500).json({ error: 'イベントの削除に失敗しました' });
  }
});

module.exports = router;
