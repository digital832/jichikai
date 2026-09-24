(function () {
  let events = [];

  const menuToggleButton = document.getElementById('menuToggleButton');
  const menuDropdownPanel = document.getElementById('menuDropdownPanel');
  menuToggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menuDropdownPanel.classList.toggle('open');
    menuToggleButton.setAttribute('aria-expanded', String(isOpen));
  });
  menuDropdownPanel.addEventListener('click', () => {
    menuDropdownPanel.classList.remove('open');
    menuToggleButton.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', (e) => {
    if (!menuDropdownPanel.classList.contains('open')) return;
    if (e.target === menuToggleButton || menuDropdownPanel.contains(e.target)) return;
    menuDropdownPanel.classList.remove('open');
    menuToggleButton.setAttribute('aria-expanded', 'false');
  });

  const eventSelect = document.getElementById('eventSelect');
  const eventDate = document.getElementById('eventDate');
  const place = document.getElementById('place');
  const timeStart = document.getElementById('timeStart');
  const timeEnd = document.getElementById('timeEnd');
  const belongings = document.getElementById('belongings');

  // 場所マスタ（登録された場所を選択肢として出す。行事に紐づく未登録の場所名が来た場合は、
  // 選べる場所が消えてしまわないよう一時的な選択肢として追加する）
  let places = [];

  async function fetchPlaces() {
    const res = await fetch('/api/places');
    if (!res.ok) throw new Error('場所取得に失敗しました');
    const data = await res.json();
    return data.places || [];
  }

  function renderPlaceOptions() {
    place.innerHTML = '';
    places.forEach((p) => {
      const option = document.createElement('option');
      option.value = p.name;
      option.textContent = p.name;
      place.appendChild(option);
    });
  }

  function setPlaceValue(name) {
    const value = name || '';
    const hasOption = [...place.options].some((o) => o.value === value);
    if (value && !hasOption) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      place.appendChild(option);
    } else if (!value && ![...place.options].some((o) => o.value === '')) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '（場所未設定）';
      place.appendChild(option);
    }
    place.value = value;
  }

  async function refreshPlaces() {
    places = await fetchPlaces();
    const current = place.value;
    renderPlaceOptions();
    setPlaceValue(current);
  }

  refreshPlaces().catch((err) => {
    console.error(err);
    window.alert('場所一覧の取得に失敗しました');
  });

  function findEvent(id) {
    return events.find((e) => e.id === id);
  }

  function renderEventOptions(selectId) {
    eventSelect.innerHTML = '';
    events.forEach((ev) => {
      const option = document.createElement('option');
      option.value = String(ev.id);
      option.textContent = ev.name;
      eventSelect.appendChild(option);
    });
    if (selectId != null) eventSelect.value = String(selectId);
  }

  function applyEventToForm(id) {
    const ev = findEvent(id);
    if (!ev) {
      setPlaceValue('');
      timeStart.value = '';
      timeEnd.value = '';
      belongings.value = '';
      return;
    }
    setPlaceValue(ev.place);
    timeStart.value = ev.timeStart;
    timeEnd.value = ev.timeEnd;
    belongings.value = ev.belongings;
  }

  async function fetchEvents() {
    const res = await fetch('/api/events');
    if (!res.ok) throw new Error('行事取得に失敗しました');
    const data = await res.json();
    return data.events || [];
  }

  async function refreshEvents(selectId) {
    events = await fetchEvents();
    renderEventOptions(selectId != null ? selectId : (events[0] ? events[0].id : null));
    applyEventToForm(Number(eventSelect.value));
  }

  eventSelect.addEventListener('change', () => applyEventToForm(Number(eventSelect.value)));

  refreshEvents().catch((err) => {
    console.error(err);
    window.alert('行事一覧の取得に失敗しました');
  });

  // 対象グループのピル選択（固定3つ＋管理地区フォルダから取得した班名を動的表示）
  const groupPillGroup = document.getElementById('groupPillGroup');
  groupPillGroup.addEventListener('click', (e) => {
    const button = e.target.closest('.pill-option');
    if (!button) return;
    groupPillGroup.querySelectorAll('.pill-option').forEach((el) => el.classList.remove('active'));
    button.classList.add('active');
  });

  function getSelectedGroup() {
    const active = groupPillGroup.querySelector('.pill-option.active');
    return active ? active.dataset.group : '全員';
  }

  function renderGroupPills(fixedGroups, roleGroups, dynamicGroups) {
    groupPillGroup.innerHTML = '';
    [...fixedGroups, ...roleGroups, ...dynamicGroups].forEach((name, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pill-option' + (i === 0 ? ' active' : '');
      button.dataset.group = name;
      button.textContent = name;
      groupPillGroup.appendChild(button);
    });
  }

  async function fetchGroups() {
    const res = await fetch('/api/groups');
    if (!res.ok) throw new Error('グループ取得に失敗しました');
    return res.json();
  }

  fetchGroups()
    .then((data) => renderGroupPills(data.fixedGroups, data.roleGroups, data.dynamicGroups))
    .catch((err) => console.error(err));

  document.getElementById('syncGroupsLink').addEventListener('click', async (e) => {
    e.preventDefault();
    const link = e.currentTarget;
    link.textContent = '更新中...';
    try {
      const res = await fetch('/api/groups/sync', { method: 'POST' });
      if (!res.ok) throw new Error('同期に失敗しました');
      const data = await fetchGroups();
      renderGroupPills(data.fixedGroups, data.roleGroups, data.dynamicGroups);
    } catch (err) {
      console.error(err);
      window.alert('班の一覧の更新に失敗しました');
    } finally {
      link.textContent = '班の一覧を更新';
    }
  });

  // 行事登録・編集：スライドパネル
  const overlay = document.getElementById('eventSheetOverlay');
  const eventFormTitle = document.getElementById('eventFormTitle');
  const newEventName = document.getElementById('newEventName');
  const newEventPlace = document.getElementById('newEventPlace');
  const newEventTimeStart = document.getElementById('newEventTimeStart');
  const newEventTimeEnd = document.getElementById('newEventTimeEnd');
  const newEventBelongings = document.getElementById('newEventBelongings');
  let editingEventId = null;

  function openSheet(eventToEdit) {
    if (eventToEdit) {
      editingEventId = eventToEdit.id;
      eventFormTitle.textContent = '行事を編集';
      newEventName.value = eventToEdit.name;
      newEventPlace.value = eventToEdit.place;
      newEventTimeStart.value = eventToEdit.timeStart;
      newEventTimeEnd.value = eventToEdit.timeEnd;
      newEventBelongings.value = eventToEdit.belongings;
    } else {
      editingEventId = null;
      eventFormTitle.textContent = '新しい行事を追加';
      newEventName.value = '';
      newEventPlace.value = '';
      newEventTimeStart.value = '09:00';
      newEventTimeEnd.value = '';
      newEventBelongings.value = '';
    }
    overlay.classList.add('open');
  }

  function closeSheet() {
    overlay.classList.remove('open');
  }

  document.getElementById('addEventButton').addEventListener('click', () => openSheet());
  document.getElementById('cancelEventButton').addEventListener('click', closeSheet);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSheet();
  });

  document.getElementById('saveEventButton').addEventListener('click', async () => {
    const name = newEventName.value.trim();
    if (!name) {
      window.alert('行事名を入力してください');
      return;
    }
    const fields = {
      name,
      place: newEventPlace.value.trim(),
      timeStart: newEventTimeStart.value,
      timeEnd: newEventTimeEnd.value,
      belongings: newEventBelongings.value.trim(),
    };

    const saveButton = document.getElementById('saveEventButton');
    saveButton.disabled = true;
    try {
      if (editingEventId != null) {
        const res = await fetch(`/api/events/${editingEventId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        if (!res.ok) throw new Error('更新に失敗しました');
        await refreshEvents(editingEventId);
      } else {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        if (!res.ok) throw new Error('追加に失敗しました');
        await refreshEvents();
        eventSelect.value = String(events[events.length - 1].id);
        applyEventToForm(Number(eventSelect.value));
      }
      renderEventList();
      closeSheet();
    } catch (err) {
      console.error(err);
      window.alert('行事の保存に失敗しました');
    } finally {
      saveButton.disabled = false;
    }
  });

  // 行事一覧：編集・削除
  const listOverlay = document.getElementById('eventListOverlay');
  const eventListContainer = document.getElementById('eventListContainer');

  function formatEventMeta(ev) {
    const time = ev.timeStart && ev.timeEnd ? `${ev.timeStart}〜${ev.timeEnd}` : '';
    return [ev.place, time].filter(Boolean).join(' / ') || '詳細未設定';
  }

  function renderEventList() {
    eventListContainer.innerHTML = '';
    if (events.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'event-list-empty';
      empty.textContent = '登録されている行事はありません';
      eventListContainer.appendChild(empty);
      return;
    }
    events.forEach((ev) => {
      const row = document.createElement('div');
      row.className = 'event-list-row';
      row.innerHTML = `
        <div class="event-list-info">
          <span class="event-list-name"></span>
          <span class="event-list-meta"></span>
        </div>
        <div class="event-list-actions">
          <button type="button" class="edit-btn">編集</button>
          <button type="button" class="delete-btn">削除</button>
        </div>
      `;
      row.querySelector('.event-list-name').textContent = ev.name;
      row.querySelector('.event-list-meta').textContent = formatEventMeta(ev);
      row.querySelector('.edit-btn').addEventListener('click', () => {
        listOverlay.classList.remove('open');
        openSheet(ev);
      });
      row.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!window.confirm(`「${ev.name}」を削除しますか？`)) return;
        try {
          const res = await fetch(`/api/events/${ev.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('削除に失敗しました');
          await refreshEvents();
          renderEventList();
        } catch (err) {
          console.error(err);
          window.alert('行事の削除に失敗しました');
        }
      });
      eventListContainer.appendChild(row);
    });
  }

  document.getElementById('manageEventsButton').addEventListener('click', () => {
    renderEventList();
    listOverlay.classList.add('open');
  });
  document.getElementById('closeEventListButton').addEventListener('click', () => {
    listOverlay.classList.remove('open');
  });
  listOverlay.addEventListener('click', (e) => {
    if (e.target === listOverlay) listOverlay.classList.remove('open');
  });
  document.getElementById('addEventFromListButton').addEventListener('click', () => {
    listOverlay.classList.remove('open');
    openSheet();
  });

  // メッセージ定型文（データベースに保存された定型文をドロップダウンから選ぶ）
  const messageBody = document.getElementById('messageBody');
  const templateSelect = document.getElementById('templateSelect');
  let templates = [];

  function findTemplate(id) {
    return templates.find((t) => t.id === id);
  }

  function templateLabel(text) {
    return text.length > 30 ? text.slice(0, 30) + '…' : text;
  }

  function renderTemplateOptions(selectId) {
    templateSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— 定型文を選ぶ —';
    templateSelect.appendChild(placeholder);
    templates.forEach((t) => {
      const option = document.createElement('option');
      option.value = String(t.id);
      option.textContent = templateLabel(t.text);
      templateSelect.appendChild(option);
    });
    templateSelect.value = selectId != null ? String(selectId) : '';
  }

  async function fetchTemplates() {
    const res = await fetch('/api/templates');
    if (!res.ok) throw new Error('定型文取得に失敗しました');
    const data = await res.json();
    return data.templates || [];
  }

  async function refreshTemplates(selectId) {
    templates = await fetchTemplates();
    renderTemplateOptions(selectId);
  }

  refreshTemplates().catch((err) => {
    console.error(err);
    window.alert('定型文一覧の取得に失敗しました');
  });

  templateSelect.addEventListener('change', () => {
    const t = findTemplate(Number(templateSelect.value));
    if (t) messageBody.value = t.text;
  });

  function resetForm() {
    eventDate.value = '';
    applyEventToForm(Number(eventSelect.value));
    messageBody.value = '';
    renderTemplateOptions();
    document.getElementById('confirmAttendance').checked = false;
    groupPillGroup.querySelectorAll('.pill-option').forEach((el, i) => el.classList.toggle('active', i === 0));
  }

  document.getElementById('printFolderLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.alert('印刷フォルダのURLが未設定です。管理者に設定を依頼してください。');
  });

  function collectFields() {
    const selectedEvent = findEvent(Number(eventSelect.value));
    return {
      group: getSelectedGroup(),
      eventName: selectedEvent ? selectedEvent.name : '',
      eventDate: eventDate.value,
      place: place.value,
      timeStart: timeStart.value,
      timeEnd: timeEnd.value,
      belongings: belongings.value,
      messageBody: messageBody.value,
      confirmAttendance: document.getElementById('confirmAttendance').checked,
    };
  }

  document.getElementById('wordSaveButton').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    try {
      const res = await fetch('/api/broadcast/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectFields()),
      });
      if (!res.ok) throw new Error('Word生成に失敗しました');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'announcement.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      window.alert('Wordファイルの作成に失敗しました');
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById('lineSendButton').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    if (!window.confirm('この内容でLINE配信します。よろしいですか？')) return;
    button.disabled = true;
    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectFields()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '配信に失敗しました');
      window.alert(
        `${data.successCount}件に送信しました。` +
          (data.skippedNoToken ? `\nトークン未設定のため送信できなかった会員: ${data.skippedNoToken}件` : '') +
          (data.failedAccountCount ? `\n送信に失敗したアカウント数: ${data.failedAccountCount}` : '')
      );
      if (data.attendanceSessionId) loadAttendancePanel();
      resetForm();
    } catch (err) {
      console.error(err);
      window.alert('配信に失敗しました: ' + err.message);
    } finally {
      button.disabled = false;
    }
  });
})();
