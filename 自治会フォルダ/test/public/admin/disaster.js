(function () {
  const baseNameInput = document.getElementById('baseNameInput');
  const baseAddressInput = document.getElementById('baseAddressInput');
  const baseCheckButton = document.getElementById('baseCheckButton');
  const baseMapDiv = document.getElementById('baseMap');
  const baseMapHint = document.getElementById('baseMapHint');
  const baseSaveButton = document.getElementById('baseSaveButton');

  const shelterNameInput = document.getElementById('shelterNameInput');
  const shelterAddressInput = document.getElementById('shelterAddressInput');
  const shelterCheckButton = document.getElementById('shelterCheckButton');
  const shelterMapDiv = document.getElementById('shelterMap');
  const shelterMapHint = document.getElementById('shelterMapHint');
  const shelterAddButton = document.getElementById('shelterAddButton');

  const shelterListContainer = document.getElementById('shelterListContainer');

  let baseMap = null;
  let baseMarker = null;
  let baseCoords = null;
  let shelterMap = null;
  let shelterMarker = null;
  let shelterCoords = null;
  let editingShelterRow = null;

  // 国土地理院の無料の住所検索サービスで、住所を緯度経度に変換する（日本の細かい住所（丁目・番地）に強い）
  async function geocodeWithGsi(address) {
    const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const results = await res.json();
    if (!results || results.length === 0) return null;
    const [lng, lat] = results[0].geometry.coordinates;
    return { lat, lng };
  }

  // 国土地理院で見つからなかった場合の予備として、OpenStreetMapでも探してみる
  async function geocodeWithNominatim(address) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp&q=${encodeURIComponent(address)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const results = await res.json();
    if (!results || results.length === 0) return null;
    return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
  }

  async function geocodeAddress(address) {
    const gsiResult = await geocodeWithGsi(address);
    if (gsiResult) return gsiResult;
    const nominatimResult = await geocodeWithNominatim(address);
    if (nominatimResult) return nominatimResult;
    throw new Error('見つかりませんでした');
  }

  async function checkAddress({ addressInput, mapDiv, hintEl, saveButton, getMap, setMap, getMarker, setMarker, setCoords }) {
    const address = addressInput.value.trim();
    if (!address) {
      hintEl.textContent = '住所を入力してください';
      return;
    }
    hintEl.textContent = '確認中…';
    saveButton.disabled = true;
    try {
      const coords = await geocodeAddress(address);
      setCoords(coords);
      mapDiv.hidden = false;
      let map = getMap();
      if (!map) {
        map = L.map(mapDiv).setView([coords.lat, coords.lng], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        setMap(map);
        const marker = L.marker([coords.lat, coords.lng]).addTo(map);
        setMarker(marker);
      } else {
        map.setView([coords.lat, coords.lng], 16);
        getMarker().setLatLng([coords.lat, coords.lng]);
        map.invalidateSize();
      }
      hintEl.textContent = 'この場所でよければ下のボタンで登録してください';
      saveButton.disabled = false;
    } catch (err) {
      console.error(err);
      hintEl.textContent = '住所から場所を見つけられませんでした。住所を見直してください';
      saveButton.disabled = true;
    }
  }

  baseCheckButton.addEventListener('click', () => checkAddress({
    addressInput: baseAddressInput,
    mapDiv: baseMapDiv,
    hintEl: baseMapHint,
    saveButton: baseSaveButton,
    getMap: () => baseMap,
    setMap: (m) => { baseMap = m; },
    getMarker: () => baseMarker,
    setMarker: (m) => { baseMarker = m; },
    setCoords: (c) => { baseCoords = c; },
  }));

  shelterCheckButton.addEventListener('click', () => checkAddress({
    addressInput: shelterAddressInput,
    mapDiv: shelterMapDiv,
    hintEl: shelterMapHint,
    saveButton: shelterAddButton,
    getMap: () => shelterMap,
    setMap: (m) => { shelterMap = m; },
    getMarker: () => shelterMarker,
    setMarker: (m) => { shelterMarker = m; },
    setCoords: (c) => { shelterCoords = c; },
  }));

  // 住所を書き換えたら、地図の位置とズレたまま保存されないように確認し直しを必須にする
  baseAddressInput.addEventListener('input', () => {
    if (baseCoords === null) return;
    baseCoords = null;
    baseSaveButton.disabled = true;
    baseMapHint.textContent = '住所を変更しました。もう一度「地図で確認する」を押してください';
  });

  shelterAddressInput.addEventListener('input', () => {
    if (shelterCoords === null) return;
    shelterCoords = null;
    shelterAddButton.disabled = true;
    shelterMapHint.textContent = '住所を変更しました。もう一度「地図で確認する」を押してください';
  });

  baseSaveButton.addEventListener('click', async () => {
    if (!baseCoords) return;
    baseSaveButton.disabled = true;
    try {
      const res = await fetch('/api/disaster/base', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: baseNameInput.value.trim(),
          address: baseAddressInput.value.trim(),
          lat: baseCoords.lat,
          lng: baseCoords.lng,
        }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      baseMapHint.textContent = '保存しました';
      window.alert('拠点を保存しました');
    } catch (err) {
      console.error(err);
      baseMapHint.textContent = '保存に失敗しました';
      window.alert('保存に失敗しました');
    } finally {
      baseSaveButton.disabled = false;
    }
  });

  const shelterCancelEditLink = document.getElementById('shelterCancelEditLink');

  function stopEditShelter() {
    editingShelterRow = null;
    shelterNameInput.value = '';
    shelterAddressInput.value = '';
    shelterMapDiv.hidden = true;
    shelterMapHint.textContent = '';
    shelterCoords = null;
    shelterAddButton.textContent = 'この内容で追加する';
    shelterAddButton.disabled = true;
    shelterCancelEditLink.hidden = true;
  }

  function startEditShelter(s) {
    editingShelterRow = s.row;
    shelterNameInput.value = s.name;
    shelterAddressInput.value = s.address;
    shelterCoords = { lat: s.lat, lng: s.lng };
    shelterMapDiv.hidden = false;
    if (!shelterMap) {
      shelterMap = L.map(shelterMapDiv).setView([s.lat, s.lng], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(shelterMap);
      shelterMarker = L.marker([s.lat, s.lng]).addTo(shelterMap);
    } else {
      shelterMap.setView([s.lat, s.lng], 16);
      shelterMarker.setLatLng([s.lat, s.lng]);
      shelterMap.invalidateSize();
    }
    shelterMapHint.textContent = '内容を確認・修正して「この内容で更新する」を押してください';
    shelterAddButton.disabled = false;
    shelterAddButton.textContent = 'この内容で更新する';
    shelterCancelEditLink.hidden = false;
    shelterNameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  shelterCancelEditLink.addEventListener('click', (e) => {
    e.preventDefault();
    stopEditShelter();
  });

  shelterAddButton.addEventListener('click', async () => {
    if (!shelterCoords) return;
    const name = shelterNameInput.value.trim();
    if (!name) {
      window.alert('避難所の名称を入力してください');
      return;
    }
    shelterAddButton.disabled = true;
    const isEditing = !!editingShelterRow;
    try {
      const res = await fetch(
        isEditing ? `/api/disaster/shelters/${editingShelterRow}` : '/api/disaster/shelters',
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            address: shelterAddressInput.value.trim(),
            lat: shelterCoords.lat,
            lng: shelterCoords.lng,
          }),
        }
      );
      if (!res.ok) throw new Error(isEditing ? '更新に失敗しました' : '追加に失敗しました');
      stopEditShelter();
      await loadShelterList();
      window.alert(isEditing ? '避難所を更新しました' : '避難所を追加しました');
    } catch (err) {
      console.error(err);
      window.alert(isEditing ? '更新に失敗しました' : '追加に失敗しました');
    } finally {
      shelterAddButton.disabled = false;
    }
  });

  async function loadShelterList() {
    shelterListContainer.innerHTML = '読み込み中...';
    try {
      const res = await fetch('/api/disaster');
      if (!res.ok) throw new Error('取得に失敗しました');
      const data = await res.json();

      if (data.base) {
        baseNameInput.value = data.base.name;
        baseAddressInput.value = data.base.address;
      }

      shelterListContainer.innerHTML = '';
      if (!data.shelters || data.shelters.length === 0) {
        shelterListContainer.innerHTML = '<p class="event-list-empty">まだ避難所が登録されていません</p>';
        return;
      }

      data.shelters.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'transaction-row';
        row.innerHTML = `
          <div class="transaction-info">
            <span class="transaction-desc"></span>
            <span class="transaction-date"></span>
          </div>
          <button type="button" class="transaction-delete" style="background:var(--input-bg);color:var(--text);margin-right:6px;">編集</button>
          <button type="button" class="transaction-delete">削除</button>
        `;
        row.querySelector('.transaction-desc').textContent = s.name;
        row.querySelector('.transaction-date').textContent = s.address;
        const [editBtn, deleteBtn] = row.querySelectorAll('.transaction-delete');
        editBtn.addEventListener('click', () => startEditShelter(s));
        deleteBtn.addEventListener('click', async () => {
          if (!window.confirm(`「${s.name}」を削除しますか？`)) return;
          try {
            const delRes = await fetch(`/api/disaster/shelters/${s.row}`, { method: 'DELETE' });
            if (!delRes.ok) throw new Error('削除に失敗しました');
            await loadShelterList();
          } catch (err) {
            console.error(err);
            window.alert('削除に失敗しました');
          }
        });
        shelterListContainer.appendChild(row);
      });
    } catch (err) {
      console.error(err);
      shelterListContainer.innerHTML = '<p class="event-list-empty">避難所一覧の取得に失敗しました</p>';
    }
  }

  loadShelterList();
})();
