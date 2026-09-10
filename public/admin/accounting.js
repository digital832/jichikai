(function () {
  const incomeButton = document.getElementById('incomeButton');
  const expenseButton = document.getElementById('expenseButton');
  const amountInput = document.getElementById('amountInput');
  const dateInput = document.getElementById('dateInput');
  const descriptionInput = document.getElementById('descriptionInput');
  const registerButton = document.getElementById('registerButton');
  const transactionListContainer = document.getElementById('transactionListContainer');

  let selectedType = '入金';

  function todayString() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }
  dateInput.value = todayString();

  incomeButton.addEventListener('click', () => {
    selectedType = '入金';
    incomeButton.classList.add('active');
    expenseButton.classList.remove('active');
  });
  expenseButton.addEventListener('click', () => {
    selectedType = '出金';
    expenseButton.classList.add('active');
    incomeButton.classList.remove('active');
  });

  amountInput.addEventListener('input', () => {
    amountInput.value = amountInput.value.replace(/[^0-9]/g, '');
  });

  function formatYen(n) {
    return '¥' + Number(n || 0).toLocaleString('ja-JP');
  }

  async function loadTransactions() {
    transactionListContainer.innerHTML = '読み込み中...';
    try {
      const res = await fetch('/api/transactions');
      if (!res.ok) throw new Error('取得に失敗しました');
      const data = await res.json();

      document.getElementById('balanceAmount').textContent = formatYen(data.balance);
      document.getElementById('totalIncome').textContent = formatYen(data.totalIncome);
      document.getElementById('totalExpense').textContent = formatYen(data.totalExpense);

      transactionListContainer.innerHTML = '';
      if (data.transactions.length === 0) {
        transactionListContainer.innerHTML = '<p class="event-list-empty">まだ記録がありません</p>';
        return;
      }
      data.transactions.forEach((t) => {
        const row = document.createElement('div');
        row.className = 'transaction-row';
        const sign = t.type === '入金' ? '+' : '-';
        const typeClass = t.type === '入金' ? 'income' : 'expense';
        row.innerHTML = `
          <div class="transaction-info">
            <span class="transaction-desc"></span>
            <span class="transaction-date"></span>
          </div>
          <span class="transaction-amount ${typeClass}"></span>
          <button type="button" class="transaction-delete">削除</button>
        `;
        row.querySelector('.transaction-desc').textContent = t.description || t.type;
        row.querySelector('.transaction-date').textContent = t.date;
        row.querySelector('.transaction-amount').textContent = `${sign}${formatYen(t.amount)}`;
        row.querySelector('.transaction-delete').addEventListener('click', async () => {
          if (!window.confirm('この記録を削除しますか？')) return;
          try {
            const delRes = await fetch(`/api/transactions/${t.row}`, { method: 'DELETE' });
            if (!delRes.ok) throw new Error('削除に失敗しました');
            await loadTransactions();
          } catch (err) {
            console.error(err);
            window.alert('削除に失敗しました');
          }
        });
        transactionListContainer.appendChild(row);
      });
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
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          type: selectedType,
          amount: Number(amount),
          description: descriptionInput.value.trim(),
        }),
      });
      if (!res.ok) throw new Error('登録に失敗しました');
      amountInput.value = '';
      descriptionInput.value = '';
      await loadTransactions();
      window.alert('登録しました');
    } catch (err) {
      console.error(err);
      window.alert('登録に失敗しました');
    } finally {
      registerButton.disabled = false;
    }
  });

  loadTransactions();
})();
