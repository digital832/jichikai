(function () {
  let members = [];
  const groupSelect = document.getElementById('handoverGroup');
  const nameSelect = document.getElementById('handoverSelect');
  const message = document.getElementById('handoverMessage');
  const button = document.getElementById('handoverButton');

  function showMessage(text, type) {
    message.textContent = text;
    message.className = `password-message ${type || ''}`;
  }

  function buildGroupOptions() {
    const groups = [...new Set(members.map((m) => m.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    groupSelect.innerHTML = '<option value="">班を選ぶ</option>' + groups.map((g) => `<option value="${g}">${g}</option>`).join('');
  }

  function renderNameOptions() {
    const group = groupSelect.value;
    if (!group) {
      nameSelect.innerHTML = '<option value="">（未選択）</option>';
      return;
    }
    const inGroup = members
      .filter((m) => m.group === group)
      .sort((a, b) => (a.realName || '').localeCompare(b.realName || '', 'ja'));
    nameSelect.innerHTML =
      '<option value="">（未選択）</option>' +
      inGroup.map((m) => `<option value="${m.lineUserId}">${m.realName || m.lineName}${m.role ? '（' + m.role + '）' : ''}</option>`).join('');
  }

  groupSelect.addEventListener('change', renderNameOptions);

  async function load() {
    try {
      const res = await fetch('/api/members');
      const data = await res.json();
      members = data.members || [];
    } catch (err) {
      console.error(err);
      members = [];
    }
    buildGroupOptions();
    renderNameOptions();
  }
  load();

  button.addEventListener('click', async () => {
    const toLineUserId = nameSelect.value;
    if (!toLineUserId) {
      showMessage('引き継ぐ相手を選んでください', 'error');
      return;
    }
    if (!window.confirm('引き継ぎのリンクを相手にLINEで送ります。今のログイン番号は、送信から1か月間は使えます。よろしいですか？')) return;
    button.disabled = true;
    try {
      const res = await fetch('/api/auth/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toLineUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '送信に失敗しました');
      showMessage('相手のLINEに送りました。今の番号は1か月間使えます', 'success');
    } catch (err) {
      console.error(err);
      showMessage(err.message || '送信に失敗しました', 'error');
    } finally {
      button.disabled = false;
    }
  });
})();
