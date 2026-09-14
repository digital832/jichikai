// 一斉反映アプリ（サーバー）
// Node.js標準機能のみで動作します（npm installは不要です）。
// 「自治会フォルダ」の中から「自治会tmp_制作用」以外の全フォルダ（＝各自治会）を見つけ、
// テンプレートの最新内容をコピーして、各自治会自身のGitHubリポジトリへpushします。

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = 4173;
const APP_DIR = __dirname;
const PARENT_DIR = path.join(APP_DIR, '..'); // 自治会フォルダ
const TEMPLATE_NAME = '自治会tmp_制作用';
const APP_DIR_NAME = path.basename(APP_DIR); // このアプリ自身のフォルダ名（一覧から除外する）
const TEMPLATE_DIR = path.join(PARENT_DIR, TEMPLATE_NAME);

const EXCLUDE_NAMES = new Set(['.git', 'node_modules', '.env']);

function listOrgDirs() {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    throw new Error(`テンプレートフォルダが見つかりません: ${TEMPLATE_DIR}`);
  }
  return fs.readdirSync(PARENT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== TEMPLATE_NAME && name !== APP_DIR_NAME);
}

function copyTemplateInto(orgPath) {
  fs.cpSync(TEMPLATE_DIR, orgPath, {
    recursive: true,
    force: true,
    filter: (src) => {
      const base = path.basename(src);
      return !EXCLUDE_NAMES.has(base);
    },
  });
}

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function syncOrg(orgName) {
  const orgPath = path.join(PARENT_DIR, orgName);
  copyTemplateInto(orgPath);

  runGit(['add', '-A'], orgPath);
  const status = runGit(['status', '--porcelain'], orgPath);

  if (!status.trim()) {
    return { org: orgName, status: 'no-change', message: '変更なし（すでに最新です）' };
  }

  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace('T', ' ');
  runGit(['commit', '-m', `テンプレート更新を反映 (${stamp})`], orgPath);

  try {
    runGit(['push'], orgPath);
  } catch (err) {
    return {
      org: orgName,
      status: 'push-failed',
      message: `コミットはできましたが、pushに失敗しました: ${err.message}`,
    };
  }

  return { org: orgName, status: 'done', message: '反映してpushしました' };
}

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function serveStaticFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (chunk) => { chunks += chunk; });
    req.on('end', () => resolve(chunks));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      serveStaticFile(res, path.join(APP_DIR, 'public', 'index.html'), 'text/html; charset=utf-8');
      return;
    }

    if (req.method === 'GET' && req.url === '/api/orgs') {
      const orgs = listOrgDirs();
      sendJson(res, 200, { orgs });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/sync') {
      const raw = await readBody(req);
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch (e) { /* 空でも続行 */ }
      const targetOrgs = Array.isArray(body.orgs) && body.orgs.length ? body.orgs : listOrgDirs();
      const dryRun = !!body.dryRun;

      const results = [];
      for (const orgName of targetOrgs) {
        if (dryRun) {
          results.push({ org: orgName, status: 'dry-run', message: '実行対象として確認しました（まだ反映していません）' });
          continue;
        }
        try {
          results.push(syncOrg(orgName));
        } catch (err) {
          results.push({ org: orgName, status: 'error', message: `失敗しました: ${err.message}` });
        }
      }
      sendJson(res, 200, { results });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    sendJson(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`一斉反映アプリを起動しました: http://localhost:${PORT}/`);
  console.log('このウィンドウは閉じずに、ブラウザでの操作が終わったら閉じてください。');
});
