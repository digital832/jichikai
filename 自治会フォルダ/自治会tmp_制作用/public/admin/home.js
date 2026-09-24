(function () {
  async function init() {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('設定の取得に失敗しました');
    const settings = await res.json();
    if (settings.communityName) {
      document.getElementById('pageTitle').textContent = `🏠 ${settings.communityName}`;
    }
  }
  init().catch((err) => console.error(err));

  // 班シート→名簿の反映は普段10分おき自動だが、このボタンで今すぐ全自治会分まとめて実行する
  const syncBtn = document.getElementById('syncNowBtn');
  const syncMsg = document.getElementById('syncNowMsg');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncMsg.textContent = '更新中…';
      try {
        const res = await fetch('/api/sync-roster', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || '更新に失敗しました');
        const totals = (data.result || []).reduce(
          (acc, r) => ({ added: acc.added + r.added, updated: acc.updated + r.updated }),
          { added: 0, updated: 0 }
        );
        syncMsg.textContent = `更新しました（全自治会合計：新規${totals.added}件・更新${totals.updated}件）`;
      } catch (err) {
        console.error(err);
        syncMsg.textContent = '更新に失敗しました。時間をおいて再度お試しください';
      } finally {
        syncBtn.disabled = false;
      }
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const loginLogList = document.getElementById('loginLogList');

  async function loadLoginLog() {
    const list = loginLogList;
    if (!list) return;
    try {
      const res = await fetch('/api/auth/login-log');
      const data = await res.json();
      const log = data.log || [];
      if (log.length === 0) {
        list.innerHTML = '<p class="event-list-empty">まだログインの記録がありません</p>';
        return;
      }
      list.innerHTML = log
        .map((l) => {
          const d = l.at ? new Date(l.at) : null;
          const timeText =
            d && !isNaN(d)
              ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
              : '';
          return `<div class="login-log-row"><span>👤</span><span class="login-log-name">${escapeHtml(l.name)}</span><span class="login-log-time">${timeText}</span></div>`;
        })
        .join('');
    } catch (err) {
      console.error(err);
    }
  }
  const loginLogLockedArea = document.getElementById('loginLogLockedArea');
  const loginLogUnlockCode = document.getElementById('loginLogUnlockCode');
  const loginLogUnlockMessage = document.getElementById('loginLogUnlockMessage');
  const loginLogUnlockButton = document.getElementById('loginLogUnlockButton');

  function onlyDigits(input) {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 6);
    });
  }

  if (loginLogUnlockButton) {
    onlyDigits(loginLogUnlockCode);
    function showLoginLogUnlockMessage(text, type) {
      loginLogUnlockMessage.textContent = text;
      loginLogUnlockMessage.className = `password-message ${type || ''}`;
    }
    loginLogUnlockButton.addEventListener('click', async () => {
      const code = loginLogUnlockCode.value;
      if (code.length !== 6) {
        showLoginLogUnlockMessage('自治会長の現在の番号を入力してください', 'error');
        return;
      }
      loginLogUnlockButton.disabled = true;
      try {
        const res = await fetch('/api/auth/verify-passcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '番号が正しくありません');
        await loadLoginLog();
        loginLogLockedArea.hidden = true;
        loginLogList.hidden = false;
      } catch (err) {
        showLoginLogUnlockMessage(err.message || '番号が正しくありません', 'error');
      } finally {
        loginLogUnlockButton.disabled = false;
      }
    });
  }

})();
