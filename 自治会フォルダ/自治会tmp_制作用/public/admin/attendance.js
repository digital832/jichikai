(function () {
  const attendanceOngoingList = document.getElementById('attendanceOngoingList');
  const attendanceHistoryList = document.getElementById('attendanceHistoryList');

  function renderSessionRow(session) {
    const row = document.createElement('div');
    row.className = 'event-list-row';
    const unresponded = Math.max(0, session.totalRecipients - session.responded);
    row.innerHTML = `
      <div class="event-list-info" style="cursor:pointer;">
        <span class="event-list-name"></span>
        <span class="event-list-meta"></span>
      </div>
      <div class="event-list-actions">
        <button type="button" class="delete-btn">削除</button>
      </div>
    `;
    row.querySelector('.event-list-name').textContent = `${session.eventName}${session.eventDate ? '（' + session.eventDate + '）' : ''}`;
    row.querySelector('.event-list-meta').textContent =
      `参加: ${session.attending}人 / 不参加: ${session.notAttending}人 / 未回答: ${unresponded}人（タップで参加者名を表示）`;

    const namesBox = document.createElement('div');
    namesBox.className = 'attendance-names';
    namesBox.hidden = true;

    let loaded = false;
    row.querySelector('.event-list-info').addEventListener('click', async () => {
      namesBox.hidden = !namesBox.hidden;
      if (namesBox.hidden || loaded) return;
      namesBox.textContent = '読み込み中...';
      try {
        const res = await fetch(`/api/attendance/sessions/${session.id}`);
        if (!res.ok) throw new Error('取得に失敗しました');
        const data = await res.json();
        const attendingNames = data.responses.filter((r) => r.status === '参加').map((r) => r.realName || '(名前未設定)');
        const notAttendingNames = data.responses.filter((r) => r.status === '不参加').map((r) => r.realName || '(名前未設定)');
        namesBox.innerHTML = `
          <div><strong>参加：</strong>${attendingNames.length ? attendingNames.join('、') : 'なし'}</div>
          <div style="margin-top:4px;"><strong>不参加：</strong>${notAttendingNames.length ? notAttendingNames.join('、') : 'なし'}</div>
        `;
        loaded = true;
      } catch (err) {
        console.error(err);
        namesBox.textContent = '取得に失敗しました';
      }
    });

    row.querySelector('.delete-btn').addEventListener('click', async () => {
      if (!window.confirm(`「${session.eventName}」の出欠状況を削除しますか？`)) return;
      try {
        const res = await fetch(`/api/attendance/sessions/${encodeURIComponent(session.id)}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('削除に失敗しました');
        await loadAttendancePanel();
      } catch (err) {
        console.error(err);
        window.alert('出欠状況の削除に失敗しました');
      }
    });

    const wrapper = document.createElement('div');
    wrapper.appendChild(row);
    wrapper.appendChild(namesBox);
    return wrapper;
  }

  async function loadAttendancePanel() {
    attendanceOngoingList.innerHTML = '読み込み中...';
    attendanceHistoryList.innerHTML = '';
    try {
      const res = await fetch('/api/attendance/sessions');
      if (!res.ok) throw new Error('取得に失敗しました');
      const data = await res.json();

      attendanceOngoingList.innerHTML = '';
      if (data.ongoing.length === 0) {
        attendanceOngoingList.innerHTML = '<p class="event-list-empty">現在受付中の出欠確認はありません</p>';
      } else {
        data.ongoing.forEach((s) => attendanceOngoingList.appendChild(renderSessionRow(s)));
      }

      attendanceHistoryList.innerHTML = '';
      if (data.past.length === 0) {
        attendanceHistoryList.innerHTML = '<p class="event-list-empty">過去の出欠確認はありません</p>';
      } else {
        data.past.forEach((s) => attendanceHistoryList.appendChild(renderSessionRow(s)));
      }
    } catch (err) {
      console.error(err);
      attendanceOngoingList.innerHTML = '<p class="event-list-empty">出欠状況の取得に失敗しました</p>';
    }
  }

  loadAttendancePanel();
})();
