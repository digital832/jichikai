(function () {
  const transactionListContainer = document.getElementById('transactionListContainer');
  const archiveMonthFilter = document.getElementById('archiveMonthFilter');

  let allGroups = [];
  let balanceAfterByRow = {};

  // "YYYY/MM/DD" 形式の日付文字列をDateに変換する
  function parseSlashDate(str) {
    const m = String(str || '').trim().match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function monthKey(t) {
    const d = parseSlashDate(t.date);
    if (!d) return '不明';
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthLabel(key) {
    if (key === '不明') return '日付不明';
    const [y, m] = key.split('/');
    return `${y}年${Number(m)}月`;
  }

  // 月ごとにグループ化して表示するため、日付の新しい順に並べ替える（日付が同じなら登録の新しい順）
  function sortByDateDesc(transactions) {
    return [...transactions].sort((a, b) => {
      const da = parseSlashDate(a.date);
      const db = parseSlashDate(b.date);
      if (da && db && da.getTime() !== db.getTime()) return db - da;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }

  function buildGroups(transactions) {
    const groups = [];
    const groupByKey = {};
    sortByDateDesc(transactions).forEach((t) => {
      const key = monthKey(t);
      if (!groupByKey[key]) {
        groupByKey[key] = { key, items: [] };
        groups.push(groupByKey[key]);
      }
      groupByKey[key].items.push(t);
    });
    return groups;
  }

  function renderGroup(group) {
    const income = group.items.filter((t) => t.type === '入金').reduce((sum, t) => sum + t.amount, 0);
    const expense = group.items.filter((t) => t.type === '出金').reduce((sum, t) => sum + t.amount, 0);

    const section = document.createElement('div');
    section.className = 'archive-month-group';
    section.innerHTML = `
      <div class="archive-month-heading">
        <span class="archive-month-title">${monthLabel(group.key)}</span>
        <span class="archive-month-summary">収入 ${TransactionList.formatYen(income)} ／ 支出 ${TransactionList.formatYen(expense)}</span>
      </div>
      <div class="archive-month-list"></div>
    `;
    transactionListContainer.appendChild(section);
    TransactionList.renderItems(section.querySelector('.archive-month-list'), group.items, balanceAfterByRow, {
      editHref: (t) => `transaction-edit.html?row=${t.row}`,
      onDeleted: loadAll,
    });
  }

  function renderForFilter() {
    const selected = archiveMonthFilter.value;
    transactionListContainer.innerHTML = '';
    const groups = selected === 'all' ? allGroups : allGroups.filter((g) => g.key === selected);
    if (groups.length === 0) {
      transactionListContainer.innerHTML = '<p class="event-list-empty">まだ記録がありません</p>';
      return;
    }
    groups.forEach(renderGroup);
  }

  function populateFilterOptions() {
    const previousValue = archiveMonthFilter.value || 'all';
    archiveMonthFilter.innerHTML = '<option value="all">全て</option>'
      + allGroups.map((g) => `<option value="${g.key}">${monthLabel(g.key)}</option>`).join('');
    archiveMonthFilter.value = allGroups.some((g) => g.key === previousValue) ? previousValue : 'all';
  }

  async function loadAll() {
    transactionListContainer.innerHTML = '読み込み中...';
    try {
      const data = await TransactionList.fetchAll();
      document.getElementById('overallBalance').textContent = TransactionList.formatYen(data.balance);
      document.getElementById('overallIncome').textContent = TransactionList.formatYen(data.totalIncome);
      document.getElementById('overallExpense').textContent = TransactionList.formatYen(data.totalExpense);

      balanceAfterByRow = TransactionList.computeBalanceAfterMap(data.transactions);
      allGroups = buildGroups(data.transactions);
      populateFilterOptions();
      renderForFilter();
    } catch (err) {
      console.error(err);
      transactionListContainer.innerHTML = '<p class="event-list-empty">記録の取得に失敗しました</p>';
    }
  }

  archiveMonthFilter.addEventListener('change', renderForFilter);

  loadAll();
})();
