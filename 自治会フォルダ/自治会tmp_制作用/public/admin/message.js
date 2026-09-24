(function () {
  const row = Number(new URLSearchParams(location.search).get('row'));
  const targetLabel = document.getElementById('targetLabel');
  const targetName = document.getElementById('targetName');
  const messageBody = document.getElementById('messageBody');
  const sendButton = document.getElementById('sendButton');
  const resultMessage = document.getElementById('resultMessage');

  function showResult(text, ok) {
    resultMessage.textContent = text;
    resultMessage.className = 'message-result ' + (ok ? 'ok' : 'ng');
    resultMessage.hidden = false;
  }

  document.getElementById('cancelButton').addEventListener('click', () => {
    location.href = 'members.html';
  });

  async function loadTarget() {
    const res = await fetch('/api/members');
    if (!res.ok) throw new Error('名簿の取得に失敗しました');
    const data = await res.json();
    const member = (data.members || []).find((m) => m.row === row);
    if (!member) throw new Error('対象の会員が見つかりません');
    targetLabel.textContent = `${member.group || '所属なし'}／${member.lineName || 'LINE名不明'}`;
    targetName.textContent = `${member.realName || member.lineName} さんへ`;
  }

  sendButton.addEventListener('click', async () => {
    const text = messageBody.value.trim();
    if (!text) {
      showResult('メッセージを入力してください', false);
      return;
    }
    sendButton.disabled = true;
    resultMessage.hidden = true;
    try {
      const res = await fetch(`/api/members/${row}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '送信に失敗しました');
      messageBody.value = '';
      showResult('送信しました', true);
    } catch (err) {
      console.error(err);
      showResult(err.message || 'LINEメッセージの送信に失敗しました', false);
    } finally {
      sendButton.disabled = false;
    }
  });

  if (!row) {
    showResult('対象の会員が指定されていません。名簿一覧から開き直してください', false);
    sendButton.disabled = true;
  } else {
    loadTarget().catch((err) => {
      console.error(err);
      showResult(err.message, false);
      sendButton.disabled = true;
    });
  }
})();
