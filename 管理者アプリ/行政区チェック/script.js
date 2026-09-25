(function () {
  var DATA = window.GYOUSEIKU_DATA.districts;
  var GRAND_TOTAL = window.GYOUSEIKU_DATA.grandTotal;
  var AVG_PERSONS_PER_HOUSEHOLD = window.GYOUSEIKU_DATA.avgPersonsPerHousehold;
  var STORAGE_KEY = 'jichikai_gyouseiku_check_v1';
  var MEMO_STORAGE_KEY = 'jichikai_gyouseiku_memo_v1';

  var STATUS_OPTIONS = [
    { value: '', label: '－' },
    { value: 'kadou', label: '稼働' },
    { value: 'sesshoku', label: '接触' },
    { value: 'kibou', label: '希望' },
  ];

  // checked[itemKey] にはステータス文字列（'kadou'/'sesshoku'/'kibou'）を保存する
  var checked = {};
  try {
    checked = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) {
    checked = {};
  }

  var memos = {};
  try {
    memos = JSON.parse(localStorage.getItem(MEMO_STORAGE_KEY) || '{}');
  } catch (e) {
    memos = {};
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checked));
    } catch (e) {
      /* localStorageが使えない環境では保存をあきらめる */
    }
  }

  function saveMemos() {
    try {
      localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify(memos));
    } catch (e) {
      /* localStorageが使えない環境では保存をあきらめる */
    }
  }

  function itemKey(districtKey, no) {
    return districtKey + '::' + no;
  }

  function fmt(n) {
    return n.toLocaleString('ja-JP');
  }

  var listEl = document.getElementById('districtList');

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function formatDateForDisplay(isoStr) {
    var parts = isoStr.split('-');
    if (parts.length !== 3) return isoStr;
    return parts[0] + '/' + parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10);
  }

  var memoModal = null;
  function ensureMemoModal() {
    if (memoModal) return memoModal;
    var overlay = document.createElement('div');
    overlay.className = 'memo-modal-overlay';
    overlay.innerHTML =
      '<div class="memo-modal">' +
      '<div class="memo-modal-title"></div>' +
      '<label class="memo-modal-label">日付</label>' +
      '<input type="date" class="memo-modal-date" />' +
      '<label class="memo-modal-label">メモ内容</label>' +
      '<textarea class="memo-modal-text" rows="3" placeholder="例: 区長さんと電話で話した、資料を渡した、など"></textarea>' +
      '<div class="memo-modal-actions">' +
      '<button type="button" class="memo-modal-cancel">キャンセル</button>' +
      '<button type="button" class="memo-modal-ok">追加</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    memoModal = overlay;
    return overlay;
  }

  function openMemoModal(name, onSubmit) {
    var overlay = ensureMemoModal();
    var titleEl = overlay.querySelector('.memo-modal-title');
    var dateEl = overlay.querySelector('.memo-modal-date');
    var textEl = overlay.querySelector('.memo-modal-text');
    var okBtn = overlay.querySelector('.memo-modal-ok');
    var cancelBtn = overlay.querySelector('.memo-modal-cancel');

    titleEl.textContent = '「' + name + '」の接触メモを追加';
    dateEl.value = todayISO();
    textEl.value = '';
    overlay.classList.add('is-open');
    setTimeout(function () { textEl.focus(); }, 0);

    function close() {
      overlay.classList.remove('is-open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlayClick);
    }
    function onOk() {
      var text = textEl.value.trim();
      if (!text) {
        textEl.focus();
        return;
      }
      var dateVal = dateEl.value || todayISO();
      onSubmit(formatDateForDisplay(dateVal), text);
      close();
    }
    function onCancel() {
      close();
    }
    function onOverlayClick(e) {
      if (e.target === overlay) close();
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlayClick);
  }

  function computeDistrictChecked(district) {
    var count = 0, ban = 0, setai = 0;
    var byStatus = { kadou: 0, sesshoku: 0, kibou: 0 };
    district.items.forEach(function (row) {
      var status = checked[itemKey(district.key, row[0])];
      if (status) {
        count++;
        ban += row[2];
        setai += row[3];
        if (byStatus[status] !== undefined) byStatus[status] += row[3];
      }
    });
    return { count: count, ban: ban, setai: setai, byStatus: byStatus };
  }

  function setSegWidths(container, byStatus, totalSetai) {
    ['kadou', 'sesshoku', 'kibou'].forEach(function (status) {
      var seg = container.querySelector('.seg-' + status);
      if (!seg) return;
      var pct = totalSetai ? Math.min(100, (byStatus[status] / totalSetai) * 100) : 0;
      seg.style.width = pct + '%';
    });
  }

  function updateGrandSummary() {
    var setai = 0;
    var byStatus = { kadou: 0, sesshoku: 0, kibou: 0 };
    DATA.forEach(function (district) {
      var c = computeDistrictChecked(district);
      setai += c.setai;
      byStatus.kadou += c.byStatus.kadou;
      byStatus.sesshoku += c.byStatus.sesshoku;
      byStatus.kibou += c.byStatus.kibou;
    });
    document.getElementById('grandSetai').textContent = fmt(setai);
    document.getElementById('grandSetaiTotal').textContent = fmt(GRAND_TOTAL.setai);
    document.getElementById('grandPop').textContent = fmt(Math.round(setai * AVG_PERSONS_PER_HOUSEHOLD));
    document.getElementById('grandPopTotal').textContent = fmt(Math.round(GRAND_TOTAL.setai * AVG_PERSONS_PER_HOUSEHOLD));
    setSegWidths(document.getElementById('grandProgress'), byStatus, GRAND_TOTAL.setai);
  }

  function updateDistrictSummary(district) {
    var c = computeDistrictChecked(district);
    var el = document.getElementById('summary-' + district.key);
    if (!el) return;
    el.querySelector('.d-count').textContent = c.count + '/' + district.items.length;
    el.querySelector('.d-ban').textContent = fmt(c.ban) + '/' + fmt(district.total.ban);
    el.querySelector('.d-setai').textContent = fmt(c.setai) + '/' + fmt(district.total.setai);
    setSegWidths(el.querySelector('.mini-progress-outer'), c.byStatus, district.total.setai);
  }

  function updateAll() {
    updateGrandSummary();
    DATA.forEach(updateDistrictSummary);
  }

  function buildRow(district, row, maxSetai) {
    var no = row[0], name = row[1], ban = row[2], setai = row[3], note = row[4];
    var key = itemKey(district.key, no);

    var li = document.createElement('div');
    li.className = 'item-row';
    li.dataset.search = (no + ' ' + name).toLowerCase();
    li.dataset.status = checked[key] || '';

    var statusSelect = document.createElement('select');
    statusSelect.className = 'item-status';
    STATUS_OPTIONS.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      statusSelect.appendChild(o);
    });
    statusSelect.value = checked[key] || '';
    statusSelect.addEventListener('change', function () {
      if (statusSelect.value) {
        checked[key] = statusSelect.value;
      } else {
        delete checked[key];
      }
      save();
      li.dataset.status = statusSelect.value;
      updateDistrictSummary(district);
      updateGrandSummary();
      applyFilters();
    });

    var body = document.createElement('span');
    body.className = 'item-body';

    var top = document.createElement('span');
    top.className = 'item-top';

    var noSpan = document.createElement('span');
    noSpan.className = 'item-no';
    noSpan.textContent = no;

    var nameSpan = document.createElement('span');
    nameSpan.className = 'item-name';
    nameSpan.textContent = name;

    var numSpan = document.createElement('span');
    numSpan.className = 'item-nums';
    numSpan.textContent = '班 ' + ban + ' ・ 世帯 ' + setai;

    top.appendChild(noSpan);
    top.appendChild(nameSpan);
    body.appendChild(top);
    body.appendChild(numSpan);

    var barOuter = document.createElement('span');
    barOuter.className = 'item-bar-outer';
    var barInner = document.createElement('span');
    barInner.className = 'item-bar-inner';
    var barPct = maxSetai ? Math.max(2, (setai / maxSetai) * 100) : 0;
    barInner.style.width = barPct + '%';
    barOuter.appendChild(barInner);
    body.appendChild(barOuter);

    if (note) {
      var noteSpan = document.createElement('span');
      noteSpan.className = 'item-note';
      noteSpan.textContent = note;
      body.appendChild(noteSpan);
    }

    var memoRow = document.createElement('span');
    memoRow.className = 'memo-row';

    var memoBtn = document.createElement('button');
    memoBtn.type = 'button';
    memoBtn.className = 'memo-btn';

    var memoLatest = document.createElement('span');
    memoLatest.className = 'memo-latest';

    function renderMemo() {
      var list = memos[key] || [];
      memoBtn.innerHTML = '📝 接触メモ <span class="memo-count">' + list.length + '</span>';
      if (list.length) {
        var last = list[list.length - 1];
        memoLatest.textContent = '最新: ' + last.date + ' ' + last.text;
        memoLatest.style.display = 'block';
      } else {
        memoLatest.textContent = '';
        memoLatest.style.display = 'none';
      }
    }
    renderMemo();

    memoBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      openMemoModal(name, function (dateStr, text) {
        if (!memos[key]) memos[key] = [];
        memos[key].push({ date: dateStr, text: text });
        saveMemos();
        renderMemo();
      });
    });

    memoRow.appendChild(memoBtn);
    memoRow.appendChild(memoLatest);
    body.appendChild(memoRow);

    li.appendChild(statusSelect);
    li.appendChild(body);
    return li;
  }

  DATA.forEach(function (district) {
    var details = document.createElement('details');
    details.className = 'district';
    details.open = false;

    var summary = document.createElement('summary');
    summary.id = 'summary-' + district.key;
    summary.innerHTML =
      '<span class="d-name">' + district.key + '</span>' +
      '<span class="d-stats">' +
      '  <span class="d-count">0/0</span>件 ・ ' +
      '班 <span class="d-ban">0/0</span> ・ ' +
      '世帯 <span class="d-setai">0/0</span>' +
      '</span>' +
      '<span class="mini-progress-outer">' +
      '<span class="progress-seg seg-kadou"></span>' +
      '<span class="progress-seg seg-sesshoku"></span>' +
      '<span class="progress-seg seg-kibou"></span>' +
      '</span>';
    details.appendChild(summary);

    var body = document.createElement('div');
    body.className = 'district-body';
    var list = document.createElement('div');
    list.className = 'item-list';
    var maxSetai = 0;
    district.items.forEach(function (row) {
      if (row[3] > maxSetai) maxSetai = row[3];
    });
    district.items.forEach(function (row) {
      list.appendChild(buildRow(district, row, maxSetai));
    });
    body.appendChild(list);
    details.appendChild(body);

    listEl.appendChild(details);
  });

  updateAll();

  // 検索・ステータス絞り込み
  var searchBox = document.getElementById('searchBox');
  var statusFilter = document.getElementById('statusFilter');

  function applyFilters() {
    var q = searchBox.value.trim().toLowerCase();
    var statusQ = statusFilter.value;
    var active = !!q || !!statusQ;
    var rows = listEl.querySelectorAll('.item-row');
    rows.forEach(function (row) {
      var hitText = !q || row.dataset.search.indexOf(q) !== -1;
      var hitStatus = !statusQ || row.dataset.status === statusQ;
      row.style.display = hitText && hitStatus ? '' : 'none';
    });
    var sections = listEl.querySelectorAll('.district');
    sections.forEach(function (section) {
      var anyVisible = !!section.querySelector('.item-row:not([style*="display: none"])');
      if (active) {
        section.style.display = anyVisible ? '' : 'none';
        section.open = anyVisible;
      } else {
        section.style.display = '';
        section.open = false;
      }
    });
  }

  searchBox.addEventListener('input', applyFilters);
  statusFilter.addEventListener('change', function () {
    statusFilter.dataset.status = statusFilter.value;
    applyFilters();
  });

  // リセット（ステータスのみ解除。接触メモは残す）
  document.getElementById('resetBtn').addEventListener('click', function () {
    if (!confirm('すべての稼働・接触・希望チェックを解除します。よろしいですか？（接触メモは残ります）')) return;
    checked = {};
    save();
    listEl.querySelectorAll('.item-status').forEach(function (sel) {
      sel.value = '';
      sel.closest('.item-row').dataset.status = '';
    });
    updateAll();
  });
})();
