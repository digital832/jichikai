(function () {
  const t = new URLSearchParams(location.search).get('t');
  const title = document.getElementById('title');
  const lead = document.getElementById('lead');
  const msg = document.getElementById('msg');
  const button = document.getElementById('restoreButton');
  const navArea = document.getElementById('navArea');

  async function init() {
    if (!t) { title.textContent = '無効なリンクです'; return; }
    try {
      const res = await fetch(`/api/auth/member-restore-info?t=${encodeURIComponent(t)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '無効なリンクです');
      if (!data.deleted) {
        title.textContent = '名簿に戻っています';
        lead.textContent = `${data.name} さんは、すでに名簿に載っています。`;
        navArea.hidden = false;
        return;
      }
      title.textContent = '削除の取り消し';
      lead.textContent = `${data.name} さんを、名簿に戻しますか？`;
      button.hidden = false;
    } catch (err) {
      title.textContent = err.message || '無効なリンクです';
    }
  }
  init();

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const res = await fetch('/api/auth/member-restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取り消せませんでした');
      title.textContent = '名簿に戻しました';
      lead.textContent = `${data.name} さんを、名簿に戻しました。`;
      button.hidden = true;
      navArea.hidden = false;
    } catch (err) {
      msg.textContent = err.message || '取り消せませんでした';
      button.disabled = false;
    }
  });
})();
