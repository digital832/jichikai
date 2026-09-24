(function () {
  const DISASTER_TEMPLATE =
    '【地域のみなさまへ】大きな災害がありました。ご無事でしょうか？下のリンクから、今の状況を教えてください。';

  // ------------------------------------------------------------------
  // ① 安否確認を送る
  // ------------------------------------------------------------------
  const emergencyGroupPillGroup = document.getElementById('emergencyGroupPillGroup');
  const emergencyMessage = document.getElementById('emergencyMessage');
  const emergencySendButton = document.getElementById('emergencySendButton');

  emergencyMessage.value = DISASTER_TEMPLATE;

  function getSelectedEmergencyGroup() {
    const active = emergencyGroupPillGroup.querySelector('.pill-option.active');
    return active ? active.dataset.group : '全員';
  }

  function renderGroupPills(fixedGroups, roleGroups, dynamicGroups) {
    emergencyGroupPillGroup.innerHTML = '';
    [...fixedGroups, ...roleGroups, ...dynamicGroups].forEach((name, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pill-option' + (i === 0 ? ' active' : '');
      button.dataset.group = name;
      button.textContent = name;
      emergencyGroupPillGroup.appendChild(button);
    });
  }

  emergencyGroupPillGroup.addEventListener('click', (e) => {
    const button = e.target.closest('.pill-option');
    if (!button) return;
    emergencyGroupPillGroup.querySelectorAll('.pill-option').forEach((el) => el.classList.remove('active'));
    button.classList.add('active');
  });

  fetch('/api/groups')
    .then((res) => {
      if (!res.ok) throw new Error('グループ取得に失敗しました');
      return res.json();
    })
    .then((data) => renderGroupPills(data.fixedGroups, data.roleGroups, data.dynamicGroups))
    .catch((err) => console.error(err));

  emergencySendButton.addEventListener('click', async () => {
    const messageBody = emergencyMessage.value.trim();
    if (!messageBody) {
      window.alert('送るメッセージを入力してください');
      return;
    }
    if (!window.confirm('この内容で今すぐ安否確認をLINEで送信します。よろしいですか？')) return;

    emergencySendButton.disabled = true;
    try {
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group: getSelectedEmergencyGroup(),
          eventName: '緊急安否確認',
          messageBody,
          confirmSafety: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '配信に失敗しました');
      window.alert(
        `${data.successCount}件に安否確認を送信しました。` +
          (data.skippedNoToken ? `\nトークン未設定のため送信できなかった会員: ${data.skippedNoToken}件` : '') +
          (data.failedAccountCount ? `\n送信に失敗したアカウント数: ${data.failedAccountCount}` : '')
      );
      await refreshSafetySessions();
    } catch (err) {
      console.error(err);
      window.alert('安否確認の送信に失敗しました: ' + err.message);
    } finally {
      emergencySendButton.disabled = false;
    }
  });

  // ------------------------------------------------------------------
  // ② 安否確認の記録を見る（一覧・詳細・上部の状況バナー）
  // ------------------------------------------------------------------
  const statusBannerContainer = document.getElementById('statusBannerContainer');
  const safetySessionList = document.getElementById('safetySessionList');

  function renderStatusBanner(sessions) {
    statusBannerContainer.innerHTML = '';
    if (!sessions || sessions.length === 0) return;

    const latest = sessions[0];
    const link = document.createElement('a');
    link.className = 'status-banner-button';
    link.href = `safety-detail.html?id=${encodeURIComponent(latest.id)}`;
    link.textContent = '📋 安否状況';
    statusBannerContainer.appendChild(link);
  }

  function renderSafetySessionRow(session) {
    const row = document.createElement('div');
    row.className = 'safety-session-row';
    const unresponded = Math.max(0, session.totalRecipients - session.responded);
    row.innerHTML = `
      <div class="safety-session-top">
        <div class="safety-session-info">
          <p class="safety-session-name">${session.eventName}${session.eventDate ? '（' + session.eventDate + '）' : ''}</p>
          <p class="safety-session-meta">SOS: ${session.sos}人 / 無事: ${session.safe}人 / 家族不明: ${session.missing}人 / 未回答: ${unresponded}人</p>
        </div>
        <div class="event-list-actions">
          <button type="button" class="delete-btn">削除</button>
        </div>
      </div>
    `;
    if (session.missingNames && session.missingNames.length > 0) {
      const alertBox = document.createElement('div');
      alertBox.className = 'safety-missing-alert';
      alertBox.textContent = `⚠ 行方不明者情報: ${session.missingNames.join('、')}`;
      row.appendChild(alertBox);
    }
    row.querySelector('.safety-session-info').addEventListener('click', () => {
      window.location.href = `safety-detail.html?id=${encodeURIComponent(session.id)}`;
    });
    row.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!window.confirm(`「${session.eventName}」の安否確認を削除しますか？`)) return;
      try {
        const res = await fetch(`/api/safety/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('削除に失敗しました');
        await refreshSafetySessions();
      } catch (err) {
        console.error(err);
        window.alert('安否確認の削除に失敗しました');
      }
    });
    return row;
  }

  async function refreshSafetySessions() {
    safetySessionList.innerHTML = '<p class="event-list-empty">読み込み中...</p>';
    try {
      const res = await fetch('/api/safety/sessions');
      if (!res.ok) throw new Error('取得に失敗しました');
      const data = await res.json();

      renderStatusBanner(data.sessions);

      safetySessionList.innerHTML = '';
      if (data.sessions.length === 0) {
        safetySessionList.innerHTML = '<p class="event-list-empty">安否確認の記録はまだありません</p>';
        return;
      }
      data.sessions.forEach((s) => safetySessionList.appendChild(renderSafetySessionRow(s)));
    } catch (err) {
      console.error(err);
      safetySessionList.innerHTML = '<p class="event-list-empty">安否状況の取得に失敗しました</p>';
    }
  }

  refreshSafetySessions();

  // ------------------------------------------------------------------
  // ③ 避難場所の準備をする（拠点・避難所）
  // ------------------------------------------------------------------
  const baseNameSelect = document.getElementById('baseNameSelect');
  const baseAddressInput = document.getElementById('baseAddressInput');
  const baseCheckButton = document.getElementById('baseCheckButton');
  const baseMapDiv = document.getElementById('baseMap');
  const baseMapHint = document.getElementById('baseMapHint');
  const baseSaveButton = document.getElementById('baseSaveButton');

  const shelterNameSelect = document.getElementById('shelterNameSelect');
  const shelterAddressInput = document.getElementById('shelterAddressInput');
  const shelterCheckButton = document.getElementById('shelterCheckButton');
  const shelterMapDiv = document.getElementById('shelterMap');
  const shelterMapHint = document.getElementById('shelterMapHint');
  const shelterAddButton = document.getElementById('shelterAddButton');

  const shelterListContainer = document.getElementById('shelterListContainer');

  // 場所マスタ（「場所の管理」で登録した場所）を名称の選択肢として使い、選んだら住所を自動で反映する
  let masterPlaces = [];

  async function loadMasterPlaces() {
    try {
      const res = await fetch('/api/places');
      if (!res.ok) throw new Error('場所取得に失敗しました');
      const data = await res.json();
      masterPlaces = data.places || [];
    } catch (err) {
      console.error(err);
      masterPlaces = [];
    }
    renderNameOptions(baseNameSelect);
    renderNameOptions(shelterNameSelect);
  }

  function renderNameOptions(selectEl) {
    const current = selectEl.value;
    selectEl.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— 場所を選ぶ —';
    selectEl.appendChild(placeholder);
    masterPlaces.forEach((p) => {
      const option = document.createElement('option');
      option.value = p.name;
      option.textContent = p.name;
      selectEl.appendChild(option);
    });
    setNameSelectValue(selectEl, current);
  }

  // 保存済みの名称が場所マスタに無い場合（未登録・削除済みなど）も選択肢が消えないよう一時的に追加する
  function setNameSelectValue(selectEl, name) {
    const value = name || '';
    const hasOption = [...selectEl.options].some((o) => o.value === value);
    if (value && !hasOption) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      selectEl.appendChild(option);
    }
    selectEl.value = value;
  }

  function onNameSelectChange(selectEl, addressInput) {
    const selected = masterPlaces.find((p) => p.name === selectEl.value);
    addressInput.value = selected ? selected.address || '' : addressInput.value;
    addressInput.dispatchEvent(new Event('input'));
  }

  baseNameSelect.addEventListener('change', () => onNameSelectChange(baseNameSelect, baseAddressInput));
  shelterNameSelect.addEventListener('change', () => onNameSelectChange(shelterNameSelect, shelterAddressInput));

  loadMasterPlaces();

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
          name: baseNameSelect.value.trim(),
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
    setNameSelectValue(shelterNameSelect, '');
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
    setNameSelectValue(shelterNameSelect, s.name);
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
    shelterNameSelect.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  shelterCancelEditLink.addEventListener('click', (e) => {
    e.preventDefault();
    stopEditShelter();
  });

  shelterAddButton.addEventListener('click', async () => {
    if (!shelterCoords) return;
    const name = shelterNameSelect.value.trim();
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
        setNameSelectValue(baseNameSelect, data.base.name);
        baseAddressInput.value = data.base.address;
      }

      shelterListContainer.innerHTML = '';
      if (!data.shelters || data.shelters.length === 0) {
        shelterListContainer.innerHTML = '<p class="event-list-empty">まだ避難所が登録されていません</p>';
        return;
      }

      data.shelters.forEach((s) => {
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
        row.querySelector('.event-list-name').textContent = s.name;
        row.querySelector('.event-list-meta').textContent = s.address;
        row.querySelector('.edit-btn').addEventListener('click', () => startEditShelter(s));
        row.querySelector('.delete-btn').addEventListener('click', async () => {
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
