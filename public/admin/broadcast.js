(function () {
  let events = [];

  const eventSelect = document.getElementById('eventSelect');
  const eventDate = document.getElementById('eventDate');
  const place = document.getElementById('place');
  const timeStart = document.getElementById('timeStart');
  const timeEnd = document.getElementById('timeEnd');
  const belongings = document.getElementById('belongings');

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
      place.value = '';
      timeStart.value = '';
      timeEnd.value = '';
      belongings.value = '';
      return;
    }
    place.value = ev.place;
    timeStart.value = ev.timeStart;
    timeEnd.value = ev.timeEnd;
    belongings.value = ev.belongings;
  }

  async function fetchEvents() {
    const res = await fetch('/api/events');
    if (!res.ok) throw new Error('イベント取得に失敗しました');
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
    window.alert('イベント一覧の取得に失敗しました');
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

  // イベント登録・編集：スライドパネル
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
      eventFormTitle.textContent = 'イベントを編集';
      newEventName.value = eventToEdit.name;
      newEventPlace.value = eventToEdit.place;
      newEventTimeStart.value = eventToEdit.timeStart;
      newEventTimeEnd.value = eventToEdit.timeEnd;
      newEventBelongings.value = eventToEdit.belongings;
    } else {
      editingEventId = null;
      eventFormTitle.textContent = '新しいイベントを追加';
      newEventName.value = '';
      newEventPlace.value = '';
      newEventTimeStart.value = '';
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
      window.alert('イベント名を入力してください');
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
      window.alert('イベントの保存に失敗しました');
    } finally {
      saveButton.disabled = false;
    }
  });

  // イベント一覧：編集・削除
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
      empty.textContent = '登録されているイベントはありません';
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
          window.alert('イベントの削除に失敗しました');
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

  // メッセージ定型文
  const messageBody = document.getElementById('messageBody');

  const MESSAGE_TEMPLATES = [
    '来月の定例会議についてお知らせします。ご都合のつく方はぜひご参加ください。',
    '資源ごみ収集日のお知らせです。分別方法にご協力をお願いいたします。',
    '夏祭りの準備について、お手伝いいただける方を募集しております。',
  ];
  document.getElementById('templateButton').addEventListener('click', () => {
    const choice = window.prompt(
      '使用する定型文の番号を入力してください\n' +
        MESSAGE_TEMPLATES.map((t, i) => `${i + 1}: ${t}`).join('\n')
    );
    const index = Number(choice) - 1;
    if (MESSAGE_TEMPLATES[index]) {
      messageBody.value = MESSAGE_TEMPLATES[index];
    }
  });

  const DISASTER_TEMPLATE =
    '【緊急】災害発生に伴うご連絡です。お住まいの地域の安全を確認の上、指示があるまで自治会館付近には近づかないようお願いします。安否確認のご返信にご協力ください。';
  document.getElementById('disasterTemplateButton').addEventListener('click', () => {
    messageBody.value = DISASTER_TEMPLATE;
    document.getElementById('confirmSafety').checked = true;
  });

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
      confirmSafety: document.getElementById('confirmSafety').checked,
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

  // 出欠状況（ヘッダーのボタンから開くパネルにまとめて表示）
  const attendanceOngoingList = document.getElementById('attendanceOngoingList');
  const attendanceHistoryOverlay = document.getElementById('attendanceHistoryOverlay');
  const attendanceHistoryList = document.getElementById('attendanceHistoryList');

  function renderSessionRow(session) {
    const row = document.createElement('div');
    row.className = 'event-list-row';
    const unresponded = Math.max(0, session.totalRecipients - session.responded);
    row.innerHTML = `
      <div class="event-list-info" style="cursor:pointer;">
        <span class="event-list-name"></span>
        <span class="event-list-meta"></span>
      </div>
    `;
    row.querySelector('.event-list-name').textContent = `${session.eventName}${session.eventDate ? '（' + session.eventDate + '）' : ''}`;
    row.querySelector('.event-list-meta').textContent =
      `参加: ${session.attending}人 / 不参加: ${session.notAttending}人 / 未回答: ${unresponded}人（タップで参加者名を表示）`;

    const namesBox = document.createElement('div');
    namesBox.className = 'attendance-names';
    namesBox.hidden = true;

    let loaded = false;
    row.querySelector('.event-list-info').addEventListener('click', async () => {
      namesBox.hidden = !namesBox.hidden;
      if (namesBox.hidden || loaded) return;
      namesBox.textContent = '読み込み中...';
      try {
        const res = await fetch(`/api/attendance/sessions/${session.id}`);
        if (!res.ok) throw new Error('取得に失敗しました');
        const data = await res.json();
        const attendingNames = data.responses.filter((r) => r.status === '参加').map((r) => r.realName || '(名前未設定)');
        const notAttendingNames = data.responses.filter((r) => r.status === '不参加').map((r) => r.realName || '(名前未設定)');
        namesBox.innerHTML = `
          <div><strong>参加：</strong>${attendingNames.length ? attendingNames.join('、') : 'なし'}</div>
          <div style="margin-top:4px;"><strong>不参加：</strong>${notAttendingNames.length ? notAttendingNames.join('、') : 'なし'}</div>
        `;
        loaded = true;
      } catch (err) {
        console.error(err);
        namesBox.textContent = '取得に失敗しました';
      }
    });

    const wrapper = document.createElement('div');
    wrapper.appendChild(row);
    wrapper.appendChild(namesBox);
    return wrapper;
  }

  async function loadAttendancePanel() {
    attendanceOngoingList.innerHTML = '読み込み中...';
    attendanceHistoryList.innerHTML = '';
    try {
      const res = await fetch('/api/attendance/sessions');
      if (!res.ok) throw new Error('取得に失敗しました');
      const data = await res.json();

      attendanceOngoingList.innerHTML = '';
      if (data.ongoing.length === 0) {
        attendanceOngoingList.innerHTML = '<p class="event-list-empty">現在受付中の出欠確認はありません</p>';
      } else {
        data.ongoing.forEach((s) => attendanceOngoingList.appendChild(renderSessionRow(s)));
      }

      attendanceHistoryList.innerHTML = '';
      if (data.past.length === 0) {
        attendanceHistoryList.innerHTML = '<p class="event-list-empty">過去の出欠確認はありません</p>';
      } else {
        data.past.forEach((s) => attendanceHistoryList.appendChild(renderSessionRow(s)));
      }
    } catch (err) {
      console.error(err);
      attendanceOngoingList.innerHTML = '<p class="event-list-empty">出欠状況の取得に失敗しました</p>';
    }
  }

  document.getElementById('attendanceHeaderButton').addEventListener('click', () => {
    attendanceHistoryOverlay.classList.add('open');
    loadAttendancePanel();
  });
  document.getElementById('closeAttendanceHistoryButton').addEventListener('click', () => {
    attendanceHistoryOverlay.classList.remove('open');
  });
  attendanceHistoryOverlay.addEventListener('click', (e) => {
    if (e.target === attendanceHistoryOverlay) attendanceHistoryOverlay.classList.remove('open');
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
    } catch (err) {
      console.error(err);
      window.alert('配信に失敗しました: ' + err.message);
    } finally {
      button.disabled = false;
    }
  });
})();
