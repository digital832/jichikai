const express = require('express');
const auth = require('../auth');
const passcodeStore = require('../adminPasscodeStore');
const sheetsClient = require('../sheetsClient');
const lineClient = require('../lineClient');
const crypto = require('crypto');
const memberRestoreToken = require('../memberRestoreToken');
const { checkHandoverDeadlines, LIMIT_MS } = require('../handoverWatcher');

function isHandoverExpired(request) {
  const sentAt = request.createdAt ? new Date(request.createdAt).getTime() : NaN;
  return Number.isNaN(sentAt) ? false : Date.now() - sentAt >= LIMIT_MS;
}

const router = express.Router();

router.post('/login', async (req, res) => {
  const { code } = req.body || {};
  if (typeof code !== 'string') {
    return res.status(401).json({ error: '番号が違います' });
  }
  const chairmanCode = passcodeStore.get();
  if (chairmanCode && code === chairmanCode) {
    checkHandoverDeadlines(false);
    auth.issueCookie(res);
    sheetsClient.appendLoginLog('自治会長').catch((err) => console.error('ログイン履歴の記録に失敗:', err));
    return res.json({ ok: true });
  }
  if (passcodeStore.isOldValid(code)) {
    checkHandoverDeadlines(false);
    auth.issueCookie(res);
    sheetsClient.appendLoginLog('旧自治会長').catch((err) => console.error('ログイン履歴の記録に失敗:', err));
    return res.json({ ok: true });
  }
  if (!chairmanCode) {
    return res.status(400).json({ error: 'ログイン機能が設定されていません' });
  }
  return res.status(401).json({ error: '番号が違います' });
});

router.get('/login-log', async (req, res) => {
  if (!auth.isLoggedIn(req)) return res.status(401).json({ error: 'ログインが必要です' });
  try {
    const log = await sheetsClient.getRecentLoginLog(10);
    res.json({ log });
  } catch (err) {
    console.error('ログイン履歴の取得に失敗:', err);
    res.status(500).json({ error: '取得に失敗しました' });
  }
});

router.post('/logout', (req, res) => {
  auth.clearCookie(res);
  res.json({ ok: true });
});

// ログイン済みの管理者がログイン番号を変更する
// 注: このルーターは/api/authが公開エンドポイント(login)を持つため auth.requireAuth より前で
// マウントされている。そのためここで自前にログイン状態をチェックする。
router.post('/passcode', async (req, res) => {
  if (!auth.isLoggedIn(req)) {
    return res.status(401).json({ error: 'ログインが必要です' });
  }
  const { currentCode, newCode } = req.body || {};
  const existingCode = passcodeStore.get();
  // 番号が未設定（初回設定）の場合だけ、現在の番号確認をスキップする
  if (existingCode && currentCode !== existingCode) {
    return res.status(401).json({ error: '現在の番号が正しくありません' });
  }
  if (typeof newCode !== 'string' || !/^\d{6}$/.test(newCode)) {
    return res.status(400).json({ error: '6桁の数字で入力してください' });
  }
  try {
    await passcodeStore.set(newCode);
    res.json({ ok: true });
  } catch (err) {
    console.error('ログイン番号の変更に失敗:', err);
    res.status(500).json({ error: '変更に失敗しました' });
  }
});

// 引き継ぎ：相手を選んで送信すると、新自治会長のLINEに「新パスワード入力リンク」などが届く。
// 今のログイン番号は、新自治会長が新パスワードを決めたあとも、送信から30日間は使える。
router.post('/handover', async (req, res) => {
  if (!auth.isLoggedIn(req)) return res.status(401).json({ error: 'ログインが必要です' });
  const { toLineUserId } = req.body || {};
  if (!toLineUserId) return res.status(400).json({ error: '引き継ぐ相手を選んでください' });
  try {
    const members = await sheetsClient.getAllMembers();
    const toMember = members.find((m) => m.lineUserId === toLineUserId);
    if (!toMember) return res.status(400).json({ error: '引き継ぐ相手が名簿に見つかりません' });
    if (!toMember.accessToken) {
      return res.status(400).json({ error: 'この会員のLINE送信設定（アクセストークン）が見つかりません' });
    }

    const host = req.get('host');
    const toName = toMember.realName || toMember.lineName;
    const token = crypto.randomBytes(16).toString('hex');
    // 今の自治会長（役職が「自治会長」で、相手以外の人）を控えておき、あとで完了のお知らせを送る
    const oldChair = members.find((m) => m.role === '自治会長' && m.lineUserId !== toLineUserId);
    await sheetsClient.createHandoverRequest({
      token,
      fromLineUserId: oldChair ? oldChair.lineUserId : '',
      fromName: oldChair ? oldChair.realName || oldChair.lineName : '',
      toLineUserId,
      toName,
    });

    const text = [
      '【自治会システム 自治会長の引き継ぎ】',
      `${toName}様`,
      '',
      'あなたが新しい自治会長になりました。',
      '',
      '① 新しいパスワードを入力（まずここから）',
      `https://${host}/handover.html?token=${token}`,
      '',
      '② 役員任命',
      `https://${host}/admin/officers.html`,
      '',
      '③ 予約配信',
      `https://${host}/admin/schedule.html`,
      '',
      '④ 管理画面',
      `https://${host}/admin/home.html`,
    ].join('\n');
    await lineClient.sendPush(toMember.accessToken, toLineUserId, text);
    res.json({ ok: true });
  } catch (err) {
    console.error('引き継ぎの送信に失敗:', err);
    res.status(500).json({ error: '送信に失敗しました' });
  }
});

router.get('/handover-info', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: '無効なリンクです' });
  try {
    const request = await sheetsClient.getHandoverRequest(token);
    if (!request || request.used) {
      return res.status(404).json({ error: 'このリンクはすでに使われたか、無効です' });
    }
    if (isHandoverExpired(request)) {
      return res.status(404).json({ error: 'このリンクは期限（1か月）が過ぎたため使えません' });
    }
    res.json({ toName: request.toName, communityName: require('../config').communityName || '' });
  } catch (err) {
    console.error('引き継ぎ情報の取得に失敗:', err);
    res.status(500).json({ error: '取得に失敗しました' });
  }
});

router.post('/handover-complete', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || !/^\d{6}$/.test(newPassword)) {
    return res.status(400).json({ error: '6桁の数字で入力してください' });
  }
  try {
    const request = await sheetsClient.getHandoverRequest(token);
    if (!request || request.used) {
      return res.status(404).json({ error: 'このリンクはすでに使われたか、無効です' });
    }
    if (isHandoverExpired(request)) {
      return res.status(404).json({ error: 'このリンクは期限（1か月）が過ぎたため使えません' });
    }

    // これまでの番号は、引き継ぎを送った日から30日間だけ使える
    const previousCode = passcodeStore.get();
    const sentAt = request.createdAt ? new Date(request.createdAt).getTime() : Date.now();
    const expiresAt = sentAt + LIMIT_MS;
    if (previousCode && previousCode !== newPassword && expiresAt > Date.now()) {
      await passcodeStore.setOld(previousCode, expiresAt);
    }
    await passcodeStore.set(newPassword);
    await sheetsClient.markHandoverUsed(request.row);
    sheetsClient
      .appendLoginLog(`${request.toName}（自治会長引き継ぎ）`)
      .catch((err) => console.error('ログイン履歴の記録に失敗:', err));

    try {
      const members = await sheetsClient.getAllMembers();
      const toMember = members.find((m) => m.lineUserId === request.toLineUserId);
      if (toMember && toMember.accessToken) {
        const text = `【自治会システム】\n${request.toName}様\n\n新しいログイン番号を設定しました。忘れないよう控えておいてください。\n\nログイン番号: ${newPassword}`;
        await lineClient.sendPush(toMember.accessToken, request.toLineUserId, text);
      }
    } catch (err) {
      console.error('引き継ぎ完了のLINE通知に失敗:', err);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('引き継ぎの完了処理に失敗:', err);
    res.status(500).json({ error: '設定に失敗しました' });
  }
});

// 新自治会長が新パスワードと役員任命を済ませたら、旧自治会長にシンプルなお知らせを1回だけ送る
router.post('/handover-notify', async (req, res) => {
  if (!auth.isLoggedIn(req)) return res.status(401).json({ error: 'ログインが必要です' });
  try {
    const request = await sheetsClient.getPendingHandoverNotice();
    if (!request) return res.json({ ok: true, sent: false });
    const members = await sheetsClient.getAllMembers();
    const oldChair = members.find((m) => m.lineUserId === request.fromLineUserId);
    if (!oldChair || !oldChair.accessToken) {
      await sheetsClient.markHandoverNotified(request.row);
      return res.json({ ok: true, sent: false });
    }
    const expiresAt = passcodeStore.getOldExpiresAt();
    const d = expiresAt ? new Date(expiresAt + 9 * 60 * 60 * 1000) : null;
    const until = d
      ? `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日` +
        (LIMIT_MS < 24 * 60 * 60 * 1000 ? `${d.getUTCHours()}時${String(d.getUTCMinutes()).padStart(2, '0')}分` : '')
      : '';
    const lines = [
      '【自治会システム】',
      `${oldChair.realName || oldChair.lineName}様`,
      `${request.toName}さんが、新しいパスワードと役員任命を設定しました。引き継ぎは完了です。`,
      until ? `これまでのパスワードは${until}まで使えます。` : '',
      'お疲れさまでした。',
    ].filter(Boolean);
    await lineClient.sendPush(oldChair.accessToken, request.fromLineUserId, lines.join('\n'));
    await sheetsClient.markHandoverNotified(request.row);
    res.json({ ok: true, sent: true });
  } catch (err) {
    console.error('旧自治会長への通知に失敗:', err);
    res.status(500).json({ error: '通知に失敗しました' });
  }
});

// 画面のロック解除だけに使う、番号確認専用（何も変更しない）
router.post('/verify-passcode', (req, res) => {
  if (!auth.isLoggedIn(req)) return res.status(401).json({ error: 'ログインが必要です' });
  const { code } = req.body || {};
  const currentCode = passcodeStore.get();
  if (!currentCode || code !== currentCode) {
    return res.status(401).json({ error: '自治会長の番号が正しくありません' });
  }
  res.json({ ok: true });
});

// 役員ごとに別々のパスワードは作らず、今の共通ログイン番号を、選んだ人だけにLINEで共有する
router.post('/share-passcode', async (req, res) => {
  if (!auth.isLoggedIn(req)) return res.status(401).json({ error: 'ログインが必要です' });
  const { lineUserIds, chairmanCode } = req.body || {};
  if (!Array.isArray(lineUserIds) || lineUserIds.length === 0) {
    return res.status(400).json({ error: '共有する相手を選んでください' });
  }
  const currentCode = passcodeStore.get();
  if (!currentCode || chairmanCode !== currentCode) {
    return res.status(401).json({ error: '自治会長の番号が正しくありません' });
  }
  try {
    const members = await sheetsClient.getAllMembers();
    const results = [];
    for (const lineUserId of lineUserIds) {
      const member = members.find((m) => m.lineUserId === lineUserId);
      const name = member ? member.realName || member.lineName : lineUserId;
      if (!member || !member.accessToken) {
        results.push({ lineUserId, name, ok: false, error: 'LINE送信設定が見つかりません' });
        continue;
      }
      try {
        const text = `【自治会システム 管理画面ログイン番号】\n${name}様\n\nログイン番号: ${currentCode}\n\nこの番号で管理画面にログインできます。共有された大事な番号です。絶対に他の人には教えないでください。`;
        await lineClient.sendPush(member.accessToken, lineUserId, text);
        results.push({ lineUserId, name, ok: true });
      } catch (err) {
        console.error('パスワード共有のLINE送信に失敗:', err.message);
        results.push({ lineUserId, name, ok: false, error: 'LINE送信に失敗しました' });
      }
    }
    res.json({ ok: true, results });
  } catch (err) {
    console.error('パスワード共有に失敗:', err);
    res.status(500).json({ error: '共有に失敗しました' });
  }
});

router.get('/member-restore-info', async (req, res) => {
  const data = memberRestoreToken.verify(req.query.t);
  if (!data) return res.status(400).json({ error: 'このリンクは無効か、期限（30日）が過ぎています' });
  try {
    const member = await sheetsClient.getMemberIncludingDeleted(data.row);
    if (!member || member.lineUserId !== data.lineUserId) return res.status(404).json({ error: '対象の会員が見つかりません' });
    res.json({ name: member.realName || member.lineName || '（名前なし）', deleted: member.deleted });
  } catch (err) {
    console.error('取り消し情報の取得に失敗:', err);
    res.status(500).json({ error: '取得に失敗しました' });
  }
});

// ボタンを押した時だけ実行する（LINEのリンクプレビューで勝手に復活しないように、GETでは何も変えない）
router.post('/member-restore', async (req, res) => {
  const data = memberRestoreToken.verify((req.body || {}).t);
  if (!data) return res.status(400).json({ error: 'このリンクは無効か、期限（30日）が過ぎています' });
  try {
    const member = await sheetsClient.getMemberIncludingDeleted(data.row);
    if (!member || member.lineUserId !== data.lineUserId) return res.status(404).json({ error: '対象の会員が見つかりません' });
    if (member.deleted) await sheetsClient.restoreMember(data.row);
    res.json({ ok: true, name: member.realName || member.lineName || '（名前なし）' });
  } catch (err) {
    console.error('削除の取り消しに失敗:', err);
    res.status(500).json({ error: '取り消しに失敗しました' });
  }
});

module.exports = router;
