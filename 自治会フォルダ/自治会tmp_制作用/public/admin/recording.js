(function () {
  const recordButton = document.getElementById('recordButton');
  const recordTimer = document.getElementById('recordTimer');
  const recordStatus = document.getElementById('recordStatus');
  const minutesLink = document.getElementById('minutesLink');
  const minutesError = document.getElementById('minutesError');
  const fallbackDownload = document.getElementById('fallbackDownload');
  const minutesList = document.getElementById('minutesList');
  const minutesShowAllButton = document.getElementById('minutesShowAllButton');
  const meetingName = document.getElementById('meetingName');
  const meetingDate = document.getElementById('meetingDate');
  const meetingTime = document.getElementById('meetingTime');
  const meetingPlace = document.getElementById('meetingPlace');

  // 今日の日付・現在時刻を初期値にしておく（シニアの方が毎回入力しなくて済むように）
  meetingDate.value = new Date().toLocaleDateString('sv-SE');
  meetingTime.value = new Date().toLocaleTimeString('sv-SE').slice(0, 5);
  const attendeeList = document.getElementById('attendeeList');
  const addAttendeeButton = document.getElementById('addAttendeeButton');

  let attendeeOptionsHtml = '<option value="">— 選択してください —</option>';

  function addAttendeeRow() {
    const select = document.createElement('select');
    select.className = 'select-input attendee-select';
    select.innerHTML = attendeeOptionsHtml;
    attendeeList.appendChild(select);
  }

  async function loadAttendeeOptions() {
    try {
      const res = await fetch('/api/members');
      const data = await res.json();
      const names = Array.from(new Set((data.members || []).map((m) => m.realName).filter(Boolean)));
      attendeeOptionsHtml += names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    } catch (err) {
      console.error(err);
    } finally {
      for (let i = 0; i < 5; i += 1) addAttendeeRow();
    }
  }

  addAttendeeButton.addEventListener('click', addAttendeeRow);
  loadAttendeeOptions();

  async function loadPlaceOptions() {
    try {
      const res = await fetch('/api/places');
      const data = await res.json();
      meetingPlace.innerHTML = '<option value="">— 選択してください —</option>'
        + (data.places || []).map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
    } catch (err) {
      console.error(err);
    }
  }
  loadPlaceOptions();

  async function loadMeetingNameOptions() {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      meetingName.innerHTML = '<option value="">— 選択してください —</option>'
        + (data.events || []).map((ev) => `<option value="${escapeHtml(ev.name)}">${escapeHtml(ev.name)}</option>`).join('');
    } catch (err) {
      console.error(err);
    }
  }
  loadMeetingNameOptions();

  // 議事録送信ボタンで使う「対象グループ」の選択肢（配信ウィザードと同じ一覧）
  let groupOptionsHtml = '';
  async function loadGroupOptions() {
    try {
      const res = await fetch('/api/groups');
      const data = await res.json();
      const names = [...(data.fixedGroups || []), ...(data.roleGroups || []), ...(data.dynamicGroups || [])];
      groupOptionsHtml = names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    } catch (err) {
      console.error(err);
    }
  }
  // 一覧の描画タイミングとの競合を避けるため、Promiseを保持しておき使う直前に待つ
  const groupOptionsReady = loadGroupOptions();

  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let startTime = null;
  let timerInterval = null;

  function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function pickMimeType() {
    const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg'];
    return candidates.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error(err);
      window.alert('マイクへのアクセスが許可されていません。ブラウザの設定を確認してください。');
      return;
    }
    chunks = [];
    const mimeType = pickMimeType();
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = handleStop;
    mediaRecorder.start();

    startTime = Date.now();
    timerInterval = setInterval(() => {
      recordTimer.textContent = formatElapsed(Date.now() - startTime);
    }, 500);
    recordTimer.classList.add('active');
    recordButton.textContent = '⏹ 録音を停止';
    recordButton.classList.add('recording');
    recordStatus.textContent = '録音中です...';
    minutesLink.style.display = 'none';
    minutesError.style.display = 'none';
    fallbackDownload.style.display = 'none';
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    clearInterval(timerInterval);
    recordTimer.classList.remove('active');
    recordButton.textContent = '🔴 録音を開始';
    recordButton.classList.remove('recording');
  }

  function offerFallbackDownload(blob, ext) {
    const url = URL.createObjectURL(blob);
    const defaultName = `録音_${new Date().toLocaleString('ja-JP').replace(/[/:]/g, '-').replace(/\s+/g, '_')}`;
    fallbackDownload.href = url;
    fallbackDownload.download = `${defaultName}.${ext}`;
    fallbackDownload.style.display = 'block';
  }

  async function handleStop() {
    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: mimeType });
    const durationLabel = recordTimer.textContent;
    recordTimer.textContent = '00:00';
    const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';

    minutesLink.style.display = 'none';
    minutesError.style.display = 'none';
    fallbackDownload.style.display = 'none';
    recordStatus.textContent = `議事録を作成中です（録音時間: ${durationLabel}）。数分かかることがあります。このまま画面をお待ちください。`;

    try {
      const attendees = Array.from(document.querySelectorAll('.attendee-select'))
        .map((s) => s.value)
        .filter(Boolean);
      const res = await fetch('/api/minutes', {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          'X-Meeting-Name': encodeURIComponent(meetingName.value || ''),
          'X-Meeting-Date': encodeURIComponent(meetingDate.value || ''),
          'X-Meeting-Time': encodeURIComponent(meetingTime.value || ''),
          'X-Meeting-Place': encodeURIComponent(meetingPlace.value || ''),
          'X-Meeting-Attendees': encodeURIComponent(JSON.stringify(attendees)),
        },
        body: blob,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '議事録の作成に失敗しました');

      recordStatus.textContent = '✅ 議事録が完成しました';
      minutesLink.href = data.url;
      minutesLink.style.display = 'flex';
      loadMinutesList(false);
    } catch (err) {
      console.error(err);
      recordStatus.textContent = '';
      minutesError.textContent = '⚠ 議事録の自動作成に失敗しました。録音データは下からダウンロードできます。';
      minutesError.style.display = 'block';
      offerFallbackDownload(blob, ext);
    }
  }

  recordButton.addEventListener('click', () => {
    if (recordButton.classList.contains('recording')) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function renderMinutesList(items) {
    if (!items.length) {
      minutesList.innerHTML = '<p class="minutes-empty">まだ議事録はありません</p>';
      return;
    }
    minutesList.innerHTML = items.map((item) => `
      <div class="minutes-item" data-id="${item.id}">
        <div class="minutes-item-info">
          <div class="minutes-item-date">${escapeHtml(item.meetingDate)} ${escapeHtml(item.meetingTime)}</div>
          <div class="minutes-item-title">${escapeHtml(item.title)}</div>
        </div>
        <div class="minutes-item-actions">
          <a class="minutes-open-button" href="${escapeHtml(item.driveUrl)}" target="_blank" rel="noopener">開く</a>
          <a class="minutes-edit-button" href="minutes-edit.html?id=${item.id}">編集</a>
          <button class="minutes-delete-button" type="button" data-delete-id="${item.id}">削除</button>
          <button class="minutes-send-button" type="button" data-send-id="${item.id}">送信</button>
          <div class="minutes-send-panel" data-send-panel-id="${item.id}">
            <select class="select-input"></select>
            <button class="send-button" type="button" data-send-confirm-id="${item.id}" data-title="${escapeHtml(item.title)}" data-url="${escapeHtml(item.driveUrl)}">送信する</button>
          </div>
        </div>
        <p class="minutes-send-status" data-send-status-id="${item.id}" style="display:none;"></p>
      </div>
    `).join('');
  }

  async function loadMinutesList(showAll) {
    try {
      const res = await fetch(`/api/minutes${showAll ? '?all=1' : ''}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '一覧の取得に失敗しました');
      renderMinutesList(data.items);
      minutesShowAllButton.style.display = !showAll && data.total > data.items.length ? 'block' : 'none';
    } catch (err) {
      console.error(err);
      minutesList.innerHTML = '<p class="minutes-empty">議事録一覧の取得に失敗しました</p>';
    }
  }

  minutesShowAllButton.addEventListener('click', () => loadMinutesList(true));

  minutesList.addEventListener('click', async (e) => {
    const deleteButton = e.target.closest('[data-delete-id]');
    if (deleteButton) {
      if (!window.confirm('この議事録を削除しますか？（Drive上のPDFも削除されます）')) return;
      deleteButton.disabled = true;
      try {
        const res = await fetch(`/api/minutes/${deleteButton.dataset.deleteId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || '削除に失敗しました');
        loadMinutesList(false);
      } catch (err) {
        console.error(err);
        window.alert('削除に失敗しました');
        deleteButton.disabled = false;
      }
      return;
    }

    const sendButton = e.target.closest('[data-send-id]');
    if (sendButton) {
      const panel = minutesList.querySelector(`[data-send-panel-id="${sendButton.dataset.sendId}"]`);
      if (!panel) return;
      const opening = panel.style.display !== 'flex';
      panel.style.display = opening ? 'flex' : 'none';
      if (opening) {
        await groupOptionsReady;
        const select = panel.querySelector('select');
        if (select && !select.innerHTML) select.innerHTML = groupOptionsHtml;
      }
      return;
    }

    const confirmButton = e.target.closest('[data-send-confirm-id]');
    if (confirmButton) {
      const id = confirmButton.dataset.sendConfirmId;
      const panel = minutesList.querySelector(`[data-send-panel-id="${id}"]`);
      const status = minutesList.querySelector(`[data-send-status-id="${id}"]`);
      const group = panel.querySelector('select').value;
      confirmButton.disabled = true;
      status.style.display = 'block';
      status.textContent = '送信中です...';
      try {
        const res = await fetch('/api/broadcast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            group,
            eventName: `【議事録】${confirmButton.dataset.title}`,
            messageBody: `議事録ができましたのでご確認ください。\n${confirmButton.dataset.url}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '送信に失敗しました');
        status.textContent = `✅ 送信しました（${data.successCount || 0}件）`;
        panel.style.display = 'none';
      } catch (err) {
        console.error(err);
        status.textContent = '⚠ 送信に失敗しました';
      } finally {
        confirmButton.disabled = false;
      }
    }
  });

  loadMinutesList(false);
})();
