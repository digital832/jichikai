(function () {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const loadingView = document.getElementById('loadingView');
  const contentView = document.getElementById('contentView');
  const errorView = document.getElementById('errorView');

  function showOnly(view) {
    [loadingView, contentView, errorView].forEach((v) => (v.hidden = v !== view));
  }

  if (!token) {
    showOnly(errorView);
    return;
  }

  function renderList(responses) {
    const listEl = document.getElementById('respList');
    listEl.innerHTML = '';
    if (responses.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-sub);font-size:13px;">まだ回答がありません。</p>';
      return;
    }
    responses
      .slice()
      .sort((a, b) => (a.respondedAt < b.respondedAt ? 1 : -1))
      .forEach((r) => {
        const row = document.createElement('div');
        row.className = 'resp-row';
        const name = document.createElement('span');
        name.textContent = r.realName || '（名前未登録）';
        const status = document.createElement('span');
        status.className = 'resp-status ' + (r.status === '参加' ? 'attend' : 'not-attend');
        status.textContent = r.status;
        row.appendChild(name);
        row.appendChild(status);
        listEl.appendChild(row);
      });
  }

  async function init() {
    const res = await fetch(`/api/attendance/summary/${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('invalid token');
    const data = await res.json();
    document.getElementById('eventNameText').textContent = data.session.eventName || 'お知らせ';
    document.getElementById('eventDateText').textContent = data.session.eventDate || '';
    document.getElementById('attendCount').textContent = data.summary.attending;
    document.getElementById('notAttendCount').textContent = data.summary.notAttending;
    document.getElementById('noReplyCount').textContent = Math.max(0, data.session.totalRecipients - data.summary.responded);
    renderList(data.responses);
    showOnly(contentView);
  }

  init().catch(() => showOnly(errorView));
})();
