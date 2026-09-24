(function () {
  const statementFormTitle = document.getElementById('statementFormTitle');
  const statementYearLabel = document.getElementById('statementYearLabel');
  const statementPeriodStart = document.getElementById('statementPeriodStart');
  const statementPeriodEnd = document.getElementById('statementPeriodEnd');
  const statementCarryover = document.getElementById('statementCarryover');
  const statementBudgetContainer = document.getElementById('statementBudgetContainer');
  const cancelStatementButton = document.getElementById('cancelStatementButton');
  const saveStatementButton = document.getElementById('saveStatementButton');

  let categoriesData = { income: [], expenseGroups: [] };
  let actualsData = {};
  let budgetsData = {};
  let editingStatementId = null;

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function formatYen(n) {
    return '¥' + Number(n || 0).toLocaleString('ja-JP');
  }

  // 対象期間内の実績額を科目ごとに取得する。予算額（手入力の見込み）とは別物であることが
  // 画面上でも分かるよう、入力欄の横に「実績」として表示するために使う
  async function loadActuals() {
    const periodStart = statementPeriodStart.value;
    const periodEnd = statementPeriodEnd.value;
    if (!periodStart || !periodEnd) {
      actualsData = {};
      return;
    }
    try {
      const res = await fetch(`/api/statements/actuals?periodStart=${encodeURIComponent(periodStart)}&periodEnd=${encodeURIComponent(periodEnd)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取得に失敗しました');
      actualsData = data.actuals || {};
    } catch (err) {
      console.error(err);
      actualsData = {};
    }
  }

  async function loadCategories() {
    try {
      const res = await fetch('/api/categories');
      categoriesData = await res.json();
    } catch (err) {
      console.error(err);
    }
  }

  function defaultFiscalYearDates() {
    const now = new Date();
    // 4月始まりの年度として、今日が1〜3月なら前年4月始まり、4〜12月なら今年4月始まりにする
    const startYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return {
      start: `${startYear}-04-01`,
      end: `${startYear + 1}-03-31`,
      label: `${startYear}年度`,
    };
  }

  function budgetRowHtml(c) {
    return `
      <div class="budget-row">
        <span class="budget-row-name">
          ${escapeHtml(c.name)}<br>
          <span class="budget-row-actual">実績 ${formatYen(actualsData[c.name] || 0)}</span><br>
          <span class="budget-row-budget">予算 ${formatYen(budgetsData[c.name] || 0)}</span>
        </span>
        <button class="template-button" type="button" data-set-budget-category="${escapeHtml(c.name)}">予算額を設定</button>
        <button class="template-button" type="button" data-detail-category="${escapeHtml(c.name)}">内訳</button>
      </div>
    `;
  }

  function renderBudgetForm() {
    const rows = [];
    rows.push('<p class="budget-group-title">収入の部</p>');
    (categoriesData.income || []).forEach((c) => {
      rows.push(budgetRowHtml(c));
    });
    (categoriesData.expenseGroups || []).forEach((g) => {
      rows.push(`<p class="budget-group-title">${escapeHtml(g.group)}</p>`);
      g.categories.forEach((c) => {
        rows.push(budgetRowHtml(c));
      });
    });
    statementBudgetContainer.innerHTML = rows.join('');
    statementBudgetContainer.querySelectorAll('button[data-set-budget-category]').forEach((button) => {
      button.addEventListener('click', () => openBudgetSet(button.dataset.setBudgetCategory));
    });
    statementBudgetContainer.querySelectorAll('button[data-detail-category]').forEach((button) => {
      button.addEventListener('click', () => openBudgetDetail(button.dataset.detailCategory));
    });
  }

  function collectBudgets() {
    return { ...budgetsData };
  }

  // --- 予算額の設定（一覧の数字を直接編集させず、ボタンからダイアログで1科目ずつ設定する） ---
  const budgetSetOverlay = document.getElementById('budgetSetOverlay');
  const budgetSetTitle = document.getElementById('budgetSetTitle');
  const budgetSetAmount = document.getElementById('budgetSetAmount');
  const cancelBudgetSetButton = document.getElementById('cancelBudgetSetButton');
  const saveBudgetSetButton = document.getElementById('saveBudgetSetButton');
  let currentBudgetSetCategory = null;

  budgetSetAmount.addEventListener('input', () => {
    budgetSetAmount.value = budgetSetAmount.value.replace(/[^0-9]/g, '');
  });

  function openBudgetSet(category) {
    currentBudgetSetCategory = category;
    budgetSetTitle.textContent = `予算額を設定：${category}`;
    budgetSetAmount.value = budgetsData[category] || 0;
    budgetSetOverlay.classList.add('open');
  }

  cancelBudgetSetButton.addEventListener('click', () => {
    budgetSetOverlay.classList.remove('open');
  });
  budgetSetOverlay.addEventListener('click', (e) => {
    if (e.target === budgetSetOverlay) budgetSetOverlay.classList.remove('open');
  });
  saveBudgetSetButton.addEventListener('click', () => {
    budgetsData[currentBudgetSetCategory] = Number(budgetSetAmount.value || 0);
    budgetSetOverlay.classList.remove('open');
    renderBudgetForm();
  });

  // 前年度繰越金はここでは編集不可。入出金ページ（期首残高を登録する）を含めた、
  // 対象期間の開始日より前の入出金の記録から常に自動計算して表示するだけにする。
  async function refreshCarryover() {
    const periodStart = statementPeriodStart.value;
    if (!periodStart) {
      statementCarryover.value = 0;
      return;
    }
    try {
      const res = await fetch(`/api/statements/carryover?periodStart=${encodeURIComponent(periodStart)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取得に失敗しました');
      statementCarryover.value = data.carryover;
    } catch (err) {
      console.error(err);
    }
  }

  async function openCreateStatement() {
    statementFormTitle.textContent = '📊 決算書を作成する';
    saveStatementButton.textContent = '作成する';
    const defaults = defaultFiscalYearDates();
    statementYearLabel.value = defaults.label;
    statementPeriodStart.value = defaults.start;
    statementPeriodEnd.value = defaults.end;
    await refreshCarryover();

    budgetsData = {};
    try {
      const res = await fetch('/api/statements/budgets/latest');
      const data = await res.json();
      budgetsData = data.budgets || {};
    } catch (err) {
      console.error(err);
    }
    await loadActuals();
    renderBudgetForm();
  }

  async function openEditStatement(id) {
    try {
      const res = await fetch(`/api/statements/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取得に失敗しました');
      const item = data.item;
      editingStatementId = id;
      statementFormTitle.textContent = '📊 決算書を編集する';
      saveStatementButton.textContent = '更新する';
      statementYearLabel.value = item.inputData.yearLabel || item.yearLabel;
      statementPeriodStart.value = item.inputData.periodStart || item.periodStart;
      statementPeriodEnd.value = item.inputData.periodEnd || item.periodEnd;
      await refreshCarryover();
      budgetsData = item.inputData.budgets || {};
      await loadActuals();
      renderBudgetForm();
    } catch (err) {
      console.error(err);
      window.alert('決算書の取得に失敗しました');
    }
  }

  // 対象期間を変えたら、繰越金・実績表示を更新する（予算額はbudgetsDataに保持されたまま）
  async function refreshOnPeriodChange() {
    await Promise.all([refreshCarryover(), loadActuals()]);
    renderBudgetForm();
  }
  statementPeriodStart.addEventListener('change', refreshOnPeriodChange);
  statementPeriodEnd.addEventListener('change', refreshOnPeriodChange);

  cancelStatementButton.addEventListener('click', () => {
    window.location.href = 'accounting.html';
  });

  saveStatementButton.addEventListener('click', async () => {
    const yearLabel = statementYearLabel.value.trim();
    const periodStart = statementPeriodStart.value;
    const periodEnd = statementPeriodEnd.value;
    if (!yearLabel || !periodStart || !periodEnd) {
      window.alert('年度・対象期間を入力してください');
      return;
    }
    const originalLabel = saveStatementButton.textContent;
    saveStatementButton.disabled = true;
    saveStatementButton.textContent = editingStatementId ? '更新中...' : '作成中...';
    try {
      const carryover = Number(statementCarryover.value || 0);
      const body = JSON.stringify({
        yearLabel,
        periodStart,
        periodEnd,
        carryoverBudget: carryover,
        carryoverActual: carryover,
        budgets: collectBudgets(),
        notes: {},
      });
      const res = editingStatementId
        ? await fetch(`/api/statements/${editingStatementId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
        : await fetch('/api/statements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '決算書の作成に失敗しました');
      window.alert(editingStatementId ? '決算書を更新しました。PDFを新しいタブで開きます。' : '決算書を作成しました。PDFを新しいタブで開きます。');
      window.open(data.url, '_blank', 'noopener');
      window.location.href = 'accounting.html';
    } catch (err) {
      console.error(err);
      window.alert(err.message || '決算書の作成に失敗しました');
      saveStatementButton.disabled = false;
      saveStatementButton.textContent = originalLabel;
    }
  });

  // --- 科目ごとの内訳（対象期間内の入出金記録を表示し、その場で編集・削除できるようにする） ---
  const budgetDetailOverlay = document.getElementById('budgetDetailOverlay');
  const budgetDetailTitle = document.getElementById('budgetDetailTitle');
  const budgetDetailPeriodHint = document.getElementById('budgetDetailPeriodHint');
  const budgetDetailListContainer = document.getElementById('budgetDetailListContainer');
  const closeBudgetDetailButton = document.getElementById('closeBudgetDetailButton');

  // "YYYY/MM/DD" と "YYYY-MM-DD" のどちらも扱えるようにする
  function parseFlexibleDate(str) {
    if (!str) return null;
    const m = String(str).trim().match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function renderBudgetDetailList(transactions) {
    if (transactions.length === 0) {
      budgetDetailListContainer.innerHTML = '<p class="event-list-empty">対象期間内にこの科目の記録はありません</p>';
      return;
    }
    budgetDetailListContainer.innerHTML = '';
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
        </div>
        <div class="transaction-actions">
          <a class="transaction-edit" href="transaction-edit.html?row=${t.row}">編集</a>
          <button type="button" class="transaction-delete">削除</button>
        </div>
      `;
      row.querySelector('.transaction-desc').textContent = t.description || t.category || t.type;
      row.querySelector('.transaction-date').textContent = t.date;
      row.querySelector('.transaction-amount').textContent = `${sign}${formatYen(t.amount)}`;
      row.querySelector('.transaction-delete').addEventListener('click', async () => {
        if (!window.confirm('この記録を削除しますか？')) return;
        try {
          const res = await fetch(`/api/transactions/${t.row}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('削除に失敗しました');
          await openBudgetDetail(currentDetailCategory);
        } catch (err) {
          console.error(err);
          window.alert('削除に失敗しました');
        }
      });
      budgetDetailListContainer.appendChild(row);
    });
  }

  let currentDetailCategory = null;

  async function openBudgetDetail(category) {
    currentDetailCategory = category;
    budgetDetailTitle.textContent = `内訳：${category}`;
    const periodStart = statementPeriodStart.value;
    const periodEnd = statementPeriodEnd.value;
    budgetDetailPeriodHint.textContent = periodStart && periodEnd ? `対象期間：${periodStart}〜${periodEnd}` : '';
    budgetDetailListContainer.innerHTML = '読み込み中...';
    budgetDetailOverlay.classList.add('open');
    try {
      const res = await fetch('/api/transactions');
      if (!res.ok) throw new Error('取得に失敗しました');
      const data = await res.json();
      const start = parseFlexibleDate(periodStart);
      const end = parseFlexibleDate(periodEnd);
      const filtered = data.transactions.filter((t) => {
        if (t.category !== category) return false;
        const d = parseFlexibleDate(t.date);
        if (!d || !start || !end) return true;
        return d >= start && d <= end;
      });
      renderBudgetDetailList(filtered);
    } catch (err) {
      console.error(err);
      budgetDetailListContainer.innerHTML = '<p class="event-list-empty">記録の取得に失敗しました</p>';
    }
  }

  closeBudgetDetailButton.addEventListener('click', () => {
    budgetDetailOverlay.classList.remove('open');
  });
  budgetDetailOverlay.addEventListener('click', (e) => {
    if (e.target === budgetDetailOverlay) budgetDetailOverlay.classList.remove('open');
  });

  async function init() {
    await loadCategories();
    const urlParams = new URLSearchParams(window.location.search);
    const editIdParam = urlParams.get('editId');
    if (editIdParam) {
      await openEditStatement(editIdParam);
    } else {
      await openCreateStatement();
    }
  }
  init();
})();
