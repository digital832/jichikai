const express = require('express');
const { listQrCodeCategories, getQrCodeFile } = require('../driveClient');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { originals, flyers } = await listQrCodeCategories();
    const toDto = (f) => ({ id: f.id, name: f.name, friendUrl: f.description || '' });
    res.json({ originals: originals.map(toDto), flyers: flyers.map(toDto) });
  } catch (err) {
    console.error('QRコード一覧の取得に失敗:', err);
    res.status(500).json({ error: 'QRコードの取得に失敗しました' });
  }
});

router.get('/:fileId', async (req, res) => {
  try {
    const file = await getQrCodeFile(req.params.fileId);
    if (!file) return res.status(404).json({ error: 'QRコードが見つかりません' });
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
    res.send(file.buffer);
  } catch (err) {
    console.error('QRコードの取得に失敗:', err);
    res.status(500).json({ error: 'QRコードの取得に失敗しました' });
  }
});

module.exports = router;
