(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const loadingView = document.getElementById('loadingView');
  const formView = document.getElementById('formView');
  const doneView = document.getElementById('doneView');
  const errorView = document.getElementById('errorView');

  function showOnly(view) {
    [loadingView, formView, doneView, errorView].forEach((v) => (v.hidden = v !== view));
  }

  if (!token) {
    showOnly(errorView);
    return;
  }

  async function init() {
    const res = await fetch(`/api/attendance/respond/${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('invalid token');
    const data = await res.json();
    document.getElementById('eventNameText').textContent = data.eventName || 'お知らせ';
    document.getElementById('eventDateText').textContent = data.eventDate || '';
    showOnly(formView);
  }

  async function respond(status) {
    document.getElementById('attendButton').disabled = true;
    document.getElementById('notAttendButton').disabled = true;
    try {
      const res = await fetch('/api/attendance/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, status }),
      });
      if (!res.ok) throw new Error('failed');
      document.getElementById('doneText').textContent = status === '参加' ? '「参加します」で回答しました' : '「参加しません」で回答しました';
      showOnly(doneView);
    } catch (err) {
      console.error(err);
      window.alert('送信に失敗しました。もう一度お試しください。');
      document.getElementById('attendButton').disabled = false;
      document.getElementById('notAttendButton').disabled = false;
    }
  }

  document.getElementById('attendButton').addEventListener('click', () => respond('参加'));
  document.getElementById('notAttendButton').addEventListener('click', () => respond('不参加'));

  init().catch(() => showOnly(errorView));
})();
