const express = require('express');
const sheetsClient = require('../sheetsClient');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const templates = await sheetsClient.getTemplates();
    res.json({ templates });
  } catch (err) {
    console.error('定型文取得に失敗:', err);
    res.status(500).json({ error: '定型文の取得に失敗しました' });
  }
});

router.post('/', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '定型文の内容が必要です' });
  try {
    await sheetsClient.addTemplate(text);
    res.json({ ok: true });
  } catch (err) {
    console.error('定型文追加に失敗:', err);
    res.status(500).json({ error: '定型文の追加に失敗しました' });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '定型文の内容が必要です' });
  try {
    await sheetsClient.updateTemplate(id, text);
    res.json({ ok: true });
  } catch (err) {
    console.error('定型文更新に失敗:', err);
    res.status(500).json({ error: '定型文の更新に失敗しました' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await sheetsClient.deleteTemplate(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('定型文削除に失敗:', err);
    res.status(500).json({ error: '定型文の削除に失敗しました' });
  }
});

module.exports = router;
