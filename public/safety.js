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

  init().catch(() => showOnly(errorView));
})();
