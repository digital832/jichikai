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
    const unresponded = Math.max(0, latest.totalRecipients - latest.responded);
    const hasMissing = latest.missing > 0;

    const banner = document.createElement('div');
    banner.className = 'status-banner ' + (hasMissing ? 'is-alert' : 'is-clear');
    banner.innerHTML = `
      <p class="status-banner-title">${hasMissing ? '⚠️ 行方不明の方がいます' : '✅ 最新の安否確認'}：${latest.eventName}${latest.eventDate ? '（' + latest.eventDate + '）' : ''}</p>
      <p class="status-banner-nums">
        全員無事：<strong>${latest.safe}人</strong>
        行方不明：<strong>${latest.missing}人</strong>
        未回答：<strong>${unresponded}人</strong>
      </p>
      ${hasMissing && latest.missingNames && latest.missingNames.length > 0
        ? `<div class="safety-missing-alert">⚠ 行方不明者情報: ${latest.missingNames.join('、')}</div>`
        : ''}
      <a class="status-banner-link" href="#safetySessionList">くわしく見る ▼</a>
    `;
    statusBannerContainer.appendChild(banner);
  }

  function renderSafetySessionRow(session) {
    const row = document.createElement('div');
    row.className = 'safety-session-row';
    const unresponded = Math.max(0, session.totalRecipients - session.responded);
    row.innerHTML = `
      <p class="safety-session-name">${session.eventName}${session.eventDate ? '（' + session.eventDate + '）' : ''}</p>
      <p class="safety-session-meta">全員無事: ${session.safe}人 / 行方不明: ${session.missing}人 / 未回答: ${unresponded}人</p>
    `;
    if (session.missingNames && session.missingNames.length > 0) {
      const alertBox = document.createElement('div');
      alertBox.className = 'safety-missing-alert';
      alertBox.textContent = `⚠ 行方不明者情報: ${session.missingNames.join('、')}`;
      row.appendChild(alertBox);
    }
    row.addEventListener('click', () => openSafetyDetail(session));
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

  // 安否状況の詳細（回答者ごとの現在地を地図で表示）
  const safetyDetailOverlay = document.getElementById('safetyDetailOverlay');
  const safetyDetailTitle = document.getElementById('safetyDetailTitle');
  const safetyDetailMapDiv = document.getElementById('safetyDetailMap');
  const safetyDetailList = document.getElementById('safetyDetailList');
  let safetyDetailMap = null;

  async function openSafetyDetail(session) {
    safetyDetailTitle.textContent = `安否状況の詳細：${session.eventName}`;
    safetyDetailList.innerHTML = '読み込み中...';
    safetyDetailOverlay.classList.add('open');

    try {
      const res = await fetch(`/api/safety/sessions/${encodeURIComponent(session.id)}`);
      if (!res.ok) throw new Error('取得に失敗しました');
      const data = await res.json();
      renderSafetyDetailMap(data.responses);
      renderSafetyDetailList(data.responses);
    } catch (err) {
      console.error(err);
      safetyDetailList.innerHTML = '<p class="event-list-empty">詳細の取得に失敗しました</p>';
    }
  }

  function renderSafetyDetailMap(responses) {
    const points = responses.filter((r) => r.lat && r.lng);

    if (safetyDetailMap) {
      safetyDetailMap.remove();
      safetyDetailMap = null;
    }

    if (points.length === 0) {
      safetyDetailMapDiv.textContent = 'まだ現在地を報告した人はいません';
      return;
    }
    safetyDetailMapDiv.textContent = '';

    safetyDetailMap = L.map(safetyDetailMapDiv).setView([points[0].lat, points[0].lng], 14);
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
      attribution: '地理院タイル',
      maxNativeZoom: 18,
    }).addTo(safetyDetailMap);

    points.forEach((r) => {
      const color = r.status === '行方不明' ? '#ef4a4a' : '#05a648';
      L.circleMarker([r.lat, r.lng], {
        radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1,
      }).addTo(safetyDetailMap).bindPopup(`<b>${r.realName || '（名前未登録）'}</b><br>${r.status}`);
    });

    if (points.length > 1) {
      safetyDetailMap.fitBounds(points.map((r) => [r.lat, r.lng]), { padding: [30, 30] });
    }
  }

  function renderSafetyDetailList(responses) {
    safetyDetailList.innerHTML = '';
    if (responses.length === 0) {
      safetyDetailList.innerHTML = '<p class="event-list-empty">まだ回答がありません</p>';
      return;
    }
    responses.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'safety-response-row';
      const name = document.createElement('p');
      name.className = 'safety-response-name';
      name.textContent = r.realName || '（名前未登録）';
      const status = document.createElement('p');
      status.className = 'safety-response-status';
      status.textContent = `${r.status}${r.lat && r.lng ? '（現在地を報告済み）' : ''}`;
      row.appendChild(name);
      row.appendChild(status);
      safetyDetailList.appendChild(row);
    });
  }

  document.getElementById('closeSafetyDetailButton').addEventListener('click', () => {
    safetyDetailOverlay.classList.remove('open');
  });
  safetyDetailOverlay.addEventListener('click', (e) => {
    if (e.target === safetyDetailOverlay) safetyDetailOverlay.classList.remove('open');
  });

  refreshSafetySessions();

  // ------------------------------------------------------------------
  // ③ 避難場所の準備をする（拠点・避難所）
  // ------------------------------------------------------------------
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
