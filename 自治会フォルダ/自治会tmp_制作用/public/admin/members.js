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

  function buildRoleOptions(select, currentRole) {
    select.innerHTML = '';
    roles.forEach((r) => {
      const option = document.createElement('option');
      option.value = r.name;
      option.textContent = r.name;
      select.appendChild(option);
    });
    // 未設定の場合は「一般会員」があればそれをデフォルト表示する
    const defaultRole = currentRole || (findRole('一般会員') ? '一般会員' : (roles[0] ? roles[0].name : ''));
    select.value = defaultRole;
  }

  async function renderMembers() {
    const members = await fetchMembers();
    memberListContainer.innerHTML = '';
    if (members.length === 0) {
      memberListContainer.innerHTML = '<p class="event-list-empty">名簿に会員が登録されていません</p>';
      return;
    }
    members.forEach((m) => {
      const row = document.createElement('div');
      row.className = 'member-row';
      row.innerHTML = `
        <div class="member-info">
          <input class="text-input member-name-input" type="text" />
          <span class="member-meta"></span>
        </div>
        <div class="role-select-wrap">
          <span class="role-color-dot"></span>
          <select class="select-input member-role-select"></select>
        </div>
      `;
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
      row.querySelector('.member-meta').textContent = `LINE名: ${m.lineName} / 所属: ${m.group || '未設定'}`;
      const select = row.querySelector('.member-role-select');
      const colorDot = row.querySelector('.role-color-dot');
      buildRoleOptions(select, m.role);
      function updateColorDot() {
        const role = findRole(select.value);
        colorDot.style.background = role ? role.color : '#d5d9d6';
      }
      updateColorDot();
      select.addEventListener('change', async () => {
        select.disabled = true;
        try {
          const res = await fetch(`/api/members/${m.row}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: select.value }),
          });
          if (!res.ok) throw new Error('更新に失敗しました');
          updateColorDot();
        } catch (err) {
          console.error(err);
          window.alert('役職の更新に失敗しました');
        } finally {
          select.disabled = false;
        }
      });
      memberListContainer.appendChild(row);
    });
  }

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
    roles = await fetchRoles();
    await renderMembers();
  }
  init().catch((err) => {
    console.error(err);
    window.alert('名簿の読み込みに失敗しました');
  });
})();
