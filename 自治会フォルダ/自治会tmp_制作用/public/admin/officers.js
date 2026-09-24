(function () {
  const INITIAL_ROW_COUNT = 10;
  let members = [];
  let roles = [];
  let chairmanCode = '';

  function onlyDigits(input) {
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 6);
    });
  }

  const chairmanGateArea = document.getElementById('chairmanGateArea');
  const appointFormArea = document.getElementById('appointFormArea');
  const chairmanCodeInput = document.getElementById('chairmanCode');
  const gateMessage = document.getElementById('gateMessage');
  onlyDigits(chairmanCodeInput);

  function showGateMessage(text, type) {
    gateMessage.textContent = text;
    gateMessage.className = `password-message ${type || ''}`;
  }

  document.getElementById('gateConfirmButton').addEventListener('click', async () => {
    const code = chairmanCodeInput.value;
    if (code.length !== 6) {
      showGateMessage('6桁の数字で入力してください', 'error');
      return;
    }
    const btn = document.getElementById('gateConfirmButton');
    btn.disabled = true;
    try {
      const res = await fetch('/api/auth/verify-passcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '番号が正しくありません');
      chairmanCode = code;
      await loadData();
      chairmanGateArea.hidden = true;
      appointFormArea.hidden = false;
    } catch (err) {
      showGateMessage(err.message || '番号が正しくありません', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  const appointRowsContainer = document.getElementById('appointRows');
  const appointMessage = document.getElementById('appointMessage');
  function showAppointMessage(text, type) {
    appointMessage.textContent = text;
    appointMessage.className = `password-message ${type || ''}`;
  }

  // 役職の変更はこのページだけで行う。任命は「自治会長」「役員」（配信機能の役員判定と揃える）、解任は「一般会員」に戻す
  const ROLE_CHOICES = ['自治会長', '役員', '一般会員'];

  function buildGroupOptions(select) {
    const groups = [...new Set(members.map((m) => m.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));
    select.innerHTML = '<option value="">（未選択）</option>' + groups.map((g) => `<option value="${g}">${g}</option>`).join('');
  }

  function buildNameOptions(select, group) {
    if (!group) {
      select.innerHTML = '<option value="">（未選択）</option>';
      return;
    }
    const inGroup = members
      .filter((m) => m.group === group)
      .sort((a, b) => (a.realName || '').localeCompare(b.realName || '', 'ja'));
    select.innerHTML =
      '<option value="">（未選択）</option>' +
      inGroup.map((m) => `<option value="${m.lineUserId}">${m.realName || m.lineName}</option>`).join('');
  }

  // 役職マスタで決めた色を、名簿一覧と同じ薄い背景色で表示する
  function applyRoleColor(select) {
    const role = roles.find((r) => r.name === select.value);
    const color = role && /^#[0-9a-fA-F]{6}$/.test(role.color) ? role.color : '';
    select.style.backgroundColor = color ? color + '2e' : '';
  }

  function buildRoleOptions(select) {
    select.innerHTML = ROLE_CHOICES.map((r) => `<option value="${r}">${r === '一般会員' ? '一般会員（解任）' : r}</option>`).join('');
    select.value = '役員';
    applyRoleColor(select);
    select.addEventListener('change', () => applyRoleColor(select));
  }

  function addAppointRow() {
    const row = document.createElement('div');
    row.className = 'appoint-row';
    row.innerHTML = `
      <div class="appoint-row-top">
        <select class="select-input appoint-role"></select>
        <select class="select-input appoint-group"></select>
      </div>
      <div class="appoint-row-name">
        <select class="select-input appoint-name"></select>
      </div>
      <div class="appoint-row-bottom">
        <label class="appoint-issue-label"><input type="checkbox" class="appoint-share-check" /> パスワードを共有する</label>
      </div>
    `;
    const roleSelect = row.querySelector('.appoint-role');
    const groupSelect = row.querySelector('.appoint-group');
    const nameSelect = row.querySelector('.appoint-name');

    buildRoleOptions(roleSelect);
    buildGroupOptions(groupSelect);
    buildNameOptions(nameSelect, '');

    groupSelect.addEventListener('change', () => {
      buildNameOptions(nameSelect, groupSelect.value);
    });

    appointRowsContainer.appendChild(row);
  }

  async function loadData() {
    const [membersRes, rolesRes] = await Promise.all([fetch('/api/members'), fetch('/api/roles')]);
    const membersData = await membersRes.json();
    const rolesData = await rolesRes.json();
    members = membersData.members || [];
    roles = rolesData.roles || [];

    appointRowsContainer.innerHTML = '';
    for (let i = 0; i < INITIAL_ROW_COUNT; i += 1) addAppointRow();
  }

  document.getElementById('addAppointRowButton').addEventListener('click', addAppointRow);

  document.getElementById('appointSubmitButton').addEventListener('click', async () => {
    const rows = [...appointRowsContainer.querySelectorAll('.appoint-row')];
    const entries = rows
      .map((row) => ({
        lineUserId: row.querySelector('.appoint-name').value,
        role: row.querySelector('.appoint-role').value,
        share: row.querySelector('.appoint-share-check').checked,
      }))
      .filter((e) => e.lineUserId);

    if (entries.length === 0) {
      showAppointMessage('名前を選んだ行がありません', 'error');
      return;
    }
    if (entries.some((e) => e.role === '一般会員' && e.share)) {
      showAppointMessage('一般会員にはパスワードを共有できません', 'error');
      return;
    }

    const btn = document.getElementById('appointSubmitButton');
    btn.disabled = true;
    let successCount = 0;
    const errors = [];

    // 1) 役職の割り当て（行ごと）
    for (const e of entries) {
      const member = members.find((m) => m.lineUserId === e.lineUserId);
      const name = member ? member.realName || member.lineName : e.lineUserId;
      if (!member || member.role === e.role) {
        successCount += 1;
        continue;
      }
      try {
        const roleRes = await fetch(`/api/members/${member.row}/role`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: e.role }),
        });
        if (!roleRes.ok) throw new Error(`${name}: 役職の更新に失敗しました`);
        member.role = e.role;
        successCount += 1;
      } catch (err) {
        console.error(err);
        errors.push(err.message);
      }
    }

    // 2) チェックした人にだけ、今の共通パスワードをまとめて共有
    const shareTargets = entries.filter((e) => e.share).map((e) => e.lineUserId);
    if (shareTargets.length > 0) {
      try {
        const res = await fetch('/api/auth/share-passcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineUserIds: shareTargets, chairmanCode }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '共有に失敗しました');
        (data.results || []).forEach((r) => {
          if (!r.ok) errors.push(`${r.name}: ${r.error || '共有に失敗しました'}`);
        });
      } catch (err) {
        console.error(err);
        errors.push(err.message || '共有に失敗しました');
      }
    }

    btn.disabled = false;

    if (errors.length === 0) {
      fetch('/api/auth/handover-notify', { method: 'POST' }).catch(() => {});
      showAppointMessage(`${entries.length}件、処理しました`, 'success');
    } else {
      showAppointMessage(`一部失敗しました: ${errors.join(' / ')}`, 'error');
    }
    // 送信したら共有チェックは必ず外す（誤って再送しないように）
    rows.forEach((row) => {
      row.querySelector('.appoint-share-check').checked = false;
    });
  });
})();
