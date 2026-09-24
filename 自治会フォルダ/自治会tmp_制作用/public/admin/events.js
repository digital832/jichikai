(function () {
  const newEventName = document.getElementById('newEventName');
  const newEventPlace = document.getElementById('newEventPlace');
  const newEventTimeStart = document.getElementById('newEventTimeStart');
  const newEventTimeEnd = document.getElementById('newEventTimeEnd');
  const newEventBelongings = document.getElementById('newEventBelongings');
  const addEventButton = document.getElementById('addEventButton');
  const eventListContainer = document.getElementById('eventListContainer');

  function metaText(e) {
    const parts = [];
    if (e.place) parts.push(`📍 ${e.place}`);
    if (e.timeStart || e.timeEnd) parts.push(`🕐 ${e.timeStart || ''}〜${e.timeEnd || ''}`);
    if (e.belongings) parts.push(`🗑 ${e.belongings}`);
    return parts.join('　');
  }

  async function fetchEvents() {
    const res = await fetch('/api/events');
    if (!res.ok) throw new Error('行事取得に失敗しました');
    const data = await res.json();
    return data.events || [];
  }

  async function loadEvents() {
    eventListContainer.innerHTML = '読み込み中...';
    try {
      const events = await fetchEvents();
      renderEventList(events);
    } catch (err) {
      console.error(err);
      eventListContainer.innerHTML = '<p class="event-list-empty">行事の取得に失敗しました</p>';
    }
  }

  function renderEventList(events) {
    eventListContainer.innerHTML = '';
    if (events.length === 0) {
      eventListContainer.innerHTML = '<p class="event-list-empty">登録されている行事はありません</p>';
      return;
    }
    events.forEach((e) => eventListContainer.appendChild(renderEventRow(e)));
  }

  function renderEventRow(e) {
    const row = document.createElement('div');
    row.className = 'event-list-row';

    const info = document.createElement('div');
    info.className = 'event-list-info';

    const nameEl = document.createElement('span');
    nameEl.className = 'event-list-name';
    nameEl.textContent = e.name;

    const metaEl = document.createElement('span');
    metaEl.className = 'event-list-meta';
    metaEl.textContent = metaText(e);

    info.appendChild(nameEl);
    info.appendChild(metaEl);

    const editNameInput = document.createElement('input');
    editNameInput.type = 'text';
    editNameInput.className = 'text-input place-edit-input';
    editNameInput.value = e.name;
    editNameInput.placeholder = '行事名';
    editNameInput.hidden = true;

    const editPlaceInput = document.createElement('input');
    editPlaceInput.type = 'text';
    editPlaceInput.className = 'text-input place-edit-input';
    editPlaceInput.value = e.place || '';
    editPlaceInput.placeholder = '場所（任意）';
    editPlaceInput.hidden = true;

    const editTimeWrap = document.createElement('div');
    editTimeWrap.className = 'time-range';
    editTimeWrap.hidden = true;
    const editTimeStartInput = document.createElement('input');
    editTimeStartInput.type = 'time';
    editTimeStartInput.className = 'time-input';
    editTimeStartInput.step = '900';
    editTimeStartInput.value = e.timeStart || '';
    const editTimeSep = document.createElement('span');
    editTimeSep.textContent = '〜';
    const editTimeEndInput = document.createElement('input');
    editTimeEndInput.type = 'time';
    editTimeEndInput.className = 'time-input';
    editTimeEndInput.step = '900';
    editTimeEndInput.value = e.timeEnd || '';
    editTimeWrap.appendChild(editTimeStartInput);
    editTimeWrap.appendChild(editTimeSep);
    editTimeWrap.appendChild(editTimeEndInput);

    const editBelongingsInput = document.createElement('input');
    editBelongingsInput.type = 'text';
    editBelongingsInput.className = 'text-input place-edit-input';
    editBelongingsInput.value = e.belongings || '';
    editBelongingsInput.placeholder = '持ち物（任意）';
    editBelongingsInput.hidden = true;

    const editWrap = document.createElement('div');
    editWrap.className = 'place-edit-wrap';
    editWrap.hidden = true;
    editWrap.appendChild(editNameInput);
    editWrap.appendChild(editPlaceInput);
    editWrap.appendChild(editTimeWrap);
    editWrap.appendChild(editBelongingsInput);

    const actions = document.createElement('div');
    actions.className = 'event-list-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-btn';
    editBtn.textContent = '編集';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '削除';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'send-button';
    saveBtn.textContent = '保存';
    saveBtn.hidden = true;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'word-button';
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.hidden = true;

    function enterEditMode() {
      row.classList.add('editing');
      info.hidden = true;
      editWrap.hidden = false;
      editTimeWrap.hidden = false;
      editNameInput.hidden = false;
      editPlaceInput.hidden = false;
      editBelongingsInput.hidden = false;
      editNameInput.value = e.name;
      editPlaceInput.value = e.place || '';
      editTimeStartInput.value = e.timeStart || '';
      editTimeEndInput.value = e.timeEnd || '';
      editBelongingsInput.value = e.belongings || '';
      editBtn.hidden = true;
      deleteBtn.hidden = true;
      saveBtn.hidden = false;
      cancelBtn.hidden = false;
    }

    function exitEditMode() {
      row.classList.remove('editing');
      info.hidden = false;
      editWrap.hidden = true;
      editBtn.hidden = false;
      deleteBtn.hidden = false;
      saveBtn.hidden = true;
      cancelBtn.hidden = true;
    }

    editBtn.addEventListener('click', enterEditMode);
    cancelBtn.addEventListener('click', exitEditMode);

    saveBtn.addEventListener('click', async () => {
      const name = editNameInput.value.trim();
      if (!name) {
        window.alert('行事名を入力してください');
        return;
      }
      const fields = {
        name,
        place: editPlaceInput.value.trim(),
        timeStart: editTimeStartInput.value,
        timeEnd: editTimeEndInput.value,
        belongings: editBelongingsInput.value.trim(),
      };
      saveBtn.disabled = true;
      try {
        const res = await fetch(`/api/events/${e.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fields),
        });
        if (!res.ok) throw new Error('更新に失敗しました');
        Object.assign(e, fields);
        nameEl.textContent = e.name;
        metaEl.textContent = metaText(e);
        exitEditMode();
      } catch (err) {
        console.error(err);
        window.alert('行事の更新に失敗しました');
      } finally {
        saveBtn.disabled = false;
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm(`「${e.name}」を削除しますか？`)) return;
      try {
        const res = await fetch(`/api/events/${e.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('削除に失敗しました');
        await loadEvents();
      } catch (err) {
        console.error(err);
        window.alert('行事の削除に失敗しました');
      }
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);

    row.appendChild(info);
    row.appendChild(editWrap);
    row.appendChild(actions);
    return row;
  }

  addEventButton.addEventListener('click', async () => {
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
    addEventButton.disabled = true;
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('追加に失敗しました');
      newEventName.value = '';
      newEventPlace.value = '';
      newEventTimeStart.value = '';
      newEventTimeEnd.value = '';
      newEventBelongings.value = '';
      await loadEvents();
    } catch (err) {
      console.error(err);
      window.alert('行事の追加に失敗しました');
    } finally {
      addEventButton.disabled = false;
    }
  });

  loadEvents();
})();
