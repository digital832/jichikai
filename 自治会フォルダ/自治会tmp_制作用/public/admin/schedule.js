(function () {
  const listContainer = document.getElementById('scheduleListContainer');

  const STATUS_LABEL = { pending: '予約中', sent: '配信済み', failed: '失敗' };

  function formatSendAt(s) {
    if (!s.sendDate || !s.sendTime) return '配信日時未設定';
    return `${s.sendDate.replace(/-/g, '/')} ${s.sendTime} に配信予定`;
  }

  async function fetchSchedules() {
    const res = await fetch('/api/schedule');
    if (!res.ok) throw new Error('予約一覧の取得に失敗しました');
    const data = await res.json();
    return data.schedules || [];
  }

  function renderList(schedules) {
    listContainer.innerHTML = '';
    if (schedules.length === 0) {
      listContainer.innerHTML = '<p class="event-list-empty">登録されている予約はありません</p>';
      return;
    }
    // 配信予定が近い順に並べる
    const sorted = [...schedules].sort((a, b) => {
      const aKey = `${a.sendDate || ''}T${a.sendTime || ''}`;
      const bKey = `${b.sendDate || ''}T${b.sendTime || ''}`;
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    });

    sorted.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'schedule-row';
      row.innerHTML = `
        <div class="schedule-info">
          <div class="schedule-name"></div>
          <div class="schedule-meta"></div>
        </div>
        <div class="schedule-actions">
          <span class="schedule-status"></span>
          <button type="button" class="schedule-edit-btn">編集</button>
          <button type="button" class="schedule-delete-btn">削除</button>
        </div>
      `;
      row.querySelector('.schedule-name').textContent = s.eventName || '（行事名未設定）';
      row.querySelector('.schedule-meta').textContent = `${formatSendAt(s)} ／ 対象: ${s.group || '全員'}`;
      const statusEl = row.querySelector('.schedule-status');
      statusEl.textContent = STATUS_LABEL[s.status] || s.status;
      statusEl.classList.add(s.status || 'pending');

      row.querySelector('.schedule-info').addEventListener('click', () => {
        window.location.href = `schedule-detail.html?id=${s.id}`;
      });

      row.querySelector('.schedule-edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = `schedule-detail.html?id=${s.id}`;
      });

      row.querySelector('.schedule-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!window.confirm('この予約を削除しますか？')) return;
        try {
          const res = await fetch(`/api/schedule/${s.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('削除に失敗しました');
          await refresh();
        } catch (err) {
          console.error(err);
          window.alert('予約の削除に失敗しました');
        }
      });

      listContainer.appendChild(row);
    });
  }

  async function refresh() {
    listContainer.innerHTML = '読み込み中...';
    try {
      renderList(await fetchSchedules());
    } catch (err) {
      console.error(err);
      listContainer.innerHTML = '<p class="event-list-empty">予約一覧の取得に失敗しました</p>';
    }
  }

  document.getElementById('addScheduleButton').addEventListener('click', () => {
    window.location.href = 'schedule-detail.html';
  });

  refresh();
})();
