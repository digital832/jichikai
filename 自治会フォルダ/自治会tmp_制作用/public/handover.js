(function () {
  const token = new URLSearchParams(location.search).get('token');
  const loadingArea = document.getElementById('loadingArea');
  const loadingText = document.getElementById('loadingText');
  const formArea = document.getElementById('formArea');
  const doneArea = document.getElementById('doneArea');
  const targetName = document.getElementById('targetName');
  const communityName = document.getElementById('communityName');
  const newCode = document.getElementById('newCode');
  const message = document.getElementById('message');
  const saveButton = document.getElementById('saveButton');

  newCode.addEventListener('input', () => {
    newCode.value = newCode.value.replace(/[^0-9]/g, '').slice(0, 6);
    message.textContent = '';
  });
  newCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveButton.click();
  });

  async function init() {
    if (!token) {
      loadingText.textContent = '無効なリンクです';
      return;
    }
    try {
      const res = await fetch(`/api/auth/handover-info?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '無効なリンクです');
      communityName.textContent = data.communityName || '';
      targetName.textContent = data.toName;
      loadingArea.hidden = true;
      formArea.hidden = false;
      newCode.focus();
    } catch (err) {
      loadingText.textContent = err.message || '無効なリンクです';
    }
  }
  init();

  saveButton.addEventListener('click', async () => {
    if (newCode.value.length !== 6) {
      message.textContent = '数字6桁を入れてください';
      return;
    }
    saveButton.disabled = true;
    saveButton.textContent = '設定しています…';
    try {
      const res = await fetch('/api/auth/handover-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: newCode.value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '設定できませんでした');
      formArea.hidden = true;
      doneArea.hidden = false;
    } catch (err) {
      message.textContent = err.message || '設定できませんでした';
      saveButton.disabled = false;
      saveButton.textContent = 'これで決める';
    }
  });
})();
