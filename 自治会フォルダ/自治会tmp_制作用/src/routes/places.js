const express = require('express');
const sheetsClient = require('../sheetsClient');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const places = await sheetsClient.getPlaces();
    res.json({ places });
  } catch (err) {
    console.error('場所取得に失敗:', err);
    res.status(500).json({ error: '場所の取得に失敗しました' });
  }
});

router.post('/', async (req, res) => {
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: '場所の名前が必要です' });
  try {
    await sheetsClient.addPlace(name, address);
    res.json({ ok: true });
  } catch (err) {
    console.error('場所追加に失敗:', err);
    res.status(500).json({ error: '場所の追加に失敗しました' });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, address } = req.body;
  if (!name) return res.status(400).json({ error: '場所の名前が必要です' });
  try {
    await sheetsClient.updatePlace(id, name, address);
    res.json({ ok: true });
  } catch (err) {
    console.error('場所更新に失敗:', err);
    res.status(500).json({ error: '場所の更新に失敗しました' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await sheetsClient.deletePlace(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('場所削除に失敗:', err);
    res.status(500).json({ error: '場所の削除に失敗しました' });
  }
});

module.exports = router;
