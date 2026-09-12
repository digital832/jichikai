(function () {
  const emptyCard = document.getElementById('emptyCard');
  const mainContent = document.getElementById('mainContent');
  const mapDiv = document.getElementById('map');
  const navButton = document.getElementById('navButton');
  const navHint = document.getElementById('navHint');
  const shelterListCard = document.getElementById('shelterListCard');
  const shelterListContainer = document.getElementById('shelterListContainer');

  function hazardMapUrl(lat, lng) {
    return `https://disaportal.gsi.go.jp/maps/?ll=${lat},${lng}&z=16`;
  }

  function renderShelterList(shelters) {
    if (!shelters || shelters.length === 0) {
      shelterListCard.hidden = true;
      return;
    }
    shelterListCard.hidden = false;
    shelterListContainer.innerHTML = '';
    shelters.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'shelter-row';
      const name = document.createElement('p');
      name.className = 'shelter-name';
      name.textContent = s.name;
      const address = document.createElement('p');
      address.className = 'shelter-address';
      address.textContent = s.address;
      row.appendChild(name);
      row.appendChild(address);
      if (s.lat && s.lng) {
        const link = document.createElement('a');
        link.className = 'shelter-hazard-link';
        link.href = hazardMapUrl(s.lat, s.lng);
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = '🌊 この場所のハザードマップ';
        row.appendChild(link);
      }
      shelterListContainer.appendChild(row);
    });
  }

  function navigationUrl(lat, lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
  }

  function setupNavButton(base) {
    if (base && base.lat && base.lng) {
      navButton.href = navigationUrl(base.lat, base.lng);
      navButton.removeAttribute('aria-disabled');
      navHint.textContent = '今いる場所から拠点までの道案内が始まります（お使いの地図アプリが開きます）';
    } else {
      navButton.setAttribute('aria-disabled', 'true');
      navButton.removeAttribute('href');
      navHint.textContent = '管理者が拠点を登録すると使えるようになります';
    }
  }

  // 国土地理院が無料で公開している、ハザード情報そのものの画像データ
  // （自分たちの地図に直接重ねるので、外部サイトの表示状態に左右されず、開いた瞬間に確実に見える）
  // 切り替えチェックボックスは地図の中ではなく、地図の下に別カードとして置く（ピンが隠れないように）
  function addHazardLayers(map) {
    const tile = (id) => L.tileLayer(`https://disaportaldata.gsi.go.jp/raster/${id}/{z}/{x}/{y}.png`, {
      opacity: 0.9,
      maxNativeZoom: 17,
      attribution: '国土交通省ハザードマップポータルサイト',
    });
    const layers = {
      flood: tile('01_flood_l2_shinsuishin_data'),
      hightide: tile('03_hightide_l2_shinsuishin_data'),
      tsunami: tile('04_tsunami_newlegend_data'),
      dosekiryu: tile('05_dosekiryukeikaikuiki'),
      kyukeisha: tile('05_kyukeishakeikaikuiki'),
      jisuberi: tile('05_jisuberikeikaikuiki'),
    };

    document.querySelectorAll('#hazardToggleList input[type="checkbox"]').forEach((checkbox) => {
      const layer = layers[checkbox.dataset.layer];
      if (!layer) return;
      if (checkbox.checked) layer.addTo(map);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          layer.addTo(map);
        } else {
          map.removeLayer(layer);
        }
      });
    });
  }

  function renderMap(base, shelters) {
    const points = [];
    if (base && base.lat && base.lng) points.push([base.lat, base.lng]);
    shelters.forEach((s) => { if (s.lat && s.lng) points.push([s.lat, s.lng]); });

    const center = points[0];
    const map = L.map(mapDiv).setView(center, base ? 15 : 14);
    // ハザード情報の色が見やすいように、国土地理院の「淡色地図」を背景に使う
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
      attribution: '地理院タイル',
      maxNativeZoom: 18,
    }).addTo(map);
    addHazardLayers(map);

    if (base && base.lat && base.lng) {
      L.circleMarker([base.lat, base.lng], {
        radius: 10, color: '#fff', weight: 2, fillColor: '#1976d2', fillOpacity: 1,
      }).addTo(map).bindPopup(`<b>${escapeHtml(base.name || '拠点')}</b><br>${escapeHtml(base.address || '')}`);
    }
    shelters.forEach((s) => {
      if (!s.lat || !s.lng) return;
      L.circleMarker([s.lat, s.lng], {
        radius: 9, color: '#fff', weight: 2, fillColor: '#05a648', fillOpacity: 1,
      }).addTo(map).bindPopup(`<b>${escapeHtml(s.name)}</b><br>${escapeHtml(s.address || '')}`);
    });

    if (points.length > 1) {
      map.fitBounds(points, { padding: [30, 30] });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function init() {
    let data;
    try {
      const res = await fetch('/api/disaster');
      if (!res.ok) throw new Error('取得に失敗しました');
      data = await res.json();
    } catch (err) {
      console.error(err);
      emptyCard.hidden = false;
      emptyCard.querySelector('.empty-text').textContent = '情報の取得に失敗しました。時間をおいて開き直してください。';
      return;
    }

    const base = data.base;
    const shelters = data.shelters || [];

    if (!base && shelters.length === 0) {
      emptyCard.hidden = false;
      return;
    }

    mainContent.hidden = false;
    setupNavButton(base);
    renderShelterList(shelters);
    renderMap(base, shelters);
  }

  init();
})();
