// 入出金の記録一覧の描画・削除処理。accounting.html（直近1か月・最大7件）とtransactions-archive.html（全件）の両方から使う
window.TransactionList = (function () {
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function formatYen(n) {
    return '¥' + Number(n || 0).toLocaleString('ja-JP');
  }

  async function fetchAll() {
    const res = await fetch('/api/transactions');
    if (!res.ok) throw new Error('取得に失敗しました');
    return res.json();
  }

  // "YYYY/MM/DD" 形式の日付文字列をDateに変換する
  function parseSlashDate(str) {
    const m = String(str || '').trim().match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  // 「その時点の残高」は記録日（登録日時ではなく）の古い順に積み上げて計算する。
  // 期首残高のように後から過去の日付で記録を追加するケースがあるため、登録順ではなく実際の日付順で並べる必要がある。
  // 同じ日付の記録どうしは登録日時の古い順で並べる。
  function computeBalanceAfterMap(transactions) {
    const chronological = [...transactions].sort((a, b) => {
      const da = parseSlashDate(a.date);
      const db = parseSlashDate(b.date);
      if (da && db && da.getTime() !== db.getTime()) return da - db;
      return a.createdAt < b.createdAt ? -1 : 1;
    });
    let running = 0;
    const map = {};
    chronological.forEach((t) => {
      running += t.type === '入金' ? t.amount : -t.amount;
      map[t.row] = running;
    });
    return map;
  }

  function renderItems(container, transactions, balanceAfterByRow, { editHref, onDeleted } = {}) {
    if (transactions.length === 0) {
      container.innerHTML = '<p class="event-list-empty">まだ記録がありません</p>';
      return;
    }
    container.innerHTML = '';
    transactions.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'transaction-row';
      const sign = t.type === '入金' ? '+' : '-';
      const typeClass = t.type === '入金' ? 'income' : 'expense';
      row.innerHTML = `
        <div class="transaction-info">
          <span class="transaction-desc"></span>
          <span class="transaction-date"></span>
        </div>
        <div class="transaction-info" style="text-align:right;">
          <span class="transaction-amount ${typeClass}"></span>
          <span class="transaction-date balance-after"></span>
        </div>
        <div class="transaction-actions">
          <a class="transaction-edit" href="${escapeHtml(editHref(t))}">編集</a>
          <button type="button" class="transaction-delete">削除</button>
        </div>
      `;
      row.querySelector('.transaction-desc').textContent = t.description || t.category || t.type;
      row.querySelectorAll('.transaction-date')[0].textContent = t.date;
      row.querySelector('.transaction-amount').textContent = `${sign}${formatYen(t.amount)}`;
      row.querySelector('.balance-after').textContent = `残高 ${formatYen(balanceAfterByRow[t.row])}`;
      row.querySelector('.transaction-delete').addEventListener('click', async () => {
        if (!window.confirm('この記録を削除しますか？')) return;
        try {
          const res = await fetch(`/api/transactions/${t.row}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('削除に失敗しました');
          if (onDeleted) onDeleted();
        } catch (err) {
          console.error(err);
          window.alert('削除に失敗しました');
        }
      });
      container.appendChild(row);
    });
  }

  return { escapeHtml, formatYen, fetchAll, computeBalanceAfterMap, renderItems };
})();
