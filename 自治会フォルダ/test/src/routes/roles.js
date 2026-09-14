const express = require('express');
const sheetsClient = require('../sheetsClient');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const roles = await sheetsClient.getRoles();
    res.json({ roles });
  } catch (err) {
    console.error('役職取得に失敗:', err);
    res.status(500).json({ error: '役職一覧の取得に失敗しました' });
  }
});

router.post('/', async (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: '役職名が必要です' });
  try {
    await sheetsClient.addRole(name, color);
    res.json({ ok: true });
  } catch (err) {
    console.error('役職追加に失敗:', err);
    res.status(500).json({ error: '役職の追加に失敗しました' });
  }
});

// 渡された順番（{name,color}の配列）で並び替える。/:id より先に定義しないと "reorder" がidとして誤って解釈される
router.put('/reorder', async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'orderは配列で指定してください' });
  try {
    await sheetsClient.reorderRoles(order);
    res.json({ ok: true });
  } catch (err) {
    console.error('役職の並び替えに失敗:', err);
    res.status(500).json({ error: '役職の並び替えに失敗しました' });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: '役職名が必要です' });
  try {
    await sheetsClient.updateRole(id, name, color);
    res.json({ ok: true });
  } catch (err) {
    console.error('役職更新に失敗:', err);
    res.status(500).json({ error: '役職の更新に失敗しました' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await sheetsClient.deleteRole(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('役職削除に失敗:', err);
    res.status(500).json({ error: '役職の削除に失敗しました' });
  }
});

module.exports = router;
