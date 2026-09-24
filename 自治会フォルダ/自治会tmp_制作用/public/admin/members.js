(function () {
  const ROLE_COLOR_PALETTE = ['#06c755', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#6b716f'];
  let roles = [];

  // テキスト無し・丸のみのシンプルな色ドロップダウン。普段は丸1個だけ表示し、クリックで一覧を開く。
  function createColorDropdown(selectedColor, onChange) {
    let current = selectedColor || ROLE_COLOR_PALETTE[0];

    const wrap = document.createElement('div');
    wrap.className = 'color-dropdown';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'color-dot-button';
    toggle.style.background = current;
    wrap.appendChild(toggle);

    const menu = document.createElement('div');
    menu.className = 'color-dropdown-menu';
    menu.hidden = true;
    ROLE_COLOR_PALETTE.forEach((color) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'color-option-dot' + (color === current ? ' selected' : '');
      dot.style.background = color;
      dot.addEventListener('click', () => {
        current = color;
        toggle.style.background = current;
        menu.querySelectorAll('.color-option-dot').forEach((d) => d.classList.remove('selected'));
        dot.classList.add('selected');
        menu.hidden = true;
        onChange(color);
      });
      menu.appendChild(dot);
    });
    wrap.appendChild(menu);

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.color-dropdown-menu').forEach((m) => {
        if (m !== menu) m.hidden = true;
      });
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', () => {
      menu.hidden = true;
    });

    return wrap;
  }
  const memberListContainer = document.getElementById('memberListContainer');
  const roleListContainer = document.getElementById('roleListContainer');
  const roleListOverlay = document.getElementById('roleListOverlay');
  const groupFilterSelect = document.getElementById('groupFilterSelect');
  const memberPaginationEl = document.getElementById('memberPagination');
  const PAGE_SIZE = 30;
  let allMembers = [];
  let currentPage = 1;

  async function fetchSettings() {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('設定の取得に失敗しました');
    return res.json();
  }

  async function fetchMembers() {
    const res = await fetch('/api/members');
    if (!res.ok) throw new Error('名簿の取得に失敗しました');
    const data = await res.json();
    return data.members || [];
  }

  async function fetchRoles() {
    const res = await fetch('/api/roles');
    if (!res.ok) throw new Error('役職の取得に失敗しました');
    const data = await res.json();
    return data.roles || [];
  }

  function findRole(name) {
    return roles.find((r) => r.name === name);
  }

  // 未設定の場合は「一般会員」があればそれをデフォルト表示する（ドロップダウンの表示と役員判定を一致させるため共通化）
  function resolveDefaultRole(currentRole) {
    return currentRole || (findRole('一般会員') ? '一般会員' : (roles[0] ? roles[0].name : ''));
  }

  // 班フィルターのプルダウンを、今読み込んだ名簿に実際に含まれる所属（班）名で作り直す
  function renderGroupFilterOptions() {
    const groups = [...new Set(allMembers.map((m) => m.group).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'ja')
    );
    const current = groupFilterSelect.value;
    groupFilterSelect.innerHTML = '<option value="">すべて</option>';
    groups.forEach((g) => {
      const option = document.createElement('option');
      option.value = g;
      option.textContent = g;
      groupFilterSelect.appendChild(option);
    });
    groupFilterSelect.value = groups.includes(current) ? current : '';
  }

  // 1〜3、現在ページの前後、最後のページだけ出して、間は「…」で省略する
  function buildPaginationItems(current, total) {
    const pages = new Set([1, total, current - 1, current, current + 1]);
    const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
    const items = [];
    let prev = 0;
    sorted.forEach((p) => {
      if (prev && p - prev > 1) items.push('...');
      items.push(p);
      prev = p;
    });
    return items;
  }

  function renderPagination(totalPages) {
    memberPaginationEl.innerHTML = '';
    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.textContent = '←';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', () => {
      currentPage -= 1;
      renderMemberRows();
    });
    memberPaginationEl.appendChild(prevBtn);

    buildPaginationItems(currentPage, totalPages).forEach((item) => {
      if (item === '...') {
        const span = document.createElement('span');
        span.className = 'pagination-ellipsis';
        span.textContent = '…';
        memberPaginationEl.appendChild(span);
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(item);
      if (item === currentPage) btn.className = 'current';
      btn.addEventListener('click', () => {
        currentPage = item;
        renderMemberRows();
      });
      memberPaginationEl.appendChild(btn);
    });

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = '→';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener('click', () => {
      currentPage += 1;
      renderMemberRows();
    });
    memberPaginationEl.appendChild(nextBtn);
  }

  function renderMemberRows() {
    const selectedGroup = groupFilterSelect.value;
    const filtered = allMembers
      .filter((m) => !selectedGroup || m.group === selectedGroup)
      .slice()
      .sort((a, b) => (a.group || '').localeCompare(b.group || '', 'ja') || (a.realName || '').localeCompare(b.realName || '', 'ja'));

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const members = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    memberListContainer.innerHTML = '';
    if (members.length === 0) {
      memberListContainer.innerHTML = '<p class="event-list-empty">名簿に会員が登録されていません</p>';
      memberPaginationEl.innerHTML = '';
      return;
    }
    renderPagination(totalPages);
    members.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'member-row';
      row.innerHTML = `
        <div class="role-select-wrap">
          <div class="member-role-badge"></div>
        </div>
        <div class="member-info">
          <div class="member-name-row">
            <input class="text-input member-name-input" type="text" />
            <a class="message-link-button">メッセージ</a>
          </div>
          <div class="member-sub-row">
            <span class="member-sub-label"></span>
            <button class="member-delete-button" type="button">🗑 削除</button>
          </div>
        </div>
      `;
      row.querySelector('.member-sub-label').textContent = `${m.group || '所属なし'}／${m.lineName || 'LINE名不明'}`;
      const nameInput = row.querySelector('.member-name-input');
      nameInput.value = m.realName || '';
      nameInput.placeholder = 'こんにちは、等の誤入力があれば修正してください';
      nameInput.addEventListener('change', async () => {
        const value = nameInput.value.trim();
        if (!value) {
          window.alert('本名を空にはできません');
          nameInput.value = m.realName || '';
          return;
        }
        nameInput.disabled = true;
        try {
          const res = await fetch(`/api/members/${m.row}/realName`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ realName: value }),
          });
          if (!res.ok) throw new Error('更新に失敗しました');
          m.realName = value;
        } catch (err) {
          console.error(err);
          window.alert('本名の更新に失敗しました');
          nameInput.value = m.realName || '';
        } finally {
          nameInput.disabled = false;
        }
      });
      // 役職の変更は「役員任命」ページだけで行うため、ここでは色付きの表示のみ
      const badge = row.querySelector('.member-role-badge');
      const roleName = resolveDefaultRole(m.role);
      badge.textContent = roleName;
      const role = findRole(roleName);
      const color = role && /^#[0-9a-fA-F]{6}$/.test(role.color) ? role.color : '';
      if (color) badge.style.backgroundColor = color + '2e';
      row.querySelector('.message-link-button').href = 'message.html?row=' + m.row;
      row.querySelector('.member-delete-button').addEventListener('click', () => askDelete(m));

      memberListContainer.appendChild(row);
    });
  }

  async function renderMembers() {
    allMembers = await fetchMembers();
    renderGroupFilterOptions();
    renderMemberRows();
  }

  groupFilterSelect.addEventListener('change', () => {
    currentPage = 1;
    renderMemberRows();
  });

  // 名簿の削除：①はい／いいえの確認 → ②自治会長のパスワード → 削除
  const deleteOverlay = document.getElementById('deleteOverlay');
  const deleteCodeInput = document.getElementById('deleteCodeInput');
  const deleteMessage = document.getElementById('deleteMessage');
  let deleteTarget = null;

  deleteCodeInput.addEventListener('input', () => {
    deleteCodeInput.value = deleteCodeInput.value.replace(/[^0-9]/g, '').slice(0, 6);
  });

  function askDelete(m) {
    const name = m.realName || m.lineName || '（名前なし）';
    if (!window.confirm(`「${name}」さんを名簿から削除します。よろしいですか？`)) return;
    deleteTarget = m;
    document.getElementById('deleteTarget').textContent = `${name} さん`;
    deleteCodeInput.value = '';
    deleteMessage.textContent = '';
    deleteOverlay.classList.add('open');
    deleteCodeInput.focus();
  }

  document.getElementById('deleteCancelButton').addEventListener('click', () => {
    deleteOverlay.classList.remove('open');
    deleteTarget = null;
  });

  document.getElementById('deleteConfirmButton').addEventListener('click', async () => {
    if (!deleteTarget) return;
    if (deleteCodeInput.value.length !== 6) {
      deleteMessage.textContent = '6桁の数字で入力してください';
      return;
    }
    const btn = document.getElementById('deleteConfirmButton');
    btn.disabled = true;
    try {
      const res = await fetch(`/api/members/${deleteTarget.row}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chairmanCode: deleteCodeInput.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      deleteOverlay.classList.remove('open');
      deleteTarget = null;
      await renderMembers();
      window.alert(data.notified ? '削除しました。自治会長にLINEで確認を送りました（間違いならそこから取り消せます）' : '削除しました（自治会長のLINEが見つからないため、確認は送っていません）');
    } catch (err) {
      deleteMessage.textContent = err.message || '削除に失敗しました';
    } finally {
      btn.disabled = false;
    }
  });

  async function moveRole(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= roles.length) return;
    const order = roles.map((r) => ({ name: r.name, color: r.color }));
    const tmp = order[index];
    order[index] = order[target];
    order[target] = tmp;
    try {
      const res = await fetch('/api/roles/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      if (!res.ok) throw new Error('並び替えに失敗しました');
      await refreshRoles();
    } catch (err) {
      console.error(err);
      window.alert('役職の並び替えに失敗しました');
    }
  }

  function renderRoleList() {
    roleListContainer.innerHTML = '';
    if (roles.length === 0) {
      roleListContainer.innerHTML = '<p class="event-list-empty">役職が登録されていません</p>';
      return;
    }
    roles.forEach((r, index) => {
      const row = document.createElement('div');
      row.className = 'event-list-row';
      row.innerHTML = `
        <div class="event-list-info">
          <span class="event-list-name"></span>
        </div>
        <div class="event-list-actions">
          <span class="role-color-slot"></span>
          <button type="button" class="edit-btn" data-action="up">▲</button>
          <button type="button" class="edit-btn" data-action="down">▼</button>
          <button type="button" class="edit-btn">編集</button>
          <button type="button" class="delete-btn">削除</button>
        </div>
      `;
      row.querySelector('.event-list-name').textContent = r.name;
      const colorDropdown = createColorDropdown(r.color, async (color) => {
        try {
          const res = await fetch(`/api/roles/${r.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: r.name, color }),
          });
          if (!res.ok) throw new Error('更新に失敗しました');
          r.color = color;
        } catch (err) {
          console.error(err);
          window.alert('色の更新に失敗しました');
        }
      });
      row.querySelector('.role-color-slot').replaceWith(colorDropdown);
      const [upBtn, downBtn] = row.querySelectorAll('[data-action]');
      upBtn.disabled = index === 0;
      downBtn.disabled = index === roles.length - 1;
      upBtn.addEventListener('click', () => moveRole(index, -1));
      downBtn.addEventListener('click', () => moveRole(index, 1));
      row.querySelector('.edit-btn:not([data-action])').addEventListener('click', async () => {
        const name = window.prompt('新しい役職名を入力してください', r.name);
        if (!name || name === r.name) return;
        try {
          const res = await fetch(`/api/roles/${r.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, color: r.color }),
          });
          if (!res.ok) throw new Error('更新に失敗しました');
          await refreshRoles();
        } catch (err) {
          console.error(err);
          window.alert('役職の更新に失敗しました');
        }
      });
      row.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!window.confirm(`「${r.name}」を削除しますか？`)) return;
        try {
          const res = await fetch(`/api/roles/${r.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('削除に失敗しました');
          await refreshRoles();
        } catch (err) {
          console.error(err);
          window.alert('役職の削除に失敗しました');
        }
      });
      roleListContainer.appendChild(row);
    });
  }

  async function refreshRoles() {
    roles = await fetchRoles();
    renderRoleList();
    await renderMembers();
  }

  document.getElementById('manageRolesButton').addEventListener('click', () => {
    renderRoleList();
    roleListOverlay.classList.add('open');
  });
  document.getElementById('closeRoleListButton').addEventListener('click', () => {
    roleListOverlay.classList.remove('open');
  });
  roleListOverlay.addEventListener('click', (e) => {
    if (e.target === roleListOverlay) roleListOverlay.classList.remove('open');
  });

  let newRoleColor = ROLE_COLOR_PALETTE[0];
  document.getElementById('newRoleColorPicker').appendChild(
    createColorDropdown(newRoleColor, (color) => {
      newRoleColor = color;
    })
  );

  document.getElementById('addRoleButton').addEventListener('click', async () => {
    const input = document.getElementById('newRoleName');
    const name = input.value.trim();
    if (!name) {
      window.alert('役職名を入力してください');
      return;
    }
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newRoleColor }),
      });
      if (!res.ok) throw new Error('追加に失敗しました');
      input.value = '';
      await refreshRoles();
    } catch (err) {
      console.error(err);
      window.alert('役職の追加に失敗しました');
    }
  });

  async function init() {
    const settings = await fetchSettings();
    document.getElementById('communityNameLabel').textContent = settings.communityName || '';
    roles = await fetchRoles();
    await renderMembers();
    // ヘッダーの「役職設定」ボタン（他ページ）から #roles 付きで来た場合、自動で役職マスタを開く
    if (location.hash === '#roles') {
      renderRoleList();
      roleListOverlay.classList.add('open');
    }
  }
  init().catch((err) => {
    console.error(err);
    window.alert('名簿の読み込みに失敗しました');
  });
})();
