(function () {
  const newPlaceName = document.getElementById('newPlaceName');
  const newPlaceAddress = document.getElementById('newPlaceAddress');
  const addPlaceButton = document.getElementById('addPlaceButton');
  const placeListContainer = document.getElementById('placeListContainer');

  async function fetchPlaces() {
    const res = await fetch('/api/places');
    if (!res.ok) throw new Error('場所取得に失敗しました');
    const data = await res.json();
    return data.places || [];
  }

  async function loadPlaces() {
    placeListContainer.innerHTML = '読み込み中...';
    try {
      const places = await fetchPlaces();
      renderPlaceList(places);
    } catch (err) {
      console.error(err);
      placeListContainer.innerHTML = '<p class="event-list-empty">場所の取得に失敗しました</p>';
    }
  }

  function renderPlaceList(places) {
    placeListContainer.innerHTML = '';
    if (places.length === 0) {
      placeListContainer.innerHTML = '<p class="event-list-empty">登録されている場所はありません</p>';
      return;
    }
    places.forEach((p) => placeListContainer.appendChild(renderPlaceRow(p)));
  }

  function renderPlaceRow(p) {
    const row = document.createElement('div');
    row.className = 'place-row';

    const nameWrap = document.createElement('div');
    nameWrap.className = 'place-row-name';

    const nameEl = document.createElement('div');
    nameEl.textContent = p.name;
    nameWrap.appendChild(nameEl);

    const addressEl = document.createElement('div');
    addressEl.className = 'place-row-address';
    addressEl.textContent = p.address || '';
    addressEl.hidden = !p.address;
    nameWrap.appendChild(addressEl);

    const editInput = document.createElement('input');
    editInput.type = 'text';
    editInput.className = 'text-input place-edit-input';
    editInput.value = p.name;
    editInput.placeholder = '場所の名前';
    editInput.hidden = true;

    const editAddressInput = document.createElement('input');
    editAddressInput.type = 'text';
    editAddressInput.className = 'text-input place-edit-input';
    editAddressInput.value = p.address || '';
    editAddressInput.placeholder = '住所（任意）';
    editAddressInput.hidden = true;

    const editWrap = document.createElement('div');
    editWrap.className = 'place-edit-wrap';
    editWrap.hidden = true;
    editWrap.appendChild(editInput);
    editWrap.appendChild(editAddressInput);

    const actions = document.createElement('div');
    actions.className = 'place-row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'word-button';
    editBtn.textContent = '編集';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'word-button';
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
      nameWrap.hidden = true;
      editWrap.hidden = false;
      editInput.value = p.name;
      editAddressInput.value = p.address || '';
      editBtn.hidden = true;
      deleteBtn.hidden = true;
      saveBtn.hidden = false;
      cancelBtn.hidden = false;
    }

    function exitEditMode() {
      row.classList.remove('editing');
      nameWrap.hidden = false;
      editWrap.hidden = true;
      editBtn.hidden = false;
      deleteBtn.hidden = false;
      saveBtn.hidden = true;
      cancelBtn.hidden = true;
    }

    editBtn.addEventListener('click', enterEditMode);
    cancelBtn.addEventListener('click', exitEditMode);

    saveBtn.addEventListener('click', async () => {
      const name = editInput.value.trim();
      const address = editAddressInput.value.trim();
      if (!name) {
        window.alert('場所の名前を入力してください');
        return;
      }
      saveBtn.disabled = true;
      try {
        const res = await fetch(`/api/places/${p.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, address }),
        });
        if (!res.ok) throw new Error('更新に失敗しました');
        p.name = name;
        p.address = address;
        nameEl.textContent = name;
        addressEl.textContent = address;
        addressEl.hidden = !address;
        exitEditMode();
      } catch (err) {
        console.error(err);
        window.alert('場所の更新に失敗しました');
      } finally {
        saveBtn.disabled = false;
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm(`「${p.name}」を削除しますか？`)) return;
      try {
        const res = await fetch(`/api/places/${p.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('削除に失敗しました');
        await loadPlaces();
      } catch (err) {
        console.error(err);
        window.alert('場所の削除に失敗しました');
      }
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);

    row.appendChild(nameWrap);
    row.appendChild(editWrap);
    row.appendChild(actions);
    return row;
  }

  addPlaceButton.addEventListener('click', async () => {
    const name = newPlaceName.value.trim();
    const address = newPlaceAddress.value.trim();
    if (!name) {
      window.alert('場所の名前を入力してください');
      return;
    }
    addPlaceButton.disabled = true;
    try {
      const res = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address }),
      });
      if (!res.ok) throw new Error('追加に失敗しました');
      newPlaceName.value = '';
      newPlaceAddress.value = '';
      await loadPlaces();
    } catch (err) {
      console.error(err);
      window.alert('場所の追加に失敗しました');
    } finally {
      addPlaceButton.disabled = false;
    }
  });

  loadPlaces();
})();
