(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const loadingView = document.getElementById('loadingView');
  const formView = document.getElementById('formView');
  const missingFormView = document.getElementById('missingFormView');
  const doneView = document.getElementById('doneView');
  const errorView = document.getElementById('errorView');

  function showOnly(view) {
    [loadingView, formView, missingFormView, doneView, errorView].forEach((v) => (v.hidden = v !== view));
  }

  if (!token) {
    showOnly(errorView);
    return;
  }

  async function init() {
    const res = await fetch(`/api/safety/respond/${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('invalid token');
    const data = await res.json();
    document.getElementById('eventNameText').textContent = data.eventName || '安否確認';
    document.getElementById('eventDateText').textContent = data.eventDate || '';
    showOnly(formView);
  }

  async function submitResponse(status, missingNames) {
    try {
      const res = await fetch('/api/safety/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, status, missingNames }),
      });
      if (!res.ok) throw new Error('failed');
      document.getElementById('doneText').textContent =
        status === '全員無事' ? '「全員無事」で回答しました' : '行方不明者ありで回答しました';
      // 現在地の報告は「自分が行方不明・被災している」ことを伝えるための機能なので、
      // 「全員無事」の回答では出さず、「行方不明」の回答のときだけ出す
      document.getElementById('locationSection').hidden = (status !== '行方不明');
      showOnly(doneView);
    } catch (err) {
      console.error(err);
      window.alert('送信に失敗しました。もう一度お試しください。');
    }
  }

  document.getElementById('safeButton').addEventListener('click', (e) => {
    e.target.disabled = true;
    submitResponse('全員無事', '');
  });

  document.getElementById('missingButton').addEventListener('click', () => {
    showOnly(missingFormView);
  });

  document.getElementById('backToQuestionLink').addEventListener('click', (e) => {
    e.preventDefault();
    showOnly(formView);
  });

  document.getElementById('submitMissingButton').addEventListener('click', (e) => {
    const names = document.getElementById('missingNamesInput').value.trim();
    if (!names) {
      window.alert('お名前を入力してください');
      return;
    }
    e.target.disabled = true;
    submitResponse('行方不明', names);
  });

  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('このブラウザは現在地の取得に対応していません'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => reject(new Error('現在地を取得できませんでした（位置情報の利用を許可してください）'))
      );
    });
  }

  async function sendLocation(lat, lng) {
    const res = await fetch('/api/safety/respond/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, lat, lng }),
    });
    if (!res.ok) throw new Error('送信に失敗しました');
  }

  const locationButton = document.getElementById('locationButton');
  const locationHint = document.getElementById('locationHint');

  locationButton.addEventListener('click', async () => {
    locationButton.disabled = true;
    locationHint.textContent = '現在地を取得しています…';
    try {
      const { lat, lng } = await getCurrentPosition();
      await sendLocation(lat, lng);
      locationHint.textContent = '現在地を報告しました';
    } catch (err) {
      console.error(err);
      locationHint.textContent = err.message || '送信に失敗しました。もう一度お試しください';
      locationButton.disabled = false;
    }
  });

  // 「現在地を教える（助けを求める）」：自分自身が行方不明・被災していることを、
  // 名前入力を挟まず現在地とあわせて一度に伝えるための緊急用ボタン
  document.getElementById('sosButton').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const { lat, lng } = await getCurrentPosition();
      const res = await fetch('/api/safety/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, status: '行方不明', missingNames: '本人（現在地を報告済み）' }),
      });
      if (!res.ok) throw new Error('送信に失敗しました');
      await sendLocation(lat, lng);
      document.getElementById('doneText').textContent = '現在地を報告しました。救助をお待ちください';
      document.getElementById('locationSection').hidden = true;
      showOnly(doneView);
    } catch (err) {
      console.error(err);
      window.alert(err.message || '送信に失敗しました。もう一度お試しください。');
      e.target.disabled = false;
    }
  });

  init().catch(() => showOnly(errorView));
})();
