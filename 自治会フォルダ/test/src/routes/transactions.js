const express = require('express');
const sheetsClient = require('../sheetsClient');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const transactions = await sheetsClient.getTransactions();
    const totalIncome = transactions.filter((t) => t.type === '入金').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter((t) => t.type === '出金').reduce((sum, t) => sum + t.amount, 0);
    res.json({
      transactions,
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
    });
  } catch (err) {
    console.error('入出金の取得に失敗:', err);
    res.status(500).json({ error: '入出金の取得に失敗しました' });
  }
});

router.post('/', async (req, res) => {
  const { date, type, amount, description } = req.body;
  if (!date || (type !== '入金' && type !== '出金') || !amount) {
    return res.status(400).json({ error: '日付・種別・金額は必須です' });
  }
  try {
    await sheetsClient.addTransaction({ date, type, amount: Number(amount), description: description || '' });
    res.json({ ok: true });
  } catch (err) {
    console.error('入出金の登録に失敗:', err);
    res.status(500).json({ error: '入出金の登録に失敗しました' });
  }
});

router.delete('/:row', async (req, res) => {
  try {
    await sheetsClient.deleteTransaction(Number(req.params.row));
    res.json({ ok: true });
  } catch (err) {
    console.error('入出金の削除に失敗:', err);
    res.status(500).json({ error: '入出金の削除に失敗しました' });
  }
});

module.exports = router;
