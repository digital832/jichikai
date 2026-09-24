(function () {
  const editLoading = document.getElementById('editLoading');
  const editForm = document.getElementById('editForm');
  const editTitle = document.getElementById('editTitle');
  const editDate = document.getElementById('editDate');
  const editTime = document.getElementById('editTime');
  const editPlace = document.getElementById('editPlace');
  const editAttendeeList = document.getElementById('editAttendeeList');
  const editAddAttendeeButton = document.getElementById('editAddAttendeeButton');
  const editSummary = document.getElementById('editSummary');
  const saveButton = document.getElementById('saveButton');
  const saveStatus = document.getElementById('saveStatus');

  const id = new URLSearchParams(window.location.search).get('id');

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  let attendeeOptionsHtml = '<option value="">— 選択してください —</option>';

  function addAttendeeRow(selectedValue) {
    const select = document.createElement('select');
    select.className = 'select-input attendee-select';
    select.innerHTML = attendeeOptionsHtml;
    if (selectedValue) {
      const hasOption = [...select.options].some((o) => o.value === selectedValue);
      if (!hasOption) select.innerHTML += `<option value="${escapeHtml(selectedValue)}">${escapeHtml(selectedValue)}</option>`;
      select.value = selectedValue;
    }
    editAttendeeList.appendChild(select);
  }

  async function loadAttendeeOptions(existingAttendees) {
    try {
      const res = await fetch('/api/members');
      const data = await res.json();
      const names = Array.from(new Set((data.members || []).map((m) => m.realName).filter(Boolean)));
      attendeeOptionsHtml += names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    } catch (err) {
      console.error(err);
    } finally {
      const rows = Math.max(5, existingAttendees.length);
      for (let i = 0; i < rows; i += 1) addAttendeeRow(existingAttendees[i]);
    }
  }

  async function loadPlaceOptions(currentPlace) {
    try {
      const res = await fetch('/api/places');
      const data = await res.json();
      editPlace.innerHTML = '<option value="">— 選択してください —</option>'
        + (data.places || []).map((p) => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
      if (currentPlace) {
        const hasOption = [...editPlace.options].some((o) => o.value === currentPlace);
        if (!hasOption) editPlace.innerHTML += `<option value="${escapeHtml(currentPlace)}">${escapeHtml(currentPlace)}</option>`;
        editPlace.value = currentPlace;
      }
    } catch (err) {
      console.error(err);
    }
  }

  editAddAttendeeButton.addEventListener('click', () => addAttendeeRow());

  async function load() {
    if (!id) {
      editLoading.textContent = '議事録が指定されていません';
      return;
    }
    try {
      const res = await fetch(`/api/minutes/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取得に失敗しました');
      const item = data.item;
      editTitle.value = item.title;
      editDate.value = item.meetingDate || '';
      editTime.value = item.meetingTime || '';
      editSummary.value = item.summaryText;
      await Promise.all([loadPlaceOptions(item.place), loadAttendeeOptions(item.attendees || [])]);
      editLoading.style.display = 'none';
      editForm.style.display = 'block';
    } catch (err) {
      console.error(err);
      editLoading.textContent = '議事録の取得に失敗しました';
    }
  }

  saveButton.addEventListener('click', async () => {
    const title = editTitle.value.trim();
    if (!title) {
      window.alert('タイトルを入力してください');
      return;
    }
    saveButton.disabled = true;
    saveStatus.textContent = '保存中です（PDFを作り直しています。少しお待ちください）...';
    try {
      const attendees = Array.from(document.querySelectorAll('.attendee-select'))
        .map((s) => s.value)
        .filter(Boolean);
      const res = await fetch(`/api/minutes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          meetingDate: editDate.value,
          meetingTime: editTime.value,
          place: editPlace.value,
          attendees,
          summaryText: editSummary.value,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || '保存に失敗しました');
      window.location.href = 'recording.html';
    } catch (err) {
      console.error(err);
      saveStatus.textContent = '';
      window.alert('保存に失敗しました');
      saveButton.disabled = false;
    }
  });

  load();
})();
