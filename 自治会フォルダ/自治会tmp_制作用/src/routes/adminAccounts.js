const express = require('express');
const sheetsClient = require('../sheetsClient');
const lineClient = require('../lineClient');
const passcodeStore = require('../adminPasscodeStore');
const { hashPassword } = require('../passwordHash');

const router = express.Router();

// 役職を持つ会員の一覧（役員パスワード設定のドロップダウン用）
router.get('/eligible-members', async (req, res) => {
  try {
    const members = await sheetsClient.getAllMembers();
    const eligible = members
      .filter((m) => m.role && m.role !== '一般会員')
      .map((m) => ({ lineUserId: m.lineUserId, name: m.realName || m.lineName, role: m.role }));
    res.json({ members: eligible });
  } catch (err) {
    console.error('役員一覧の取得に失敗:', err);
    res.status(500).json({ error: '一覧の取得に失敗しました' });
  }
});

// 選んだ役員に6桁の番号を設定し、LINEで本人に送る（ログインIDは作らない）
router.post('/', async (req, res) => {
  const { lineUserId, password, chairmanCode } = req.body || {};
  if (!lineUserId) return res.status(400).json({ error: '役員を選んでください' });
  if (typeof password !== 'string' || !/^\d{6}$/.test(password)) {
    return res.status(400).json({ error: '6桁の数字で入力してください' });
  }
  const currentChairmanCode = passcodeStore.get();
  if (!currentChairmanCode || chairmanCode !== currentChairmanCode) {
    return res.status(401).json({ error: '自治会長の番号が正しくありません' });
  }
  try {
    const members = await sheetsClient.getAllMembers();
    const member = members.find((m) => m.lineUserId === lineUserId);
    if (!member) return res.status(400).json({ error: '対象の会員が名簿に見つかりません' });
    if (!member.role || member.role === '一般会員') {
      return res.status(400).json({ error: '一般会員はログイン番号は発行できません' });
    }

    await sheetsClient.upsertAdminAccount({
      lineUserId,
      name: member.realName || member.lineName,
      passwordHash: hashPassword(password),
      role: member.role,
    });

    let lineSent = false;
    let lineError;
    if (member.accessToken) {
      try {
        const name = member.realName || member.lineName;
        const text = `【自治会システム 管理画面ログイン情報】\n${name}様\n\nログイン番号: ${password}\n\n管理画面のログインに使います。他の人には教えないようにしてください。`;
        await lineClient.sendPush(member.accessToken, lineUserId, text);
        lineSent = true;
      } catch (err) {
        console.error('ログイン情報のLINE送信に失敗:', err.message);
        lineError = 'LINE送信に失敗しました';
      }
    } else {
      lineError = 'この会員のLINE送信設定（アクセストークン）が見つかりません';
    }

    res.json({ ok: true, lineSent, lineError });
  } catch (err) {
    console.error('役員パスワードの設定に失敗:', err);
    res.status(500).json({ error: '設定に失敗しました' });
  }
});

// 自治会長の番号を入力してからでないと一覧は見られない
router.post('/list', async (req, res) => {
  const { chairmanCode } = req.body || {};
  const currentChairmanCode = passcodeStore.get();
  if (!currentChairmanCode || chairmanCode !== currentChairmanCode) {
    return res.status(401).json({ error: '自治会長の番号が正しくありません' });
  }
  try {
    const accounts = await sheetsClient.getAdminAccounts();
    const list = accounts.map((a) => ({ lineUserId: a.lineUserId, name: a.name, role: a.role, createdAt: a.createdAt }));
    res.json({ accounts: list });
  } catch (err) {
    console.error('役員一覧の取得に失敗:', err);
    res.status(500).json({ error: '一覧の取得に失敗しました' });
  }
});

module.exports = router;
