const express = require('express');
const { sendBroadcast } = require('../broadcastSender');
const { buildAnnouncementDocx } = require('../docxBuilder');

const router = express.Router();

router.post('/', async (req, res) => {
  const fields = req.body || {};
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const result = await sendBroadcast(fields, baseUrl);
    res.json({ ok: true, ...result });
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
