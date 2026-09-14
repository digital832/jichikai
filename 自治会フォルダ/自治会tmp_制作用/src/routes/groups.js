const express = require('express');
const config = require('../config');
const sheetsClient = require('../sheetsClient');
const driveClient = require('../driveClient');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [dynamicGroups, roles] = await Promise.all([
      sheetsClient.getGroupMasterList(),
      sheetsClient.getRoles(),
    ]);
    res.json({
      fixedGroups: config.fixedGroups,
      roleGroups: roles.map((r) => r.name),
      dynamicGroups,
    });
  } catch (err) {
    console.error('グループ取得に失敗:', err);
    res.status(500).json({ error: 'グループ一覧の取得に失敗しました' });
  }
});

// 管理地区フォルダを再スキャンして、グループマスタタブを最新の班名一覧に更新する
router.post('/sync', async (req, res) => {
  try {
    const bookNames = await driveClient.listDistrictBookNames();
    await sheetsClient.replaceGroupMasterList(bookNames);
    res.json({ ok: true, dynamicGroups: bookNames });
  } catch (err) {
    console.error('グループ同期に失敗:', err);
    res.status(500).json({ error: 'グループ一覧の同期に失敗しました' });
  }
});

module.exports = router;
