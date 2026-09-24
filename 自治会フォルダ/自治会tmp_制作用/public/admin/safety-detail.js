(function () {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('id');

  const sessionTitleText = document.getElementById('sessionTitleText');
  const statusTagGroup = document.getElementById('statusTagGroup');
  const safetyMapDiv = document.getElementById('safetyMap');
  const memberListHeading = document.getElementById('memberListHeading');
  const memberListContainer = document.getElementById('memberListContainer');

  const TAGS = [
    { key: 'sos', label: '🆘 SOS', color: '#ef4a4a' },
    { key: 'missing', label: '⚠️ 家族不明', color: '#e08a1e' },
    { key: 'safe', label: '✅ 無事', color: '#05a648' },
    { key: 'unresponded', label: '未回答', color: '#6b716f' },
  ];

  let activeTag = 'sos';
  let map = null;
  let responses = [];
  let unresponded = [];
  let summary = { sos: 0, missing: 0, safe: 0, unresponded: 0 };
  let markerByMember = new Map(); // 会員データ→地図上のマーカー（一覧を押すと該当マーカーに移動するため）

  function groupByTag() {
    return {
      sos: responses.filter((r) => r.status === 'SOS'),
      missing: responses.filter((r) => r.status === '行方不明'),
      safe: responses.filter((r) => r.status === '全員無事'),
      unresponded,
    };
  }

  function renderTags(groups) {
    statusTagGroup.innerHTML = '';
    TAGS.forEach((tag) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'status-tag' + (tag.key === activeTag ? ' active' : '');
      button.dataset.tag = tag.key;
      button.innerHTML = `${tag.label}<span class="count">（${summary[tag.key]}）</span>`;
      button.addEventListener('click', () => {
        activeTag = tag.key;
        render();
      });
      statusTagGroup.appendChild(button);
    });
  }

  function renderMap(groups) {
    const points = groups[activeTag]
      ? groups[activeTag].filter((r) => r.lat && r.lng)
      : [];

    markerByMember = new Map();

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
    // hidden解除の直後はコンテナのサイズを地図が正しく把握できない（特にスマホは描画が遅く0msでは間に合わないことがある）ため、
    // 描画完了後（requestAnimationFrame）と、念のため少し時間を置いた後の2段階で再計算させる
    requestAnimationFrame(() => map.invalidateSize());
    setTimeout(() => map.invalidateSize(), 300);

    map.eachLayer((layer) => {
      if (layer instanceof L.CircleMarker) map.removeLayer(layer);
    });

    const tagColor = TAGS.find((t) => t.key === activeTag).color;
    points.forEach((r) => {
      const marker = L.circleMarker([r.lat, r.lng], {
        radius: 9, color: '#fff', weight: 2, fillColor: tagColor, fillOpacity: 1,
      }).addTo(map).bindPopup(`<b>${r.realName || '（名前未登録）'}</b>`);
      markerByMember.set(r, marker);
    });

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15);
    } else {
      map.fitBounds(points.map((r) => [r.lat, r.lng]), { padding: [30, 30] });
    }
  }

  function renderMemberList(groups) {
    const members = groups[activeTag] || [];
    const tag = TAGS.find((t) => t.key === activeTag);
    memberListHeading.textContent = `${tag.label}（${summary[tag.key]}人）`;
    memberListContainer.innerHTML = '';

    if (activeTag === 'unresponded' && members.length === 0 && summary.unresponded > 0) {
      memberListContainer.innerHTML =
        '<p class="event-list-empty">この安否確認は名前の一覧に対応していません（人数のみ集計しています）</p>';
      return;
    }

    if (members.length === 0) {
      memberListContainer.innerHTML = '<p class="event-list-empty">対象者はいません</p>';
      return;
    }

    members.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'member-row';
      const name = document.createElement('p');
      name.className = 'member-row-name';
      name.textContent = m.realName || '（名前未登録）';
      row.appendChild(name);

      const hasLocation = Boolean(m.lat && m.lng);
      const metaParts = [];
      if (activeTag === 'sos' || activeTag === 'missing') {
        metaParts.push(hasLocation ? '📍 現在地を報告済み（押すと地図で見られます）' : '現在地は未報告');
      }
      if (activeTag === 'missing' && m.missingNames) {
        metaParts.push(`行方不明者: ${m.missingNames}`);
      }
      if (metaParts.length > 0) {
        const meta = document.createElement('p');
        meta.className = 'member-row-meta' + (hasLocation ? ' member-row-meta-link' : '');
        meta.textContent = metaParts.join(' / ');
        row.appendChild(meta);
      }
      if (hasLocation) {
        row.classList.add('member-row-clickable');
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        const focusOnMap = () => {
          const marker = markerByMember.get(m);
          if (!marker || !map) return;
          safetyMapDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
          map.setView([m.lat, m.lng], 17);
          marker.openPopup();
        };
        row.addEventListener('click', focusOnMap);
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            focusOnMap();
          }
        });
      }
      memberListContainer.appendChild(row);
    });
  }

  function render() {
    const groups = groupByTag();
    renderTags(groups);
    renderMap(groups);
    renderMemberList(groups);
  }

  // 一番気にすべき情報から見えるよう、SOS → 家族不明 → 無事 → 未回答 の優先順で最初のタブを選ぶ
  function pickDefaultTag() {
    const priority = ['sos', 'missing', 'safe', 'unresponded'];
    return priority.find((key) => summary[key] > 0) || 'safe';
  }

  async function load() {
    if (!sessionId) {
      sessionTitleText.textContent = 'セッションが指定されていません';
      memberListContainer.innerHTML = '';
      statusTagGroup.innerHTML = '';
      return;
    }
    try {
      const res = await fetch(`/api/safety/sessions/${encodeURIComponent(sessionId)}`);
      if (!res.ok) throw new Error('取得に失敗しました');
      const data = await res.json();
      responses = data.responses || [];
      unresponded = data.unresponded || [];
      summary = data.summary || summary;
      sessionTitleText.textContent = `${data.session.eventName}${data.session.eventDate ? '（' + data.session.eventDate + '）' : ''}`;
      activeTag = pickDefaultTag();
      render();
    } catch (err) {
      console.error(err);
      sessionTitleText.textContent = '安否状況の取得に失敗しました';
    }
  }

  load();
})();
