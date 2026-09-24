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

  const statusClass = { '全員無事': 'safe', '行方不明': 'missing', 'SOS': 'sos' };

  function renderUrgent(responses) {
    const urgentCard = document.getElementById('urgentCard');
    const urgentList = document.getElementById('urgentList');
    const urgent = responses.filter((r) => r.status === '行方不明' || r.status === 'SOS');
    urgentCard.hidden = urgent.length === 0;
    urgentList.innerHTML = '';
    urgent.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'resp-row';
      const name = document.createElement('span');
      name.textContent = r.realName || '（名前未登録）';
      const status = document.createElement('span');
      status.className = 'resp-status ' + statusClass[r.status];
      status.textContent = r.status;
      row.appendChild(name);
      row.appendChild(status);
      urgentList.appendChild(row);
      if (r.status === '行方不明' && r.missingNames) {
        const detail = document.createElement('div');
        detail.className = 'missing-detail';
        detail.textContent = '行方不明の方: ' + r.missingNames;
        urgentList.appendChild(detail);
      }
    });
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
        status.className = 'resp-status ' + statusClass[r.status];
        status.textContent = r.status;
        row.appendChild(name);
        row.appendChild(status);
        listEl.appendChild(row);
      });
  }

  async function init() {
    const res = await fetch(`/api/safety/summary/${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error('invalid token');
    const data = await res.json();
    document.getElementById('eventNameText').textContent = data.session.eventName || 'お知らせ';
    document.getElementById('eventDateText').textContent = data.session.eventDate || '';
    document.getElementById('safeCount').textContent = data.summary.safe;
    document.getElementById('missingCount').textContent = data.summary.missing;
    document.getElementById('sosCount').textContent = data.summary.sos;
    document.getElementById('noReplyCount').textContent = data.summary.unresponded;
    renderUrgent(data.responses);
    renderList(data.responses);
    showOnly(contentView);
  }

  init().catch(() => showOnly(errorView));
})();
