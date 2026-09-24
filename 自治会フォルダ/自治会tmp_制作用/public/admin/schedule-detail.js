(function () {
  const params = new URLSearchParams(window.location.search);
  const scheduleId = params.get('id');

  const sendDate = document.getElementById('sendDate');
  const sendTime = document.getElementById('sendTime');
  const eventSelect = document.getElementById('eventSelect');
  const eventName = document.getElementById('eventName');
  const eventDate = document.getElementById('eventDate');
  const place = document.getElementById('place');
  const timeStart = document.getElementById('timeStart');
  const timeEnd = document.getElementById('timeEnd');
  const belongings = document.getElementById('belongings');
  const groupPillGroup = document.getElementById('groupPillGroup');
  const confirmAttendance = document.getElementById('confirmAttendance');
  const messageBody = document.getElementById('messageBody');
  const templateSelect = document.getElementById('templateSelect');
  const pageTitle = document.getElementById('pageTitle');
  const statusNote = document.getElementById('statusNote');
  const deleteScheduleButton = document.getElementById('deleteScheduleButton');
  const saveScheduleButton = document.getElementById('saveScheduleButton');

  let events = [];
  let templates = [];
  let places = [];
  let currentStatus = 'pending';

  // --- 場所選択（登録された場所を選択肢として出す。既存の予約や行事に紐づく
  //     未登録の場所名が来た場合は、選べる場所が消えないよう一時的な選択肢を追加する） ---
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

  // --- 行事選択 ---
  async function fetchEvents() {
    const res = await fetch('/api/events');
    if (!res.ok) throw new Error('行事取得に失敗しました');
    const data = await res.json();
    return data.events || [];
  }

  function renderEventOptions() {
    const current = eventSelect.value;
    eventSelect.innerHTML = '<option value="">— 行事を選ばない（自由入力） —</option>';
    events.forEach((ev) => {
      const option = document.createElement('option');
      option.value = String(ev.id);
      option.textContent = ev.name;
      eventSelect.appendChild(option);
    });
    if (current) eventSelect.value = current;
  }

  function applyEventToForm(id) {
    const ev = events.find((e) => String(e.id) === String(id));
    if (!ev) return;
    eventName.value = ev.name;
    setPlaceValue(ev.place);
    timeStart.value = ev.timeStart;
    timeEnd.value = ev.timeEnd;
    belongings.value = ev.belongings;
  }

  eventSelect.addEventListener('change', () => applyEventToForm(eventSelect.value));

  // --- 行事の新規追加（配信ウィザードと同じスライドパネル） ---
  const eventSheetOverlay = document.getElementById('eventSheetOverlay');
  const newEventName = document.getElementById('newEventName');
  const newEventPlace = document.getElementById('newEventPlace');
  const newEventTimeStart = document.getElementById('newEventTimeStart');
  const newEventTimeEnd = document.getElementById('newEventTimeEnd');
  const newEventBelongings = document.getElementById('newEventBelongings');

  function openEventSheet() {
    newEventName.value = '';
    newEventPlace.value = '';
    newEventTimeStart.value = '09:00';
    newEventTimeEnd.value = '';
    newEventBelongings.value = '';
    eventSheetOverlay.classList.add('open');
  }

  function closeEventSheet() {
    eventSheetOverlay.classList.remove('open');
  }

  document.getElementById('addEventButton').addEventListener('click', openEventSheet);
  document.getElementById('cancelEventButton').addEventListener('click', closeEventSheet);
  eventSheetOverlay.addEventListener('click', (e) => {
    if (e.target === eventSheetOverlay) closeEventSheet();
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
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('追加に失敗しました');
      events = await fetchEvents();
      renderEventOptions();
      const added = events[events.length - 1];
      eventSelect.value = String(added.id);
      applyEventToForm(added.id);
      closeEventSheet();
    } catch (err) {
      console.error(err);
      window.alert('行事の保存に失敗しました');
    } finally {
      saveButton.disabled = false;
    }
  });

  // --- 対象グループ ---
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

  function setSelectedGroup(name) {
    const buttons = [...groupPillGroup.querySelectorAll('.pill-option')];
    buttons.forEach((el) => el.classList.remove('active'));
    const match = buttons.find((el) => el.dataset.group === name) || buttons[0];
    if (match) match.classList.add('active');
  }

  function renderGroupPills(fixedGroups, roleGroups, dynamicGroups, selected) {
    groupPillGroup.innerHTML = '';
    [...fixedGroups, ...roleGroups, ...dynamicGroups].forEach((name, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pill-option' + (i === 0 ? ' active' : '');
      button.dataset.group = name;
      button.textContent = name;
      groupPillGroup.appendChild(button);
    });
    if (selected) setSelectedGroup(selected);
  }

  async function fetchGroups() {
    const res = await fetch('/api/groups');
    if (!res.ok) throw new Error('グループ取得に失敗しました');
    return res.json();
  }

  // --- 定型文 ---
  function templateLabel(text) {
    return text.length > 30 ? text.slice(0, 30) + '…' : text;
  }

  function renderTemplateOptions() {
    templates.forEach((t) => {
      const option = document.createElement('option');
      option.value = String(t.id);
      option.textContent = templateLabel(t.text);
      templateSelect.appendChild(option);
    });
  }

  async function fetchTemplates() {
    const res = await fetch('/api/templates');
    if (!res.ok) throw new Error('定型文取得に失敗しました');
    const data = await res.json();
    return data.templates || [];
  }

  templateSelect.addEventListener('change', () => {
    const t = templates.find((tt) => String(tt.id) === templateSelect.value);
    if (t) messageBody.value = t.text;
  });

  // --- 既存の予約を読み込む（編集時） ---
  function applyScheduleToForm(s) {
    sendDate.value = s.sendDate || '';
    sendTime.value = s.sendTime || '';
    eventName.value = s.eventName || '';
    eventDate.value = s.eventDate || '';
    setPlaceValue(s.place || '');
    timeStart.value = s.timeStart || '';
    timeEnd.value = s.timeEnd || '';
    belongings.value = s.belongings || '';
    confirmAttendance.checked = !!s.confirmAttendance;
    messageBody.value = s.messageBody || '';
    setSelectedGroup(s.group || '全員');
    currentStatus = s.status || 'pending';

    pageTitle.textContent = '📅 予約配信の編集';
    if (currentStatus !== 'pending') {
      const label = currentStatus === 'sent' ? '配信済み' : '送信に失敗しました';
      statusNote.hidden = false;
      statusNote.textContent = `この予約は${label}です`;
      if (currentStatus === 'sent') {
        statusNote.textContent += '（配信日時を未来に変えて保存すると、もう一度「予約中」になり、使い回せます）';
        saveScheduleButton.textContent = 'この内容で保存する';
      }
    }
    deleteScheduleButton.hidden = false;
  }

  async function loadExistingSchedule() {
    const res = await fetch(`/api/schedule/${scheduleId}`);
    if (!res.ok) throw new Error('予約の取得に失敗しました');
    const data = await res.json();
    applyScheduleToForm(data.schedule);
  }

  // --- 保存・削除 ---
  function collectFields() {
    return {
      sendDate: sendDate.value,
      sendTime: sendTime.value,
      eventName: eventName.value.trim(),
      eventDate: eventDate.value,
      place: place.value,
      timeStart: timeStart.value,
      timeEnd: timeEnd.value,
      belongings: belongings.value,
      group: getSelectedGroup(),
      confirmAttendance: confirmAttendance.checked,
      messageBody: messageBody.value,
    };
  }

  saveScheduleButton.addEventListener('click', async () => {
    const fields = collectFields();
    if (!fields.sendDate || !fields.sendTime) {
      window.alert('配信予定日時を指定してください');
      return;
    }
    if (!fields.eventName && !fields.messageBody) {
      window.alert('行事名かメッセージ内容のどちらかを入力してください');
      return;
    }
    saveScheduleButton.disabled = true;
    try {
      const res = await fetch(scheduleId ? `/api/schedule/${scheduleId}` : '/api/schedule', {
        method: scheduleId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');
      window.location.href = 'schedule.html';
    } catch (err) {
      console.error(err);
      window.alert('予約の保存に失敗しました: ' + err.message);
      saveScheduleButton.disabled = false;
    }
  });

  deleteScheduleButton.addEventListener('click', async () => {
    if (!scheduleId) return;
    if (!window.confirm('この予約を削除しますか？')) return;
    try {
      const res = await fetch(`/api/schedule/${scheduleId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除に失敗しました');
      window.location.href = 'schedule.html';
    } catch (err) {
      console.error(err);
      window.alert('予約の削除に失敗しました');
    }
  });

  // --- 初期化 ---
  async function init() {
    try {
      events = await fetchEvents();
      renderEventOptions();
    } catch (err) {
      console.error(err);
    }

    try {
      await refreshPlaces();
    } catch (err) {
      console.error(err);
    }

    try {
      templates = await fetchTemplates();
      renderTemplateOptions();
    } catch (err) {
      console.error(err);
    }

    try {
      const groupsData = await fetchGroups();
      renderGroupPills(groupsData.fixedGroups, groupsData.roleGroups, groupsData.dynamicGroups);
    } catch (err) {
      console.error(err);
    }

    if (scheduleId) {
      try {
        await loadExistingSchedule();
      } catch (err) {
        console.error(err);
        window.alert('予約の取得に失敗しました');
      }
    } else {
      // 新規作成時は今日の日付・9時をデフォルトにしておく
      const today = new Date().toISOString().slice(0, 10);
      sendDate.value = today;
      sendTime.value = '09:00';
    }
  }

  init();
})();
