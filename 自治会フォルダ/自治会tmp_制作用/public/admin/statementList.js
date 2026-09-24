// 決算書一覧の描画・開く/編集/削除/送信の処理。accounting.html（直近5件）とaccounting-archive.html（全件）の両方から使う
window.StatementList = (function () {
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function formatPeriod(item) {
    return `${item.periodStart}〜${item.periodEnd}`;
  }

  // 送信ボタンで使う「対象グループ」の選択肢（配信ウィザードと同じ一覧）
  let groupOptionsHtml = '';
  let groupOptionsReady = null;
  function loadGroupOptions() {
    if (!groupOptionsReady) {
      groupOptionsReady = fetch('/api/groups')
        .then((res) => res.json())
        .then((data) => {
          const names = [...(data.fixedGroups || []), ...(data.roleGroups || []), ...(data.dynamicGroups || [])];
          groupOptionsHtml = names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
        })
        .catch((err) => console.error(err));
    }
    return groupOptionsReady;
  }

  function renderItems(container, items) {
    if (!items.length) {
      container.innerHTML = '<p class="statement-empty">まだ決算書はありません</p>';
      return;
    }
    container.innerHTML = items.map((item) => `
      <div class="statement-item" data-id="${item.id}">
        <div class="statement-item-info">
          <div class="statement-item-title">${escapeHtml(item.yearLabel)}</div>
          <div class="statement-item-period">${escapeHtml(formatPeriod(item))}</div>
        </div>
        <div class="statement-item-actions">
          <a class="statement-open-button" href="${escapeHtml(item.driveUrl)}" target="_blank" rel="noopener">開く</a>
          <a class="statement-edit-button" href="statement.html?editId=${item.id}">編集</a>
          <button class="statement-delete-button" type="button" data-delete-id="${item.id}">削除</button>
          <button class="statement-send-button" type="button" data-send-id="${item.id}">送信</button>
          <div class="statement-send-panel" data-send-panel-id="${item.id}">
            <select class="select-input"></select>
            <button class="send-button" type="button" data-send-confirm-id="${item.id}" data-title="${escapeHtml(item.yearLabel)} 収支決算書" data-url="${escapeHtml(item.driveUrl)}">送信する</button>
          </div>
        </div>
        <p class="statement-send-status" data-send-status-id="${item.id}" style="display:none;"></p>
      </div>
    `).join('');
  }

  function attachHandlers(container) {
    container.addEventListener('click', async (e) => {
      const deleteButton = e.target.closest('[data-delete-id]');
      if (deleteButton) {
        if (!window.confirm('この決算書を削除しますか？（Drive上のPDFファイルも削除されます）')) return;
        deleteButton.disabled = true;
        try {
          const res = await fetch(`/api/statements/${deleteButton.dataset.deleteId}`, { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || '削除に失敗しました');
          container.dispatchEvent(new CustomEvent('statement-deleted', { bubbles: true }));
        } catch (err) {
          console.error(err);
          window.alert('削除に失敗しました');
          deleteButton.disabled = false;
        }
        return;
      }

      const sendButton = e.target.closest('[data-send-id]');
      if (sendButton) {
        const panel = container.querySelector(`[data-send-panel-id="${sendButton.dataset.sendId}"]`);
        if (!panel) return;
        const opening = panel.style.display !== 'flex';
        panel.style.display = opening ? 'flex' : 'none';
        if (opening) {
          await loadGroupOptions();
          const select = panel.querySelector('select');
          if (select && !select.innerHTML) select.innerHTML = groupOptionsHtml;
        }
        return;
      }

      const confirmButton = e.target.closest('[data-send-confirm-id]');
      if (confirmButton) {
        const id = confirmButton.dataset.sendConfirmId;
        const panel = container.querySelector(`[data-send-panel-id="${id}"]`);
        const status = container.querySelector(`[data-send-status-id="${id}"]`);
        const group = panel.querySelector('select').value;
        confirmButton.disabled = true;
        status.style.display = 'block';
        status.textContent = '送信中です...';
        try {
          const res = await fetch('/api/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              group,
              eventName: `【決算書】${confirmButton.dataset.title}`,
              messageBody: `決算書ができましたのでご確認ください。\n${confirmButton.dataset.url}`,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '送信に失敗しました');
          status.textContent = `✅ 送信しました（${data.successCount || 0}件）`;
          panel.style.display = 'none';
        } catch (err) {
          console.error(err);
          status.textContent = '⚠ 送信に失敗しました';
        } finally {
          confirmButton.disabled = false;
        }
      }
    });
  }

  async function load(container, { all, showAllLinkEl } = {}) {
    container.innerHTML = '読み込み中...';
    try {
      const res = await fetch(`/api/statements${all ? '?all=1' : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '一覧の取得に失敗しました');
      renderItems(container, data.items);
      if (showAllLinkEl) showAllLinkEl.style.display = !all && data.total > data.items.length ? 'block' : 'none';
    } catch (err) {
      console.error(err);
      container.innerHTML = '<p class="statement-empty">決算書一覧の取得に失敗しました</p>';
    }
  }

  async function fetchAll() {
    const res = await fetch('/api/statements?all=1');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '一覧の取得に失敗しました');
    return data.items;
  }

  return { load, attachHandlers, renderItems, fetchAll };
})();
