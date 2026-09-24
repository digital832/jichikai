(function () {
  const qrOriginalsContainer = document.getElementById('qrOriginalsContainer');
  const qrFlyersContainer = document.getElementById('qrFlyersContainer');
  const qrTabOriginals = document.getElementById('qrTabOriginals');
  const qrTabFlyers = document.getElementById('qrTabFlyers');

  function labelFromName(name) {
    return name.replace(/\.[^.]+$/, '').replace(/_QRコード$/, '');
  }

  function renderCard(file) {
    const card = document.createElement('div');
    card.className = 'card';

    const heading = document.createElement('div');
    heading.className = 'card-heading qr-card-heading';

    const title = document.createElement('span');
    title.textContent = labelFromName(file.name);
    heading.appendChild(title);

    const fileUrl = `/api/qrcode/${encodeURIComponent(file.id)}`;
    const openLink = document.createElement('a');
    openLink.className = 'qr-open-link';
    openLink.href = fileUrl;
    openLink.target = '_blank';
    openLink.rel = 'noopener';
    openLink.textContent = '大きく表示・印刷';
    heading.appendChild(openLink);

    card.appendChild(heading);

    if (file.name.toLowerCase().endsWith('.pdf')) {
      const frame = document.createElement('embed');
      frame.className = 'qr-frame';
      frame.src = fileUrl;
      frame.type = 'application/pdf';
      card.appendChild(frame);
    } else {
      const img = document.createElement('img');
      img.className = 'qr-image';
      img.src = fileUrl;
      img.alt = file.name;
      card.appendChild(img);
    }

    if (file.friendUrl) {
      const linkRow = document.createElement('p');
      linkRow.className = 'qr-friend-link';
      const friendLink = document.createElement('a');
      friendLink.href = file.friendUrl;
      friendLink.target = '_blank';
      friendLink.rel = 'noopener';
      friendLink.textContent = file.friendUrl;
      linkRow.appendChild(friendLink);
      card.appendChild(linkRow);
    }

    return card;
  }

  function renderList(container, files, emptyMessage) {
    container.innerHTML = '';
    if (files.length === 0) {
      container.innerHTML = `<p class="qr-empty">${emptyMessage}</p>`;
      return;
    }
    files.forEach((file) => container.appendChild(renderCard(file)));
  }

  function selectTab(tab) {
    const isOriginals = tab === 'originals';
    qrTabOriginals.classList.toggle('active', isOriginals);
    qrTabFlyers.classList.toggle('active', !isOriginals);
    qrOriginalsContainer.hidden = !isOriginals;
    qrFlyersContainer.hidden = isOriginals;
  }

  qrTabOriginals.addEventListener('click', () => selectTab('originals'));
  qrTabFlyers.addEventListener('click', () => selectTab('flyers'));

  async function loadQrCodes() {
    qrOriginalsContainer.innerHTML = '読み込み中...';
    qrFlyersContainer.innerHTML = '読み込み中...';
    try {
      const res = await fetch('/api/qrcode');
      if (!res.ok) throw new Error('QRコード一覧の取得に失敗しました');
      const data = await res.json();
      renderList(qrOriginalsContainer, data.originals || [], 'QRコードがまだ登録されていません。');
      renderList(qrFlyersContainer, data.flyers || [], 'チラシがまだ登録されていません。');
    } catch (err) {
      console.error(err);
      const message = '<p class="qr-empty">QRコードの取得に失敗しました。</p>';
      qrOriginalsContainer.innerHTML = message;
      qrFlyersContainer.innerHTML = message;
    }
  }

  loadQrCodes();
})();
