const express = require('express');
const sheetsClient = require('../sheetsClient');
const lineClient = require('../lineClient');
const passcodeStore = require('../adminPasscodeStore');
const memberRestoreToken = require('../memberRestoreToken');

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

router.post('/:row/message', async (req, res) => {
  const row = Number(req.params.row);
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'メッセージを入力してください' });
  try {
    const members = await sheetsClient.getAllMembers();
    const member = members.find((m) => m.row === row);
    if (!member) return res.status(404).json({ error: '対象の会員が名簿に見つかりません' });
    if (!member.accessToken) {
      return res.status(400).json({ error: 'この会員のLINE送信設定（アクセストークン）が見つかりません' });
    }
    await lineClient.sendPush(member.accessToken, member.lineUserId, text.trim());
    res.json({ ok: true });
  } catch (err) {
    console.error('個別LINEメッセージの送信に失敗:', err);
    res.status(500).json({ error: 'LINEメッセージの送信に失敗しました' });
  }
});

router.delete('/:row', async (req, res) => {
  const row = Number(req.params.row);
  const { chairmanCode } = req.body || {};
  const currentCode = passcodeStore.get();
  if (!currentCode || !passcodeStore.isValid(chairmanCode)) {
    return res.status(401).json({ error: '自治会長のパスワードが正しくありません' });
  }
  try {
    const members = await sheetsClient.getAllMembers();
    const target = members.find((m) => m.row === row);
    if (!target) {
      return res.status(404).json({ error: '対象の会員が名簿に見つかりません' });
    }
    await sheetsClient.deleteMember(row);

    // 自治会長に「削除しました」の確認LINEを送る（間違いなら、そこから取り消せる）
    let notified = false;
    try {
      const chair = members.find((m) => m.role === '自治会長' && m.accessToken);
      if (chair) {
        const name = target.realName || target.lineName || '（名前なし）';
        const link = `https://${req.get('host')}/member-restore.html?t=${encodeURIComponent(memberRestoreToken.create(row, target.lineUserId))}`;
        const text = [
          '【自治会システム】',
          `${chair.realName || chair.lineName}様`,
          `名簿から「${name}」さんを削除しました。`,
          '',
          '間違いの場合は、こちらから取り消せます（30日以内）。',
          link,
        ].join('\n');
        await lineClient.sendPush(chair.accessToken, chair.lineUserId, text);
        notified = true;
      }
    } catch (err) {
      console.error('削除の確認LINEの送信に失敗:', err.message);
    }
    res.json({ ok: true, notified });
  } catch (err) {
    console.error('名簿の削除に失敗:', err);
    res.status(500).json({ error: '削除に失敗しました' });
  }
});

module.exports = router;
