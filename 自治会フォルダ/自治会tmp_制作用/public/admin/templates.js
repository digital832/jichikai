(function () {
  const newTemplateText = document.getElementById('newTemplateText');
  const addTemplateButton = document.getElementById('addTemplateButton');
  const templateListContainer = document.getElementById('templateListContainer');

  async function fetchTemplates() {
    const res = await fetch('/api/templates');
    if (!res.ok) throw new Error('定型文取得に失敗しました');
    const data = await res.json();
    return data.templates || [];
  }

  async function loadTemplates() {
    templateListContainer.innerHTML = '読み込み中...';
    try {
      const templates = await fetchTemplates();
      renderTemplateList(templates);
    } catch (err) {
      console.error(err);
      templateListContainer.innerHTML = '<p class="event-list-empty">定型文の取得に失敗しました</p>';
    }
  }

  function renderTemplateList(templates) {
    templateListContainer.innerHTML = '';
    if (templates.length === 0) {
      templateListContainer.innerHTML = '<p class="event-list-empty">登録されている定型文はありません</p>';
      return;
    }
    templates.forEach((t) => templateListContainer.appendChild(renderTemplateRow(t)));
  }

  function renderTemplateRow(t) {
    const row = document.createElement('div');
    row.className = 'template-row';

    const textEl = document.createElement('p');
    textEl.className = 'template-row-text';
    textEl.textContent = t.text;

    const editArea = document.createElement('textarea');
    editArea.className = 'textarea-input template-edit-textarea';
    editArea.value = t.text;
    editArea.hidden = true;

    const actions = document.createElement('div');
    actions.className = 'template-row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'word-button';
    editBtn.textContent = '編集する';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'word-button';
    deleteBtn.textContent = '削除する';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'send-button';
    saveBtn.textContent = '保存する';
    saveBtn.hidden = true;

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'word-button';
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.hidden = true;

    function enterEditMode() {
      textEl.hidden = true;
      editArea.hidden = false;
      editArea.value = t.text;
      editBtn.hidden = true;
      deleteBtn.hidden = true;
      saveBtn.hidden = false;
      cancelBtn.hidden = false;
    }

    function exitEditMode() {
      textEl.hidden = false;
      editArea.hidden = true;
      editBtn.hidden = false;
      deleteBtn.hidden = false;
      saveBtn.hidden = true;
      cancelBtn.hidden = true;
    }

    editBtn.addEventListener('click', enterEditMode);
    cancelBtn.addEventListener('click', exitEditMode);

    saveBtn.addEventListener('click', async () => {
      const text = editArea.value.trim();
      if (!text) {
        window.alert('定型文の内容を入力してください');
        return;
      }
      saveBtn.disabled = true;
      try {
        const res = await fetch(`/api/templates/${t.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error('更新に失敗しました');
        t.text = text;
        textEl.textContent = text;
        exitEditMode();
      } catch (err) {
        console.error(err);
        window.alert('定型文の更新に失敗しました');
      } finally {
        saveBtn.disabled = false;
      }
    });

    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm('この定型文を削除しますか？')) return;
      try {
        const res = await fetch(`/api/templates/${t.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('削除に失敗しました');
        await loadTemplates();
      } catch (err) {
        console.error(err);
        window.alert('定型文の削除に失敗しました');
      }
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);

    row.appendChild(textEl);
    row.appendChild(editArea);
    row.appendChild(actions);
    return row;
  }

  addTemplateButton.addEventListener('click', async () => {
    const text = newTemplateText.value.trim();
    if (!text) {
      window.alert('定型文の内容を入力してください');
      return;
    }
    addTemplateButton.disabled = true;
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('追加に失敗しました');
      newTemplateText.value = '';
      await loadTemplates();
    } catch (err) {
      console.error(err);
      window.alert('定型文の追加に失敗しました');
    } finally {
      addTemplateButton.disabled = false;
    }
  });

  loadTemplates();
})();
