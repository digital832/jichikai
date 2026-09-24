const express = require('express');

const router = express.Router();

// 班シート→名簿タブの反映は普段10分おきの自動実行に任せているが、
// 「今すぐ反映してほしい」時のために、共有GASプロジェクトのWebアプリを手動で叩く抜け道。
// 全自治会分まとめて実行されるので、このボタンはどの自治会の管理画面から押しても同じ結果になる。
const SYNC_WEBAPP_URL =
  'https://script.google.com/macros/s/AKfycbyeSCYKF9WxD31WKHZDWAkS2LNnaWoj7MaRsghjOaGl2Rp08bzgqUmOqWSMmYEzxLykeA/exec';

router.post('/', async (req, res) => {
  try {
    const response = await fetch(`${SYNC_WEBAPP_URL}?action=syncNow`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || '同期スクリプト側でエラーが発生しました');
    res.json(data);
  } catch (err) {
    console.error('班シート同期に失敗:', err);
    res.status(500).json({ error: '同期に失敗しました。時間をおいて再度お試しください' });
  }
});

module.exports = router;
