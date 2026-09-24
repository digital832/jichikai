(function () {
  const t = new URLSearchParams(location.search).get('t');
  const title = document.getElementById('title');
  const lead = document.getElementById('lead');
  const meta = document.getElementById('meta');
  const msg = document.getElementById('msg');
  const button = document.getElementById('retryButton');
  const navArea = document.getElementById('navArea');

  async function init() {
    if (!t) { title.textContent = '無効なリンクです'; return; }
    try {
      const res = await fetch(`/api/auth/schedule-retry-info?t=${encodeURIComponent(t)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '無効なリンクです');
      lead.textContent = data.eventName || '（行事名未設定）';
      meta.textContent = `${(data.sendDate || '').replace(/-/g, '/')} ${data.sendTime || ''} に配信予定 ／ 対象: ${data.group}`;
      if (data.status === 'failed') {
        title.textContent = '送信できなかった予約配信';
        button.hidden = false;
      } else if (data.status === 'sent') {
        title.textContent = 'すでに送信されています';
        navArea.hidden = false;
      } else {
        title.textContent = 'この予約は再送できる状態ではありません';
        navArea.hidden = false;
      }
    } catch (err) {
      title.textContent = err.message || '無効なリンクです';
    }
  }
  init();

  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = '送信しています…';
    try {
      const res = await fetch('/api/auth/schedule-retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '送信できませんでした');
      title.textContent = '送信しました';
      lead.textContent = `「${data.eventName || '予約配信'}」を、もう一度送りました。`;
      meta.textContent = '';
      msg.textContent = '';
      button.hidden = true;
      navArea.hidden = false;
    } catch (err) {
      msg.textContent = err.message || '送信できませんでした';
      button.disabled = false;
      button.textContent = 'もう一度送る';
    }
  });
})();
