(function () {
  const statementListContainer = document.getElementById('statementListContainer');
  const yearFilterSelect = document.getElementById('yearFilterSelect');

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  let allItems = [];

  function renderForSelectedYear() {
    const year = yearFilterSelect.value;
    const items = year ? allItems.filter((item) => item.yearLabel === year) : allItems;
    StatementList.renderItems(statementListContainer, items);
  }

  function rebuildYearOptions() {
    const currentValue = yearFilterSelect.value;
    // 一覧は新しい順に並んでいるので、年度の選択肢もその順番をそのまま使う
    const years = [...new Set(allItems.map((item) => item.yearLabel))];
    yearFilterSelect.innerHTML = '<option value="">すべての年度</option>'
      + years.map((y) => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join('');
    // 削除などで選んでいた年度が無くなった場合は「すべての年度」に戻す
    yearFilterSelect.value = years.includes(currentValue) ? currentValue : '';
  }

  async function loadAll() {
    statementListContainer.innerHTML = '読み込み中...';
    try {
      allItems = await StatementList.fetchAll();
      rebuildYearOptions();
      renderForSelectedYear();
    } catch (err) {
      console.error(err);
      statementListContainer.innerHTML = '<p class="statement-empty">決算書一覧の取得に失敗しました</p>';
    }
  }

  yearFilterSelect.addEventListener('change', renderForSelectedYear);

  StatementList.attachHandlers(statementListContainer);
  statementListContainer.addEventListener('statement-deleted', loadAll);

  loadAll();
})();
