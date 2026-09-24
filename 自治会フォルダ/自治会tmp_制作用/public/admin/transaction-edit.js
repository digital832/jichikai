(function () {
  const incomeButton = document.getElementById('incomeButton');
  const expenseButton = document.getElementById('expenseButton');
  const amountInput = document.getElementById('amountInput');
  const dateInput = document.getElementById('dateInput');
  const categoryInput = document.getElementById('categoryInput');
  const descriptionInput = document.getElementById('descriptionInput');
  const saveButton = document.getElementById('saveButton');
  const deleteButton = document.getElementById('deleteButton');

  const urlParams = new URLSearchParams(window.location.search);
  const row = Number(urlParams.get('row'));

  let selectedType = '入金';
  let categoriesData = { income: [], expenseGroups: [] };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

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

  function setType(type, selectedCategory) {
    selectedType = type;
    incomeButton.classList.toggle('active', type === '入金');
    expenseButton.classList.toggle('active', type === '出金');
    renderCategoryOptions();
    if (selectedCategory) categoryInput.value = selectedCategory;
  }

  incomeButton.addEventListener('click', () => setType('入金'));
  expenseButton.addEventListener('click', () => setType('出金'));

  amountInput.addEventListener('input', () => {
    amountInput.value = amountInput.value.replace(/[^0-9]/g, '');
  });

  async function loadCategories() {
    const res = await fetch('/api/categories');
    categoriesData = await res.json();
  }

  async function loadTransaction() {
    const res = await fetch('/api/transactions');
    if (!res.ok) throw new Error('取得に失敗しました');
    const data = await res.json();
    const t = data.transactions.find((item) => item.row === row);
    if (!t) throw new Error('対象の記録が見つかりません');
    amountInput.value = t.amount;
    dateInput.value = t.date;
    descriptionInput.value = t.description;
    setType(t.type, t.category);
  }

  saveButton.addEventListener('click', async () => {
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
    saveButton.disabled = true;
    try {
      const body = JSON.stringify({
        date,
        type: selectedType,
        amount: Number(amount),
        description: descriptionInput.value.trim(),
        category: categoryInput.value,
      });
      const res = await fetch(`/api/transactions/${row}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error('更新に失敗しました');
      window.location.href = 'accounting.html';
    } catch (err) {
      console.error(err);
      window.alert('更新に失敗しました');
      saveButton.disabled = false;
    }
  });

  deleteButton.addEventListener('click', async () => {
    if (!window.confirm('この記録を削除しますか？')) return;
    deleteButton.disabled = true;
    try {
      const res = await fetch(`/api/transactions/${row}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除に失敗しました');
      window.location.href = 'accounting.html';
    } catch (err) {
      console.error(err);
      window.alert('削除に失敗しました');
      deleteButton.disabled = false;
    }
  });

  async function init() {
    if (!row) {
      window.alert('対象の記録が指定されていません');
      window.location.href = 'accounting.html';
      return;
    }
    try {
      await loadCategories();
      await loadTransaction();
    } catch (err) {
      console.error(err);
      window.alert(err.message || '記録の取得に失敗しました');
      window.location.href = 'accounting.html';
    }
  }
  init();
})();
