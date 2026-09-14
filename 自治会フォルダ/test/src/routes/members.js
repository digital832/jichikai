const express = require('express');
const sheetsClient = require('../sheetsClient');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const members = await sheetsClient.getAllMembers();
    res.json({ members });
  } catch (err) {
    console.error('名簿取得に失敗:', err);
    res.status(500).json({ error: '名簿の取得に失敗しました' });
  }
});

router.put('/:row/role', async (req, res) => {
  const row = Number(req.params.row);
  const { role } = req.body;
  try {
    await sheetsClient.updateMemberRole(row, role || '');
    res.json({ ok: true });
  } catch (err) {
    console.error('役職の更新に失敗:', err);
    res.status(500).json({ error: '役職の更新に失敗しました' });
  }
});

router.put('/:row/realName', async (req, res) => {
  const row = Number(req.params.row);
  const { realName } = req.body;
  if (!realName || !realName.trim()) return res.status(400).json({ error: '本名を入力してください' });
  try {
    await sheetsClient.updateMemberRealName(row, realName.trim());
    res.json({ ok: true });
  } catch (err) {
    console.error('本名の更新に失敗:', err);
    res.status(500).json({ error: '本名の更新に失敗しました' });
  }
});

module.exports = router;
