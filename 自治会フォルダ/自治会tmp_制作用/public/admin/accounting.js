(function () {
  const incomeButton = document.getElementById('incomeButton');
  const expenseButton = document.getElementById('expenseButton');
  const amountInput = document.getElementById('amountInput');
  const dateInput = document.getElementById('dateInput');
  const categoryInput = document.getElementById('categoryInput');
  const descriptionInput = document.getElementById('descriptionInput');
  const registerButton = document.getElementById('registerButton');
  const transactionListContainer = document.getElementById('transactionListContainer');
  const transactionShowAllLink = document.getElementById('transactionShowAllLink');

  let selectedType = '入金';

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function todayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }
  dateInput.value = todayString();

  // --- 科目（決算書の項目）のプルダウン ---
  let categoriesData = { income: [], expenseGroups: [] };

  function renderCategoryOptions() {
    const groups = selectedType === '入金'
      ? [{ group: '', categories: categoriesData.income }]
      : categoriesData.expenseGroups;
    const groupedOptions = groups.map((g) => {
      const options = g.categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
      return g.group ? `<optgroup label="${escapeHtml(g.group)}">${options}</optgroup>` : options;
    }).join('');
    categoryInput.innerHTML = `<option value="">— 科目を選択（決算書の集計対象にする場合）—</option>${groupedOptions}`;
  }

  async function loadCategories() {
    try {
      const res = await fetch('/api/categories');
      categoriesData = await res.json();
      renderCategoryOptions();
      renderCategoryManageList();
    } catch (err) {
      console.error(err);
    }
  }

  // --- 科目マスタの管理（追加・編集・削除） ---
  const manageCategoriesButton = document.getElementById('manageCategoriesButton');
  const categoryListOverlay = document.getElementById('categoryListOverlay');
  const closeCategoryListButton = document.getElementById('closeCategoryListButton');
  const categoryIncomeListContainer = document.getElementById('categoryIncomeListContainer');
  const categoryExpenseListContainer = document.getElementById('categoryExpenseListContainer');
  const newCategoryName = document.getElementById('newCategoryName');
  const newCategorySection = document.getElementById('newCategorySection');
  const newCategoryGroup = document.getElementById('newCategoryGroup');
  const addCategoryButton = document.getElementById('addCategoryButton');

  function expenseGroupNames() {
    return (categoriesData.expenseGroups || []).map((g) => g.group);
  }

  function fillGroupSelect(select, selectedGroup) {
    select.innerHTML = expenseGroupNames().map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('');
    if (selectedGroup) select.value = selectedGroup;
  }

  function toggleGroupSelectVisibility(section, groupSelect) {
    groupSelect.style.display = section === '支出' ? '' : 'none';
  }

  fillGroupSelect(newCategoryGroup);
  toggleGroupSelectVisibility(newCategorySection.value, newCategoryGroup);
  newCategorySection.addEventListener('change', () => {
    toggleGroupSelectVisibility(newCategorySection.value, newCategoryGroup);
  });

  function renderCategoryRow(c) {
    const row = document.createElement('div');
    row.className = 'category-row';
    row.innerHTML = `
      <div class="category-row-fields">
        <input class="text-input category-name-input" type="text" />
        <div class="category-select-row">
          <select class="select-input category-section-select">
            <option value="収入">収入</option>
            <option value="支出">支出</option>
          </select>
          <select class="select-input category-group-select"></select>
        </div>
      </div>
      <div class="event-list-actions">
        <button type="button" class="delete-btn">削除</button>
      </div>
    `;
    const nameInput = row.querySelector('.category-name-input');
    const sectionSelect = row.querySelector('.category-section-select');
    const groupSelect = row.querySelector('.category-group-select');
    nameInput.value = c.name;
    sectionSelect.value = c.section;
    fillGroupSelect(groupSelect, c.group);
    toggleGroupSelectVisibility(c.section, groupSelect);

    async function saveCategory() {
      const name = nameInput.value.trim();
      if (!name) {
        window.alert('科目名を入力してください');
        nameInput.value = c.name;
        return;
      }
      try {
        const res = await fetch(`/api/categories/${c.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, section: sectionSelect.value, group: groupSelect.value }),
        });
        if (!res.ok) throw new Error('更新に失敗しました');
        await loadCategories();
      } catch (err) {
        console.error(err);
        window.alert('科目の更新に失敗しました');
      }
    }

    nameInput.addEventListener('change', saveCategory);
    sectionSelect.addEventListener('change', () => {
      toggleGroupSelectVisibility(sectionSelect.value, groupSelect);
      saveCategory();
    });
    groupSelect.addEventListener('change', saveCategory);

    row.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!window.confirm(`「${c.name}」を削除しますか？`)) return;
      try {
        const res = await fetch(`/api/categories/${c.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('削除に失敗しました');
        await loadCategories();
      } catch (err) {
        console.error(err);
        window.alert('科目の削除に失敗しました');
      }
    });

    return row;
  }

  function renderCategoryManageList() {
    const all = categoriesData.all || [];
    const income = all.filter((c) => c.section === '収入');
    const expense = all.filter((c) => c.section === '支出');

    categoryIncomeListContainer.innerHTML = '';
    if (income.length === 0) {
      categoryIncomeListContainer.innerHTML = '<p class="event-list-empty">収入の科目が登録されていません</p>';
    } else {
      income.forEach((c) => categoryIncomeListContainer.appendChild(renderCategoryRow(c)));
    }

    categoryExpenseListContainer.innerHTML = '';
    if (expense.length === 0) {
      categoryExpenseListContainer.innerHTML = '<p class="event-list-empty">支出の科目が登録されていません</p>';
    } else {
      expense.forEach((c) => categoryExpenseListContainer.appendChild(renderCategoryRow(c)));
    }
  }

  manageCategoriesButton.addEventListener('click', () => {
    renderCategoryManageList();
    categoryListOverlay.classList.add('open');
  });
  closeCategoryListButton.addEventListener('click', () => {
    categoryListOverlay.classList.remove('open');
  });
  categoryListOverlay.addEventListener('click', (e) => {
    if (e.target === categoryListOverlay) categoryListOverlay.classList.remove('open');
  });

  addCategoryButton.addEventListener('click', async () => {
    const name = newCategoryName.value.trim();
    if (!name) {
      window.alert('科目名を入力してください');
      return;
    }
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, section: newCategorySection.value, group: newCategoryGroup.value }),
      });
      if (!res.ok) throw new Error('追加に失敗しました');
      newCategoryName.value = '';
      await loadCategories();
    } catch (err) {
      console.error(err);
      window.alert('科目の追加に失敗しました');
    }
  });

  function setType(type) {
    selectedType = type;
    incomeButton.classList.toggle('active', type === '入金');
    expenseButton.classList.toggle('active', type === '出金');
    renderCategoryOptions();
  }

  incomeButton.addEventListener('click', () => setType('入金'));
  expenseButton.addEventListener('click', () => setType('出金'));

  amountInput.addEventListener('input', () => {
    amountInput.value = amountInput.value.replace(/[^0-9]/g, '');
  });

  function formatYen(n) {
    return '¥' + Number(n || 0).toLocaleString('ja-JP');
  }

  function resetForm() {
    amountInput.value = '';
    descriptionInput.value = '';
    dateInput.value = todayString();
    setType('入金');
  }

  // "YYYY/MM/DD" 形式の日付文字列をDateに変換する
  function parseSlashDate(str) {
    const m = String(str || '').trim().match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  const RECENT_LIST_MAX = 7;

  async function loadTransactions() {
    transactionListContainer.innerHTML = '読み込み中...';
    try {
      const data = await TransactionList.fetchAll();

      document.getElementById('balanceAmount').textContent = formatYen(data.balance);
      document.getElementById('totalIncome').textContent = formatYen(data.totalIncome);
      document.getElementById('totalExpense').textContent = formatYen(data.totalExpense);

      const balanceAfterByRow = TransactionList.computeBalanceAfterMap(data.transactions);

      // トップページでは直近1か月分だけを、最大7件まで表示する（続きはtransactions-archive.htmlへ）
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const recent = data.transactions
        .filter((t) => {
          const d = parseSlashDate(t.date);
          return !d || d >= oneMonthAgo;
        })
        .slice(0, RECENT_LIST_MAX);

      TransactionList.renderItems(transactionListContainer, recent, balanceAfterByRow, {
        editHref: (t) => `transaction-edit.html?row=${t.row}`,
        onDeleted: loadTransactions,
      });
      transactionShowAllLink.style.display = data.transactions.length > recent.length ? 'block' : 'none';
    } catch (err) {
      console.error(err);
      transactionListContainer.innerHTML = '<p class="event-list-empty">記録の取得に失敗しました</p>';
    }
  }

  registerButton.addEventListener('click', async () => {
    const amount = amountInput.value.trim();
    const date = dateInput.value.trim();
    if (!amount || Number(amount) <= 0) {
      window.alert('金額を入力してください');
      return;
    }
    if (!date) {
      window.alert('日付を入力してください');
      return;
    }
    registerButton.disabled = true;
    try {
      const body = JSON.stringify({
        date,
        type: selectedType,
        amount: Number(amount),
        description: descriptionInput.value.trim(),
        category: categoryInput.value,
      });
      const res = await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error('登録に失敗しました');
      resetForm();
      await loadTransactions();
      window.alert('登録しました');
    } catch (err) {
      console.error(err);
      window.alert('登録に失敗しました');
    } finally {
      registerButton.disabled = false;
    }
  });

  // --- 期首残高の登録 ---
  // 前年度からの繰越金は、年度の始まりにここで入金として記録しておく。
  // これにより出納帳の残高が年間を通じて正しくなり、決算書作成時は「前年を反映」で
  // ここに記録した金額を含めて自動計算できる。
  const openingBalanceButton = document.getElementById('openingBalanceButton');
  const openingBalanceOverlay = document.getElementById('openingBalanceOverlay');
  const openingBalanceDate = document.getElementById('openingBalanceDate');
  const openingBalanceAmount = document.getElementById('openingBalanceAmount');
  const cancelOpeningBalanceButton = document.getElementById('cancelOpeningBalanceButton');
  const saveOpeningBalanceButton = document.getElementById('saveOpeningBalanceButton');

  let editingOpeningBalanceRow = null;

  function defaultFiscalYearStart() {
    const now = new Date();
    // 4月始まりの年度として、今日が1〜3月なら前年4月始まり、4〜12月なら今年4月始まりにする
    const startYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return `${startYear}-04-01`;
  }

  function defaultFiscalYearLabel() {
    const now = new Date();
    const startYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return `${startYear}年度`;
  }

  openingBalanceAmount.addEventListener('input', () => {
    openingBalanceAmount.value = openingBalanceAmount.value.replace(/[^0-9]/g, '');
  });

  // 既に今年度の期首残高が登録済みなら、その内容を表示する（「いくら打ったか分からない」を防ぐ）
  openingBalanceButton.addEventListener('click', async () => {
    const defaultDate = defaultFiscalYearStart();
    editingOpeningBalanceRow = null;
    openingBalanceDate.value = defaultDate;
    openingBalanceAmount.value = '';
    openingBalanceOverlay.classList.add('open');
    try {
      const data = await TransactionList.fetchAll();
      const slashDate = defaultDate.replace(/-/g, '/');
      const existing = data.transactions.find((t) => t.description === '前年度繰越金' && t.date === slashDate);
      if (existing) {
        editingOpeningBalanceRow = existing.row;
        openingBalanceAmount.value = existing.amount;
      }
    } catch (err) {
      console.error(err);
    }
  });
  cancelOpeningBalanceButton.addEventListener('click', () => {
    openingBalanceOverlay.classList.remove('open');
  });
  openingBalanceOverlay.addEventListener('click', (e) => {
    if (e.target === openingBalanceOverlay) openingBalanceOverlay.classList.remove('open');
  });

  saveOpeningBalanceButton.addEventListener('click', async () => {
    const amount = openingBalanceAmount.value.trim();
    const date = openingBalanceDate.value;
    if (!amount || Number(amount) <= 0) {
      window.alert('金額を入力してください');
      return;
    }
    if (!date) {
      window.alert('年度開始日を入力してください');
      return;
    }
    saveOpeningBalanceButton.disabled = true;
    try {
      const [y, m, d] = date.split('-');
      const body = JSON.stringify({
        date: `${y}/${m}/${d}`,
        type: '入金',
        amount: Number(amount),
        description: '前年度繰越金',
        category: '',
      });
      const res = editingOpeningBalanceRow
        ? await fetch(`/api/transactions/${editingOpeningBalanceRow}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
        : await fetch('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error('登録に失敗しました');
      openingBalanceOverlay.classList.remove('open');
      await loadTransactions();
      window.alert(`期首残高 ${formatYen(Number(amount))} を登録しました`);
    } catch (err) {
      console.error(err);
      window.alert('登録に失敗しました');
    } finally {
      saveOpeningBalanceButton.disabled = false;
    }
  });

  // --- 予算額の設定（決算書を作らなくても、年度の始まりにここで先に設定できるようにする） ---
  const manageBudgetsButton = document.getElementById('manageBudgetsButton');
  const budgetManageOverlay = document.getElementById('budgetManageOverlay');
  const budgetManageYearHint = document.getElementById('budgetManageYearHint');
  const budgetListContainer = document.getElementById('budgetListContainer');
  const closeBudgetManageButton = document.getElementById('closeBudgetManageButton');
  const budgetSetOverlay = document.getElementById('budgetSetOverlay');
  const budgetSetTitle = document.getElementById('budgetSetTitle');
  const budgetSetAmount = document.getElementById('budgetSetAmount');
  const cancelBudgetSetButton = document.getElementById('cancelBudgetSetButton');
  const saveBudgetSetButton = document.getElementById('saveBudgetSetButton');

  let budgetManageYearLabel = defaultFiscalYearLabel();
  let budgetsData = {};
  let currentBudgetSetCategory = null;

  function budgetRowHtml(c) {
    return `
      <div class="budget-row">
        <span class="budget-row-name">
          ${escapeHtml(c.name)}<br>
          <span class="budget-row-budget">予算 ${formatYen(budgetsData[c.name] || 0)}</span>
        </span>
        <button class="template-button" type="button" data-set-budget-category="${escapeHtml(c.name)}">設定</button>
      </div>
    `;
  }

  function renderBudgetList() {
    const rows = [];
    rows.push('<p class="budget-group-title">収入の部</p>');
    (categoriesData.income || []).forEach((c) => rows.push(budgetRowHtml(c)));
    (categoriesData.expenseGroups || []).forEach((g) => {
      rows.push(`<p class="budget-group-title">${escapeHtml(g.group)}</p>`);
      g.categories.forEach((c) => rows.push(budgetRowHtml(c)));
    });
    budgetListContainer.innerHTML = rows.join('');
    budgetListContainer.querySelectorAll('button[data-set-budget-category]').forEach((button) => {
      button.addEventListener('click', () => openBudgetSet(button.dataset.setBudgetCategory));
    });
  }

  manageBudgetsButton.addEventListener('click', async () => {
    budgetManageYearLabel = defaultFiscalYearLabel();
    budgetManageYearHint.textContent = `対象年度：${budgetManageYearLabel}`;
    budgetListContainer.innerHTML = '読み込み中...';
    budgetManageOverlay.classList.add('open');
    try {
      const res = await fetch(`/api/statements/budgets?yearLabel=${encodeURIComponent(budgetManageYearLabel)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取得に失敗しました');
      budgetsData = data.budgets || {};
      renderBudgetList();
    } catch (err) {
      console.error(err);
      budgetListContainer.innerHTML = '<p class="event-list-empty">予算額の取得に失敗しました</p>';
    }
  });
  closeBudgetManageButton.addEventListener('click', () => {
    budgetManageOverlay.classList.remove('open');
  });
  budgetManageOverlay.addEventListener('click', (e) => {
    if (e.target === budgetManageOverlay) budgetManageOverlay.classList.remove('open');
  });

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
  saveBudgetSetButton.addEventListener('click', async () => {
    budgetsData[currentBudgetSetCategory] = Number(budgetSetAmount.value || 0);
    saveBudgetSetButton.disabled = true;
    try {
      const res = await fetch('/api/statements/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yearLabel: budgetManageYearLabel, budgets: budgetsData }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      budgetSetOverlay.classList.remove('open');
      renderBudgetList();
    } catch (err) {
      console.error(err);
      window.alert('予算額の保存に失敗しました');
    } finally {
      saveBudgetSetButton.disabled = false;
    }
  });

  // --- 決算書一覧（作成・編集はstatement.htmlに分離） ---
  const statementListContainer = document.getElementById('statementListContainer');
  const statementShowAllLink = document.getElementById('statementShowAllLink');
  const updateStatementButton = document.getElementById('updateStatementButton');

  statementListContainer.addEventListener('statement-deleted', () => {
    StatementList.load(statementListContainer, { showAllLinkEl: statementShowAllLink });
    refreshUpdateStatementButton();
  });
  StatementList.attachHandlers(statementListContainer);

  // 今年度の決算書がすでにある場合は「更新する」ボタンでそれを直接編集できるようにする。
  // これがないと「決算書を作成する」を押すたびに新規作成され、同じ年度が一覧に重複してしまう。
  async function refreshUpdateStatementButton() {
    try {
      const items = await StatementList.fetchAll();
      const currentYearLabel = defaultFiscalYearLabel();
      const existing = items.find((item) => item.yearLabel === currentYearLabel);
      if (existing) {
        updateStatementButton.href = `statement.html?editId=${existing.id}`;
        updateStatementButton.style.display = 'block';
      } else {
        updateStatementButton.style.display = 'none';
      }
    } catch (err) {
      console.error(err);
      updateStatementButton.style.display = 'none';
    }
  }

  loadCategories();
  loadTransactions();
  StatementList.load(statementListContainer, { showAllLinkEl: statementShowAllLink });
  refreshUpdateStatementButton();
})();
