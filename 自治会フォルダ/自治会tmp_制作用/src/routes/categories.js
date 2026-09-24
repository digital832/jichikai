const express = require('express');
const sheetsClient = require('../sheetsClient');
const { incomeCategoriesInOrder, expenseGroupsInOrder } = require('../statementCategories');

const router = express.Router();

// 入出金の登録フォーム・決算書作成フォーム・科目管理画面で使う、科目（決算書の項目）マスタ一覧
router.get('/', async (req, res) => {
  try {
    const all = await sheetsClient.getCategories();
    res.json({
      all,
      income: incomeCategoriesInOrder(all),
      expenseGroups: expenseGroupsInOrder(all),
    });
  } catch (err) {
    console.error('科目一覧の取得に失敗:', err);
    res.status(500).json({ error: '科目一覧の取得に失敗しました' });
  }
});

router.post('/', async (req, res) => {
  const { name, section, group } = req.body || {};
  if (!name) return res.status(400).json({ error: '科目名が必要です' });
  if (section !== '収入' && section !== '支出') return res.status(400).json({ error: '区分（収入・支出）を指定してください' });
  try {
    await sheetsClient.addCategory({ name, section, group });
    res.json({ ok: true });
  } catch (err) {
    console.error('科目追加に失敗:', err);
    res.status(500).json({ error: '科目の追加に失敗しました' });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, section, group } = req.body || {};
  if (!name) return res.status(400).json({ error: '科目名が必要です' });
  if (section !== '収入' && section !== '支出') return res.status(400).json({ error: '区分（収入・支出）を指定してください' });
  try {
    await sheetsClient.updateCategory(id, { name, section, group });
    res.json({ ok: true });
  } catch (err) {
    console.error('科目更新に失敗:', err);
    res.status(500).json({ error: '科目の更新に失敗しました' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  try {
    await sheetsClient.deleteCategory(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('科目削除に失敗:', err);
    res.status(500).json({ error: '科目の削除に失敗しました' });
  }
});

module.exports = router;
