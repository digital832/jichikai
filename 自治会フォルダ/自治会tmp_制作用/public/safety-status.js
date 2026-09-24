(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const loadingView = document.getElementById('loadingView');
  const contentView = document.getElementById('contentView');
  const errorView = document.getElementById('errorView');
  const safetyMapDiv = document.getElementById('safetyMap');

  function showOnly(view) {
    [loadingView, contentView, errorView].forEach((v) => (v.hidden = v !== view));
  }

  if (!token) {
    showOnly(errorView);
    return;
  }

  const statusClass = { '全員無事': 'safe', '行方不明': 'missing', 'SOS': 'sos' };

  let map = null;
  const markerByLineUserId = new Map();

  // 現在地が分かっている人を、地図上にまとめて表示しておく（行を押すとその地点に移動する）
  function renderMap(responses) {
    const points = responses.filter((r) => r.lat && r.lng);
    if (points.length === 0) {
      safetyMapDiv.hidden = true;
      return;
    }
    safetyMapDiv.hidden = false;

    if (!map) {
      map = L.map(safetyMapDiv);
      L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
        attribution: '地理院タイル',
        maxNativeZoom: 18,
      }).addTo(map);
    }
    // hidden解除の直後はコンテナのサイズを正しく把握できないため、描画完了後に再計算させる
    requestAnimationFrame(() => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 300);

    markerByLineUserId.clear();
    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) map.removeLayer(layer);
    });

    points.forEach((r) => {
      const color = r.status === 'SOS' ? '#ef4444' : r.status === '行方不明' ? '#f59e0b' : '#06c755';
      const marker = L.circleMarker([r.lat, r.lng], {
        radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1,
      }).addTo(map).bindPopup(`<b>${r.realName || '（名前未登録）'}</b>`);
      markerByLineUserId.set(r.lineUserId, marker);
    });

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15);
    } else {
      map.fitBounds(points.map((r) => [r.lat, r.lng]), { padding: [30, 30] });
    }
  }

  function focusOnMap(r) {
    const marker = markerByLineUserId.get(r.lineUserId);
    if (!marker || !map) return;
    safetyMapDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    map.setView([r.lat, r.lng], 17);
    marker.openPopup();
  }

  function makeRow(r) {
    const hasLocation = Boolean(r.lat && r.lng);
    const row = document.createElement('div');
    row.className = 'resp-row' + (hasLocation ? ' has-location' : '');
    const name = document.createElement('span');
    name.textContent = r.realName || '（名前未登録）';
    if (hasLocation) {
      const hint = document.createElement('span');
      hint.className = 'resp-location-hint';
      hint.textContent = '📍 地図で見る';
      name.appendChild(hint);
    }
    const status = document.createElement('span');
    status.className = 'resp-status ' + statusClass[r.status];
    status.textContent = r.status;
    row.appendChild(name);
    row.appendChild(status);
    if (hasLocation) {
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.addEventListener('click', () => focusOnMap(r));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          focusOnMap(r);
        }
      });
    }
    return row;
  }

  function renderUrgent(responses) {
    const urgentCard = document.getElementById('urgentCard');
    const urgentList = document.getElementById('urgentList');
    const urgent = responses.filter((r) => r.status === '行方不明' || r.status === 'SOS');
    urgentCard.hidden = urgent.length === 0;
    urgentList.innerHTML = '';
    urgent.forEach((r) => {
      urgentList.appendChild(makeRow(r));
      if (r.status === '行方不明' && r.missingNames) {
        const detail = document.createElement('div');
        detail.className = 'missing-detail';
        detail.textContent = '行方不明の方: ' + r.missingNames;
        urgentList.appendChild(detail);
      }
    });
  }

  function renderList(responses) {
    const listEl = document.getElementById('respList');
    listEl.innerHTML = '';
    if (responses.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-sub);font-size:13px;">まだ回答がありません。</p>';
      return;
    }
    responses
      .slice()
      .sort((a, b) => (a.respondedAt < b.respondedAt ? 1 : -1))
      .forEach((r) => listEl.appendChild(makeRow(r)));
  }

  let loadedOnce = false;

  async function init() {
    const res = await fetch(`/api/safety/summary/${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('invalid token');
    const data = await res.json();
    document.getElementById('eventNameText').textContent = data.session.eventName || 'お知らせ';
    document.getElementById('eventDateText').textContent = data.session.eventDate || '';
    document.getElementById('safeCount').textContent = data.summary.safe;
    document.getElementById('missingCount').textContent = data.summary.missing;
    document.getElementById('sosCount').textContent = data.summary.sos;
    document.getElementById('noReplyCount').textContent = data.summary.unresponded;
    renderMap(data.responses);
    renderUrgent(data.responses);
    renderList(data.responses);
    showOnly(contentView);
    loadedOnce = true;
  }

  init().catch(() => showOnly(errorView));
  // 開いたままのスマホでSOS・行方不明の新着に気づけるよう、表示中は自動更新する
  setInterval(() => {
    if (!document.hidden && loadedOnce) init().catch(() => {});
  }, 10000);
})();
