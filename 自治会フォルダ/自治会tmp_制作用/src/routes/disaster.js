const express = require('express');
const sheetsClient = require('../sheetsClient');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const entries = await sheetsClient.getDisasterEntries();
    const base = entries.find((e) => e.type === '拠点') || null;
    const shelters = entries.filter((e) => e.type === '避難所');
    res.json({ base, shelters });
  } catch (err) {
    console.error('防災設定の取得に失敗:', err);
    res.status(500).json({ error: '防災設定の取得に失敗しました' });
  }
});

router.put('/base', async (req, res) => {
  const { name, address, lat, lng } = req.body;
  if (!address || !lat || !lng) {
    return res.status(400).json({ error: '住所と地図上の位置は必須です' });
  }
  try {
    await sheetsClient.setBaseEntry({ name: name || '', address, lat: Number(lat), lng: Number(lng) });
    res.json({ ok: true });
  } catch (err) {
    console.error('拠点の登録に失敗:', err);
    res.status(500).json({ error: '拠点の登録に失敗しました' });
  }
});

router.post('/shelters', async (req, res) => {
  const { name, address, lat, lng } = req.body;
  if (!name || !address || !lat || !lng) {
    return res.status(400).json({ error: '名称・住所・地図上の位置は必須です' });
  }
  try {
    await sheetsClient.addShelter({ name, address, lat: Number(lat), lng: Number(lng) });
    res.json({ ok: true });
  } catch (err) {
    console.error('避難所の登録に失敗:', err);
    res.status(500).json({ error: '避難所の登録に失敗しました' });
  }
});

router.put('/shelters/:row', async (req, res) => {
  const { name, address, lat, lng } = req.body;
  if (!name || !address || !lat || !lng) {
    return res.status(400).json({ error: '名称・住所・地図上の位置は必須です' });
  }
  try {
    await sheetsClient.updateShelter(Number(req.params.row), { name, address, lat: Number(lat), lng: Number(lng) });
    res.json({ ok: true });
  } catch (err) {
    console.error('避難所の更新に失敗:', err);
    res.status(500).json({ error: '避難所の更新に失敗しました' });
  }
});

router.delete('/shelters/:row', async (req, res) => {
  try {
    await sheetsClient.deleteShelter(Number(req.params.row));
    res.json({ ok: true });
  } catch (err) {
    console.error('避難所の削除に失敗:', err);
    res.status(500).json({ error: '避難所の削除に失敗しました' });
  }
});

module.exports = router;
