(function () {
  var TILES = [
    {
      icon: '📋',
      label: '複製マニュアル',
      hint: '新しい自治会を追加する手順書',
      href: '../複製マニュアル/複製マニュアル.html',
    },
    {
      icon: '✅',
      label: '行政区チェック',
      hint: '班数・世帯数一覧にチェックして合計を集計',
      href: '行政区チェック/index.html',
    },
    {
      icon: '🔁',
      label: '一括更新',
      hint: 'フォルダを開いて起動.batを実行',
      href: 'file:///C:/Users/user/Desktop/%E9%98%BF%E9%83%A8%E5%BC%98%E8%A1%8C/%E3%83%97%E3%83%AD%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88/%E8%87%AA%E6%B2%BB%E4%BC%9A%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0_JS/%E8%87%AA%E6%B2%BB%E4%BC%9A%E3%83%95%E3%82%A9%E3%83%AB%E3%83%80/%E4%B8%80%E6%96%89%E5%8F%8D%E6%98%A0%E3%82%A2%E3%83%97%E3%83%AA/',
    },
    {
      icon: '💬',
      label: 'LINE Business',
      hint: '公式アカウントの作成・管理',
      href: 'https://manager.line.biz/',
      external: true,
    },
    {
      icon: '🛠',
      label: 'LINE Developers',
      hint: 'チャネルアクセストークンの発行',
      href: 'https://developers.line.biz/console/',
      external: true,
    },
    {
      icon: '📁',
      label: '自治会フォルダ',
      hint: 'Google Driveの管理用フォルダ',
      href: 'https://drive.google.com/drive/u/0/folders/1EGJTYglw-8HDXNEFYA9whAu72UbUAnEl',
      external: true,
    },
    {
      icon: '🐙',
      label: 'GitHub',
      hint: 'リポジトリ一覧',
      href: 'https://github.com/abeeeeen1982-debug',
      external: true,
    },
    {
      icon: '☁',
      label: 'Cloud Run',
      hint: 'jichikai-tmp のサービス一覧',
      href: 'https://console.cloud.google.com/run?project=jichikai-tmp',
      external: true,
    },
  ];

  var grid = document.getElementById('tileGrid');
  TILES.forEach(function (t) {
    var a = document.createElement('a');
    a.className = 'tile';
    a.href = t.href;
    if (t.external) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    a.innerHTML =
      '<span class="tile-icon">' + t.icon + '</span>' +
      '<span class="tile-label"></span>' +
      '<span class="tile-hint"></span>';
    a.querySelector('.tile-label').textContent = t.label;
    a.querySelector('.tile-hint').textContent = t.hint;
    grid.appendChild(a);
  });

  // 独立GAS（自治会サイトとは別に、Googleのアプリスクリプトで動いているもの）の一覧。
  // コードの直し方・反映方法を忘れないよう、ソースの場所と手順をここにまとめる。新しく独立GASを作ったら1件追加する
  var GAS_PROJECTS = [
    {
      name: '班Webhook（LINE受信・本名登録）',
      role: '全班共通。LINEのWebhookを受け、友だち追加で名簿の行を作り、本名登録ページを返す。出欠ボタンの処理もここ',
      editor: 'https://script.google.com/d/1jz-J6nushUoyD5YkijONdKJnaDRwTM5inUaY0u-Ttj4LvfuzwE9JQ6fd/edit',
      exec: 'https://script.google.com/macros/s/AKfycbzo1TUhnvOKPz4EmCQwT4j3rbKpx5DBOxe-3tmYDjCRsn3FCi-2N8fv1310lYcLAxNa/exec',
      source: 'プロジェクト/自治会システム_JS/複製マニュアル/班スクリプト',
      deploy: 'clasp push --force → clasp deploy --deploymentId AKfycbzo1TUhnvOKPz4EmCQwT4j3rbKpx5DBOxe-3tmYDjCRsn3FCi-2N8fv1310lYcLAxNa',
      note: '班ごとのWebhook URLは 上のURL?ss=<班シートID>（複製マニュアルツールの「班のWebhook URL一覧」に出る）',
    },
    {
      name: '班別LINEリスト準備ツール（複製マニュアル）',
      role: '自治会フォルダの複製・班シート作成・QRコード生成/一括更新・名簿の吸い上げトリガー',
      editor: 'https://script.google.com/d/1B1tF-9Z48g0TfDX9iwxh_MWZ0kj71ev8B44wUFcGi06OTcymc5B63uuS/edit',
      exec: 'https://script.google.com/macros/s/AKfycbyeSCYKF9WxD31WKHZDWAkS2LNnaWoj7MaRsghjOaGl2Rp08bzgqUmOqWSMmYEzxLykeA/exec',
      source: 'プロジェクト/自治会システム_JS/複製マニュアル/gas',
      deploy: 'clasp push --force → clasp deploy --deploymentId AKfycbyeSCYKF9WxD31WKHZDWAkS2LNnaWoj7MaRsghjOaGl2Rp08bzgqUmOqWSMmYEzxLykeA',
      note: '新しい外部通信を足した直後は、エディタで該当関数を1回実行して承認が必要',
    },
  ];

  var gasList = document.getElementById('gasList');
  GAS_PROJECTS.forEach(function (g) {
    var box = document.createElement('div');
    box.className = 'gas-card';
    box.innerHTML =
      '<div class="gas-name"></div>' +
      '<div class="gas-role"></div>' +
      '<div class="gas-links">' +
        '<a class="gas-link gas-editor" target="_blank" rel="noopener">コードを開く（エディタ） ↗</a>' +
        '<a class="gas-link gas-exec" target="_blank" rel="noopener">公開URL ↗</a>' +
      '</div>' +
      '<div class="gas-meta"><b>ソース：</b><span class="gas-source"></span></div>' +
      '<div class="gas-meta"><b>反映：</b><span class="gas-deploy"></span></div>' +
      '<div class="gas-meta"><b>メモ：</b><span class="gas-note"></span></div>';
    box.querySelector('.gas-name').textContent = g.name;
    box.querySelector('.gas-role').textContent = g.role;
    box.querySelector('.gas-editor').href = g.editor;
    box.querySelector('.gas-exec').href = g.exec;
    box.querySelector('.gas-source').textContent = g.source;
    box.querySelector('.gas-deploy').textContent = g.deploy;
    box.querySelector('.gas-note').textContent = g.note;
    gasList.appendChild(box);
  });

  // 班のWebhook URL一覧：複製マニュアルのGAS（独立GAS）から取得する。
  // 鍵は複製マニュアル/gas/コード.js の ADMIN_LAUNCHER_KEY と同じ値（合わないと取得できない）
  var TOOL_EXEC_URL = 'https://script.google.com/macros/s/AKfycbyeSCYKF9WxD31WKHZDWAkS2LNnaWoj7MaRsghjOaGl2Rp08bzgqUmOqWSMmYEzxLykeA/exec';
  var LAUNCHER_KEY = '01cbef3b8d4fc6769eb15cf2576b97a3';

  var webhookFetchButton = document.getElementById('webhookFetchButton');
  var webhookStatus = document.getElementById('webhookStatus');
  var webhookList = document.getElementById('webhookList');

  function copyToClipboard(text, button) {
    function done() {
      var original = button.textContent;
      button.textContent = 'コピーしました';
      setTimeout(function () { button.textContent = original; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { window.prompt('コピーしてください', text); });
    } else {
      window.prompt('コピーしてください', text);
    }
  }

  function renderWebhookList(list) {
    webhookList.innerHTML = '';
    if (!list.length) {
      webhookList.textContent = '対象の班が見つかりませんでした。';
      return;
    }
    var currentOrg = null;
    list.forEach(function (item) {
      if (item.org !== currentOrg) {
        currentOrg = item.org;
        var h = document.createElement('div');
        h.className = 'webhook-org';
        h.textContent = currentOrg;
        webhookList.appendChild(h);
      }
      var row = document.createElement('div');
      row.className = 'webhook-row';
      var name = document.createElement('div');
      name.className = 'webhook-han';
      name.textContent = item.han;
      var url = document.createElement('div');
      url.className = 'webhook-url';
      url.textContent = item.url;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'webhook-copy';
      btn.textContent = 'コピー';
      btn.addEventListener('click', function () { copyToClipboard(item.url, btn); });
      row.appendChild(name);
      row.appendChild(url);
      row.appendChild(btn);
      webhookList.appendChild(row);
    });
  }

  webhookFetchButton.addEventListener('click', function () {
    webhookFetchButton.disabled = true;
    webhookStatus.textContent = '読み込み中…（数秒〜数十秒かかります）';
    webhookList.innerHTML = '';
    fetch(TOOL_EXEC_URL + '?action=listHanWebhookUrls&key=' + encodeURIComponent(LAUNCHER_KEY))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || '取得に失敗しました');
        webhookStatus.textContent = '✅ ' + data.list.length + '班ぶん';
        renderWebhookList(data.list);
      })
      .catch(function (err) {
        webhookStatus.textContent = '失敗しました：' + err.message;
      })
      .then(function () { webhookFetchButton.disabled = false; });
  });

  // ---- 設定チェック（QRコード・班Webhook）：複製マニュアルのGASに直接問い合わせて、
  //      「複製したのに動いていない」を後から気づくのではなく先に一覧で見られるようにする ----
  var checkFetchButton = document.getElementById('checkFetchButton');
  var checkStatus = document.getElementById('checkStatus');
  var checkList = document.getElementById('checkList');

  function renderCheckList(orgs) {
    checkList.innerHTML = '';
    if (!orgs.length) {
      checkList.textContent = '対象の自治会が見つかりませんでした。';
      return;
    }
    var problemCount = 0;
    orgs.forEach(function (org) {
      var h = document.createElement('div');
      h.className = 'webhook-org';
      h.textContent = org.org;
      checkList.appendChild(h);

      var row = document.createElement('div');
      row.className = 'webhook-row';

      var qrOk = Boolean(org.qr && org.qr.ok);
      var qrLine = document.createElement('div');
      qrLine.className = 'check-line ' + (qrOk ? (org.qr.warn ? 'warn' : 'ok') : 'bad');
      qrLine.textContent = (qrOk ? '✅' : '❌') + ' QRコード: ' + (org.qr ? org.qr.detail : '不明');
      row.appendChild(qrLine);
      if (!qrOk) problemCount += 1;

      (org.hans || []).forEach(function (han) {
        var line = document.createElement('div');
        line.className = 'check-line ' + (han.ok ? 'ok' : 'bad');
        line.textContent = (han.ok ? '✅' : '❌') + ' ' + han.han + ': ' + han.detail;
        row.appendChild(line);
        if (!han.ok) problemCount += 1;
      });

      checkList.appendChild(row);
    });
    checkStatus.textContent = problemCount === 0
      ? '✅ 問題なし（' + orgs.length + '自治会）'
      : '⚠ ' + problemCount + '件、確認が必要です';
  }

  checkFetchButton.addEventListener('click', function () {
    checkFetchButton.disabled = true;
    checkStatus.textContent = 'チェック中…（自治会・班の数によっては数十秒かかります）';
    checkList.innerHTML = '';
    fetch(TOOL_EXEC_URL + '?action=checkAllConfigurations&key=' + encodeURIComponent(LAUNCHER_KEY))
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok) throw new Error(data.error || '取得に失敗しました');
        renderCheckList(data.orgs);
      })
      .catch(function (err) {
        checkStatus.textContent = '失敗しました：' + err.message;
      })
      .then(function () { checkFetchButton.disabled = false; });
  });

  // 実際にデプロイ済みの自治会サイト一覧。新しい自治会を複製・デプロイしたら、ここにも1行追加する
  var SITES = [
    { name: '架空自治会（本家・検証用）', url: 'https://jichikai-1048017269324.asia-northeast1.run.app/admin/home.html' },
    { name: 'サンプル自治会', url: 'https://jichikai-sample-1048017269324.asia-northeast1.run.app/admin/home.html' },
    { name: '上田中架空', url: 'https://kamitanaka-kaku-1048017269324.asia-northeast1.run.app/admin/home.html' },
  ];

  var siteList = document.getElementById('siteList');
  SITES.forEach(function (s) {
    var a = document.createElement('a');
    a.className = 'site-row';
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML =
      '<span>' +
        '<span class="site-name"></span><br/>' +
        '<span class="site-url"></span>' +
      '</span>' +
      '<span class="site-arrow">↗</span>';
    a.querySelector('.site-name').textContent = s.name;
    a.querySelector('.site-url').textContent = s.url.replace('/admin/home.html', '');
    siteList.appendChild(a);
  });
})();
