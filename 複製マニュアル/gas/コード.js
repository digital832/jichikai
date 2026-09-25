/**
 * 班別LINEリスト準備ツール（Apps Script版）
 *
 * これ1つで「フォームの画面」と「Googleドライブを操作する処理」がまとまっています。
 * ローカルのHTMLファイルは使わず、このプロジェクトをWebアプリとして公開したURLを
 * そのまま使ってください。
 *
 * やること：
 *  A) マスターの「テンプレート」フォルダ（グループフォルダ・リストtmp・_名簿ごと）を
 *     この自治会用に丸ごと複製する（名簿は自治会名にリネームしてサービスアカウントに共有）
 *  B) 複製したフォルダの中の「リストtmp」を班ごとに複製し、
 *     ファイル名を班名にして、C1セルにチャンネルアクセストークンを貼り付ける
 *
 * 【セットアップ手順（最初の1回だけ）】
 * 1. https://script.google.com/ で「新しいプロジェクト」を作成
 * 2. このファイルの中身を全部コピーして、最初から入っている Code.gs に貼り付け
 * 3. 左メニューの「＋」→「HTML」で index という名前のファイルを作成し、
 *    index.html の中身を貼り付け（拡張子 .html は自動で付くので、ファイル名は index のみ）
 * 4. 右上「デプロイ」→「新しいデプロイ」→種類は「ウェブアプリ」
 *    ・実行するユーザー：自分（Me）
 *    ・アクセスできるユーザー：自分のみ（他の担当者にも使わせたい場合は
 *      「Google アカウントを持つ全員」にしてください）
 *    でデプロイし、発行されたURLを開けばそのままツールが使えます
 * 5. 以後、コードを直したときは「デプロイ」→「デプロイを管理」→鉛筆アイコンから
 *    「新しいバージョン」でデプロイし直せば、同じURLのまま更新されます
 *
 * 【アクセス制限について】
 * 「アクセスできるユーザー」を絞っておけば、Googleへのログインがそのまま
 * 認証になります（このツール専用の合言葉のようなものを別途用意する必要はありません）。
 *
 * 【トラブルシューティング：「UrlFetchApp.fetchを呼び出す権限がありません」エラーが出たら】
 * QRコード生成など、外部サイトへの通信（UrlFetchApp）を新しく使うコードを追加した直後に
 * このエラーが起きることがあります。Webアプリは「デプロイした人（自分）」の権限で動くため、
 * コードに新しい権限（外部通信など）が必要になったら、一度だけ自分自身で許可し直す必要が
 * あります（デプロイをやり直しても直りません）。直し方：
 * 1. このエディタ上部の関数選択プルダウンで、実際に外部通信を使う関数
 *    （例：generateAndSaveFriendQrCode）を選ぶ（doGetなど無関係な関数ではダメ）
 * 2. 左の「▶ 実行」を押す
 * 3. 「承認が必要です」のポップアップ→ Googleアカウントを選択 →「詳細」→
 *    「（プロジェクト名）に移動（安全ではないページ）」→「許可」と進む
 * 4. これでWebアプリ側でも同じ権限が使えるようになります
 * （ページを開きっぱなしだと新しい関数が一覧に出ないことがあるので、その場合は再読み込み）
 */

var TEMPLATE_FILE_NAME = 'リストtmp';
// マスターの「テンプレート」フォルダのID（グループフォルダ・リストtmp・_名簿ごと）
// https://drive.google.com/drive/folders/【ここの部分】?usp=drive_link
var MASTER_TEMPLATE_FOLDER_ID = '1Y1kfOTFH0u3JzniYNgDs_rbCF-pxjfkV';
// テンプレートフォルダの中に入っている名簿スプレッドシートのファイル名
var ROSTER_TEMPLATE_FILE_NAME = '_名簿';
// システムが名簿スプレッドシートを読み書きするのに使うサービスアカウント
var SERVICE_ACCOUNT_EMAIL = 'id-533@jichikai-tmp.iam.gserviceaccount.com';

function doGet(e) {
  // 各自治会アプリの「今すぐ更新」ボタンから ?action=syncNow で呼ばれた場合は、
  // 画面は返さずその場でsyncAllHanToRosterを実行してJSONを返す（手動プッシュ用の抜け道）
  if (e && e.parameter && e.parameter.action === 'syncNow') {
    var result;
    try {
      result = syncAllHanToRoster();
      return ContentService.createTextOutput(JSON.stringify({ ok: true, result: result }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 全自治会の名簿スプレッドシートに対して、本家に対して足りないタブを一括で埋める
  if (e && e.parameter && e.parameter.action === 'fixAllMissingTabs') {
    try {
      var allResult = fixAllOrgsMissingTabs();
      return ContentService.createTextOutput(JSON.stringify({ ok: true, result: allResult }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 修復用：本家の名簿スプレッドシートを基準に、指定したスプレッドシートに足りないタブをコピーして補う
  // （「_名簿」複製テンプレートに議事録・管理設定・決算書・予算マスタ・科目マスタが最初から欠けていた不具合の対処）
  if (e && e.parameter && e.parameter.action === 'fixMissingTabs' && e.parameter.id) {
    try {
      var targetId = e.parameter.id;
      if (targetId === 'template') {
        var templateFile = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID).getFilesByName(ROSTER_TEMPLATE_FILE_NAME);
        if (!templateFile.hasNext()) throw new Error('テンプレートの_名簿が見つかりません');
        targetId = templateFile.next().getId();
      }
      var result = fixMissingTabs(targetId);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, result: result }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 修復用：議事録タブの特定行を直す（列がズレている行の中身を左に詰める）
  if (e && e.parameter && e.parameter.action === 'realignMinutesRows' && e.parameter.id && e.parameter.rows) {
    try {
      var sheet = SpreadsheetApp.openById(e.parameter.id).getSheetByName('議事録');
      var rowNums = e.parameter.rows.split(',').map(Number);
      var fixedRows = [];
      rowNums.forEach(function (rowNum) {
        var values = sheet.getRange(rowNum, 1, 1, 14).getValues()[0];
        if (values[0] !== '' || values[5] === '') return; // 既に正常、または対象外なのでスキップ
        var shifted = values.slice(5).concat(['', '', '', '', '']);
        sheet.getRange(rowNum, 1, 1, 14).setNumberFormat('@'); // 日付・時刻に自動変換されないよう文字列固定
        sheet.getRange(rowNum, 1, 1, 14).setValues([shifted]);
        fixedRows.push(rowNum);
      });
      return ContentService.createTextOutput(JSON.stringify({ ok: true, fixedRows: fixedRows }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 修復用：議事録タブの特定行を削除する（他自治会のデータが紛れ込んだ場合の掃除用）
  if (e && e.parameter && e.parameter.action === 'deleteMinutesRows' && e.parameter.id && e.parameter.rows) {
    try {
      var delSheet = SpreadsheetApp.openById(e.parameter.id).getSheetByName('議事録');
      var delRowNums = e.parameter.rows.split(',').map(Number).sort(function (a, b) { return b - a; }); // 後ろから消す
      delRowNums.forEach(function (rowNum) {
        delSheet.deleteRow(rowNum);
      });
      return ContentService.createTextOutput(JSON.stringify({ ok: true, deletedRows: delRowNums }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 修復用：議事録タブの日付・時刻セルが日付/時刻型に化けてしまった場合に、文字列として書き直す
  if (e && e.parameter && e.parameter.action === 'fixMinutesDateType' && e.parameter.id && e.parameter.rows) {
    try {
      var dtSheet = SpreadsheetApp.openById(e.parameter.id).getSheetByName('議事録');
      var pairs = e.parameter.rows.split(';').map(function (s) { return s.split(','); }); // "行,日付,時刻;行,日付,時刻"
      var fixed = [];
      pairs.forEach(function (p) {
        var rowNum = Number(p[0]);
        var dateStr = p[1];
        var timeStr = p[2];
        dtSheet.getRange(rowNum, 1, 1, 2).setNumberFormat('@'); // 文字列(プレーンテキスト)扱いにする
        dtSheet.getRange(rowNum, 1).setValue(dateStr);
        dtSheet.getRange(rowNum, 2).setValue(timeStr);
        fixed.push(rowNum);
      });
      return ContentService.createTextOutput(JSON.stringify({ ok: true, fixed: fixed }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 診断用：指定したスプレッドシート・タブの中身をそのまま返す
  if (e && e.parameter && e.parameter.action === 'dumpTab' && e.parameter.id && e.parameter.tab) {
    try {
      var dumpSheet = SpreadsheetApp.openById(e.parameter.id).getSheetByName(e.parameter.tab);
      if (!dumpSheet) throw new Error('タブが見つかりません: ' + e.parameter.tab);
      var rows = dumpSheet.getDataRange().getValues();
      return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: rows }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 診断用：指定したスプレッドシートIDのタブ名一覧を返す（テンプレートと本家の構成差を見るため）
  if (e && e.parameter && e.parameter.action === 'listTabs' && e.parameter.id) {
    try {
      var listTargetId = e.parameter.id;
      if (listTargetId === 'template') {
        var tFile = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID).getFilesByName(ROSTER_TEMPLATE_FILE_NAME);
        if (!tFile.hasNext()) throw new Error('テンプレートの_名簿が見つかりません');
        listTargetId = tFile.next().getId();
      }
      var ss = SpreadsheetApp.openById(listTargetId);
      var tabNames = ss.getSheets().map(function (s) { return s.getName(); });
      return ContentService.createTextOutput(JSON.stringify({ ok: true, id: listTargetId, tabs: tabNames }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 診断用：どの自治会フォルダの、どのグループフォルダの中に、何のファイルが見えているかをそのまま返す
  // （syncOneOrgが実際に班シートとして拾えているかを目視確認するためのデバッグ抜け道）
  if (e && e.parameter && e.parameter.action === 'debugSync') {
    try {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, orgs: debugSyncScan() }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

    // 本家（架空自治会）の名簿ファイル名を、他の自治会と同じ「◯◯_名簿」規約にそろえる（findFileBySuffixで見つかるようにするため）。鍵が必要
  if (e && e.parameter && e.parameter.action === 'renameHonkeRoster') {
    if (e.parameter.key !== ADMIN_LAUNCHER_KEY) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'forbidden' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var masterFolder2 = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
      var parent2 = masterFolder2.getParents().hasNext() ? masterFolder2.getParents().next() : null;
      var honke2 = parent2 ? findFolderByName(parent2, FLYER_REFERENCE_ORG_NAME) : null;
      if (!honke2) throw new Error('本家（' + FLYER_REFERENCE_ORG_NAME + '）フォルダが見つかりません');
      var already = findFileBySuffix(honke2, ROSTER_FILE_SUFFIX);
      if (already) {
        return ContentService.createTextOutput(JSON.stringify({ ok: true, result: { renamed: false, name: already.getName() } }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var roster2 = DriveApp.getFileById(REFERENCE_SPREADSHEET_ID);
      var oldName = roster2.getName();
      var newName2 = FLYER_REFERENCE_ORG_NAME + ROSTER_FILE_SUFFIX;
      roster2.setName(newName2);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, result: { renamed: true, from: oldName, to: newName2 } }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 本家（架空自治会）とテンプレートのフォルダ骨格をそろえる（フォルダの追加・混入ファイルのゴミ箱移動のみ。削除はしない）。鍵が必要
  if (e && e.parameter && e.parameter.action === 'syncStructure') {
    if (e.parameter.key !== ADMIN_LAUNCHER_KEY) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'forbidden' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    try {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, result: syncStructureBasics() }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 複製の動作確認用（鍵が必要）。テスト複製の作成→内容確認→後片付け。名前は「複製テスト」で始まるものに限る
  if (e && e.parameter && e.parameter.action && ['testDuplicate', 'inspectOrg', 'trashTestOrg'].indexOf(e.parameter.action) !== -1) {
    if (e.parameter.key !== ADMIN_LAUNCHER_KEY) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'forbidden' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var testName = e.parameter.name || (TEST_ORG_PREFIX + '_自治会');
      var testOut;
      if (e.parameter.action === 'testDuplicate') {
        testOut = duplicateTemplateFolder(TEST_ORG_PREFIX);
      } else if (e.parameter.action === 'inspectOrg') {
        testOut = inspectOrg(testName);
      } else {
        testOut = trashTestOrg(testName);
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: true, result: testOut }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 診断用（読み取り専用）：本家（架空自治会）とテンプレートの構造差分レポート。鍵が必要
  if (e && e.parameter && e.parameter.action === 'diffReport') {
    if (e.parameter.key !== ADMIN_LAUNCHER_KEY) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'forbidden' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    try {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, report: buildStructureReport() }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 管理者アプリ（ローカルのランチャー）から班のWebhook URL一覧を取得するための口。
  // 班のシートIDが含まれるため、鍵（ランチャー側のscript.jsと同じ値）が合わないと返さない
  if (e && e.parameter && e.parameter.action === 'listHanWebhookUrls') {
    if (e.parameter.key !== ADMIN_LAUNCHER_KEY) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'forbidden' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    try {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, list: listHanWebhookUrls() }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // 管理者アプリから「設定チェック」を呼ぶための口。listHanWebhookUrlsと同じ鍵チェック
  if (e && e.parameter && e.parameter.action === 'checkAllConfigurations') {
    if (e.parameter.key !== ADMIN_LAUNCHER_KEY) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'forbidden' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    try {
      return ContentService.createTextOutput(JSON.stringify({ ok: true, orgs: checkAllConfigurations() }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // メンテナンス用：QRコード一括更新をURLから直接呼べるようにする
  // （?action=refreshAllQrCodes&target=ALL または自治会名。target省略時はALL扱い）
  if (e && e.parameter && e.parameter.action === 'refreshAllQrCodes') {
    try {
      var refreshResult = refreshAllQrCodes(e.parameter.target || 'ALL');
      return ContentService.createTextOutput(JSON.stringify({ ok: true, result: refreshResult }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.message }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('班別LINEリスト準備ツール')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---- A) テンプレートフォルダ全体をこの自治会用に複製する（名簿・グループフォルダ・リストtmpごと） ----
// 画面から google.script.run 経由で呼ばれる
function duplicateTemplateFolder(orgName) {
  orgName = (orgName || '').trim();
  if (!orgName) throw new Error('自治会名を入力してください');

  // 複製元は本家（架空自治会）。別のテンプレートフォルダは使わない（MASTER_TEMPLATE_FOLDER_IDは「自治会リスト」の場所を知る目印としてだけ使う）
  var masterFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = masterFolder.getParents().hasNext()
    ? masterFolder.getParents().next()
    : DriveApp.getRootFolder();
  var newName = orgName + '_自治会';

  // 同名フォルダがすでにあれば使い回す（二重クリックなどで増殖しないように）
  var newFolder = findFolderByName(parent, newName) || copyFromHonke(findFolderByName(parent, FLYER_REFERENCE_ORG_NAME), parent, newName);

  // 複製された「_名簿」を自治会名にリネームし、サービスアカウントに共有する
  var roster = setUpRosterCopy(newFolder, orgName);

  // 班のスプレッドシートが入る「グループ」フォルダ（GOOGLE_DRIVE_DISTRICT_FOLDER_ID用）
  var groupFolder = findFolderByName(newFolder, 'グループ');

  // 議事録PDF・決算書Excelの保存先フォルダ（テンプレートに最初から入っている「議事録フォルダ」「会計フォルダ」を使う）
  var minutesFolder = findFolderByName(newFolder, '議事録フォルダ');
  var accountingFolder = findFolderByName(newFolder, '会計フォルダ');

  return {
    url: newFolder.getUrl(),
    folderId: newFolder.getId(),
    rosterUrl: roster ? roster.getUrl() : '',
    rosterSpreadsheetId: roster ? roster.getId() : '',
    groupFolderUrl: groupFolder ? groupFolder.getUrl() : '',
    groupFolderId: groupFolder ? groupFolder.getId() : '',
    minutesFolderId: minutesFolder ? minutesFolder.getId() : '',
    accountingFolderId: accountingFolder ? accountingFolder.getId() : ''
  };
}

// ---- 本家（架空自治会）から新しい自治会フォルダを作る ----
// 本家には試験用のデータが入っているので、丸ごとコピーせず、決まった骨格だけを作る。
//   _名簿（本家の名簿。共通マスタのタブ以外はデータを空にする） / グループ/リストtmp（班のひな形） /
//   議事録フォルダ / 会計フォルダ（ひな形ファイルのみ） / QRコード（_原紙・チラシ入り） / PDF / Word
// 本家のイベントPDF・イベント文書・参加不参加・制作用・画像・archive・実在の班シートはコピーしない
var ROSTER_KEEP_DATA_TABS = ['役職マスタ', '定型文マスタ', '科目マスタ']; // 全自治会共通の設定として中身ごと残すタブ

function copyFilesFlat(sourceFolder, destFolder) {
  var files = sourceFolder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    f.makeCopy(f.getName(), destFolder);
  }
}

// 見出し行（1行目）だけ残して、共通マスタ以外のタブのデータを消す
function clearRosterData(spreadsheetId) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  ss.getSheets().forEach(function (sheet) {
    if (ROSTER_KEEP_DATA_TABS.indexOf(sheet.getName()) !== -1) return;
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow >= 2 && lastCol >= 1) sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  });
}

function copyFromHonke(honke, parent, newName) {
  if (!honke) throw new Error('本家（' + FLYER_REFERENCE_ORG_NAME + '）フォルダが見つかりません');

  var honkeGroup = findFolderByName(honke, GROUP_FOLDER_NAME) || findFolderByName(honke, GROUP_FOLDER_NAME_ALT);
  var bandTemplate = honkeGroup ? findExistingCopy(honkeGroup, TEMPLATE_FILE_NAME) : null;
  if (!bandTemplate) throw new Error('本家の「グループ」フォルダに班のひな形「' + TEMPLATE_FILE_NAME + '」がありません');

  var newFolder = parent.createFolder(newName);

  var rosterCopy = DriveApp.getFileById(REFERENCE_SPREADSHEET_ID).makeCopy(ROSTER_TEMPLATE_FILE_NAME, newFolder);
  clearRosterData(rosterCopy.getId());

  bandTemplate.makeCopy(TEMPLATE_FILE_NAME, newFolder.createFolder('グループ'));

  newFolder.createFolder('議事録フォルダ');
  var accounting = newFolder.createFolder('会計フォルダ');
  var honkeAccounting = findFolderByName(honke, '会計フォルダ');
  if (honkeAccounting) copyFilesFlat(honkeAccounting, accounting);

  var qr = newFolder.createFolder('QRコード');
  qr.createFolder(QR_ORIGINALS_FOLDER_NAME);
  var flyer = qr.createFolder(FLYER_FOLDER_NAME);
  var honkeQr = findFolderByName(honke, 'QRコード');
  var honkeFlyer = honkeQr ? findFolderByName(honkeQr, FLYER_FOLDER_NAME) : null;
  if (honkeFlyer) copyFilesFlat(honkeFlyer, flyer);

  newFolder.createFolder('PDF');
  newFolder.createFolder('Word');
  return newFolder;
}

// 複製したフォルダの直下にある名簿スプレッドシートを「{自治会名}_名簿」にリネームし、
// サービスアカウントを編集者として共有する（再実行しても同じファイルを使い回す）
function setUpRosterCopy(orgFolder, orgName) {
  var wantedName = orgName + '_名簿';

  var already = orgFolder.getFilesByName(wantedName);
  if (already.hasNext()) return already.next();

  var original = orgFolder.getFilesByName(ROSTER_TEMPLATE_FILE_NAME);
  if (!original.hasNext()) return null;

  var file = original.next();
  file.setName(wantedName);
  file.addEditor(SERVICE_ACCOUNT_EMAIL);
  return file;
}

function copyFolderRecursive(sourceFolder, destParent, newName) {
  var newFolder = destParent.createFolder(newName);

  var files = sourceFolder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    file.makeCopy(file.getName(), newFolder);
  }

  var subFolders = sourceFolder.getFolders();
  while (subFolders.hasNext()) {
    var sub = subFolders.next();
    copyFolderRecursive(sub, newFolder, sub.getName());
  }

  return newFolder;
}

function findFolderByName(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : null;
}

function findOrCreateFolder(parent, name) {
  return findFolderByName(parent, name) || parent.createFolder(name);
}

// LINEのアクセストークンから「友だち追加用QRコード」画像を生成し、
// 自治会用フォルダ直下の「QRコード」フォルダに保存する（再実行時は上書き）
function generateAndSaveFriendQrCode(token, fileName, orgFolder) {
  var infoResponse = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  if (infoResponse.getResponseCode() !== 200) {
    throw new Error('LINEアカウント情報の取得に失敗しました（トークンを確認してください）：' + infoResponse.getContentText());
  }
  var basicId = JSON.parse(infoResponse.getContentText()).basicId;
  if (!basicId) {
    throw new Error('このアカウントのbasicIdが取得できませんでした');
  }

  var friendUrl = 'https://line.me/R/ti/p/' + basicId;
  var qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(friendUrl);
  var qrResponse = UrlFetchApp.fetch(qrApiUrl, { muteHttpExceptions: true });
  if (qrResponse.getResponseCode() !== 200) {
    throw new Error('QRコード画像の生成に失敗しました（HTTP ' + qrResponse.getResponseCode() + '）');
  }

  var qrFolder = findOrCreateFolder(orgFolder, 'QRコード');
  var qrOriginalsFolder = findOrCreateFolder(qrFolder, QR_ORIGINALS_FOLDER_NAME);
  var qrFileName = fileName + '_QRコード.png';

  // 「QRコード」直下に前の仕様で保存された同名ファイルが残っていれば、原紙フォルダへの移行のため削除する
  var legacyQr = findExistingCopy(qrFolder, qrFileName);
  if (legacyQr) legacyQr.setTrashed(true);

  var existingQr = findExistingCopy(qrOriginalsFolder, qrFileName);
  if (existingQr) existingQr.setTrashed(true);

  var blob = qrResponse.getBlob().setName(qrFileName);
  var qrFile = qrOriginalsFolder.createFile(blob);
  // 友だち追加URLをファイルの説明欄に保存しておく（アプリ側でQRコードの下にリンクを出すため）
  qrFile.setDescription(friendUrl);

  return { url: qrFile.getUrl(), fileId: qrFile.getId(), friendUrl: friendUrl };
}

// ---- B) 班ごとのスプレッドシートを複製する ----
// 画面から google.script.run 経由で呼ばれる
function duplicateHanSheet(folderId, hanName, token) {
  folderId = (folderId || '').trim();
  hanName = (hanName || '').trim();
  token = (token || '').trim();
  if (!folderId) throw new Error('①でこの自治会用フォルダのURLを入力してください');
  if (!hanName) throw new Error('班名を入力してください');
  if (!token) throw new Error('チャンネルアクセストークンを入力してください');

  var orgFolder;
  try {
    orgFolder = DriveApp.getFolderById(folderId);
  } catch (err) {
    throw new Error('フォルダIDを読み取れません。①のURLを確認してください');
  }

  var templateFile = findTemplateFile(orgFolder);
  if (!templateFile) {
    throw new Error('「' + TEMPLATE_FILE_NAME + '」が自治会用フォルダの中（直下または1階層下のフォルダ内）に見つかりません');
  }
  var destFolder = templateFile.getParents().hasNext()
    ? templateFile.getParents().next()
    : orgFolder;

  var newFile = findExistingCopy(destFolder, hanName);
  if (!newFile) {
    newFile = templateFile.makeCopy(hanName, destFolder);
  }

  var ss = SpreadsheetApp.openById(newFile.getId());
  ss.getSheets()[0].getRange('C1').setValue(token);

  // 友だち追加用QRコードも自動生成・保存する（失敗してもスプレッドシート側は成功させる）
  var qrUrl = '';
  var qrError = '';
  try {
    qrUrl = generateAndSaveFriendQrCode(token, hanName, orgFolder).url;
  } catch (err) {
    qrError = err.message;
  }

  return {
    url: ss.getUrl(),
    fileId: newFile.getId(),
    qrUrl: qrUrl,
    qrError: qrError,
    webhookUrl: buildHanWebhookUrl(newFile.getId())
  };
}

// 班Webhook（独立GAS・全班共通。ソース：複製マニュアル/班スクリプト）のURL。班のシートIDを付けて班ごとのWebhook URLにする
// ---- 本家（架空自治会）とテンプレートの構造差分レポート（読み取り専用） ----
// フォルダは2階層まで、スプレッドシートはタブ名・大きさ・見出し行（名簿系のみ）を返す。
// 班シートはC1にトークンがあるため、中身は返さずタブ名と大きさだけにする
function summarizeFolder(folder, depth) {
  var node = { name: folder.getName(), folders: [], files: [] };
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    node.files.push(f.getName() + ' [' + f.getMimeType().replace('application/vnd.google-apps.', 'g:') + ']');
  }
  node.files.sort();
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var s = subs.next();
    node.folders.push(depth > 1 ? summarizeFolder(s, depth - 1) : { name: s.getName() });
  }
  node.folders.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
  return node;
}

function summarizeSheetTabs(spreadsheetId, withHeaders) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  return {
    name: ss.getName(),
    tabs: ss.getSheets().map(function (s) {
      var tab = { name: s.getName(), rows: s.getLastRow(), cols: s.getLastColumn() };
      if (withHeaders && s.getLastColumn() > 0) {
        tab.header = s.getRange(1, 1, 1, Math.min(s.getLastColumn(), 20)).getValues()[0];
      }
      return tab;
    })
  };
}

function firstSheetIn(folder, excludeName) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS && f.getName() !== excludeName) return f;
  }
  return null;
}

function buildStructureReport() {
  var templateFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = templateFolder.getParents().hasNext() ? templateFolder.getParents().next() : null;
  var honke = parent ? findFolderByName(parent, FLYER_REFERENCE_ORG_NAME) : null;
  if (!honke) throw new Error('本家（' + FLYER_REFERENCE_ORG_NAME + '）フォルダが見つかりません');

  var report = { template: { folder: summarizeFolder(templateFolder, 2) }, honke: { folder: summarizeFolder(honke, 2) } };

  var tRoster = templateFolder.getFilesByName(ROSTER_TEMPLATE_FILE_NAME);
  if (tRoster.hasNext()) report.template.roster = summarizeSheetTabs(tRoster.next().getId(), true);
  report.honke.roster = summarizeSheetTabs(REFERENCE_SPREADSHEET_ID, true);

  var tGroup = findFolderByName(templateFolder, GROUP_FOLDER_NAME);
  var tBand = tGroup ? firstSheetIn(tGroup, null) : null;
  if (tBand) report.template.bandSheet = summarizeSheetTabs(tBand.getId(), false);

  var hGroup = findFolderByName(honke, GROUP_FOLDER_NAME) || findFolderByName(honke, GROUP_FOLDER_NAME_ALT);
  var hBand = hGroup ? firstSheetIn(hGroup, TEMPLATE_FILE_NAME) : null;
  if (hBand) report.honke.bandSheet = summarizeSheetTabs(hBand.getId(), false);
  return report;
}

// 本家とテンプレートのフォルダ骨格をそろえる（何度実行しても同じ結果になる）
//  ・テンプレート：「QRコード」の中に「QRコード_原紙」「QRコードチラシ」を作る。混入している「無題のスプレッドシート」はゴミ箱へ
//  ・本家：無い「議事録フォルダ」「会計フォルダ」を作る（会計フォルダはテンプレートの中身ごとコピー）
function syncStructureBasics() {
  var log = [];
  var templateFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = templateFolder.getParents().hasNext() ? templateFolder.getParents().next() : null;
  var honke = parent ? findFolderByName(parent, FLYER_REFERENCE_ORG_NAME) : null;
  if (!honke) throw new Error('本家（' + FLYER_REFERENCE_ORG_NAME + '）フォルダが見つかりません');

  // テンプレート側
  var tQr = findOrCreateFolder(templateFolder, 'QRコード');
  [QR_ORIGINALS_FOLDER_NAME, FLYER_FOLDER_NAME].forEach(function (name) {
    if (!findFolderByName(tQr, name)) { tQr.createFolder(name); log.push('テンプレート/QRコード に「' + name + '」を作成'); }
  });
  var strays = tQr.getFilesByName('無題のスプレッドシート');
  while (strays.hasNext()) {
    var stray = strays.next();
    if (stray.getMimeType() === MimeType.GOOGLE_SHEETS) { stray.setTrashed(true); log.push('テンプレート/QRコード の「無題のスプレッドシート」をゴミ箱へ'); }
  }

  // 本家側
  var minutes = findFolderByName(honke, '議事録フォルダ');
  if (!minutes) { minutes = honke.createFolder('議事録フォルダ'); log.push('本家に「議事録フォルダ」を作成'); }
  var accounting = findFolderByName(honke, '会計フォルダ');
  if (!accounting) {
    var tAccounting = findFolderByName(templateFolder, '会計フォルダ');
    accounting = tAccounting ? copyFolderRecursive(tAccounting, honke, '会計フォルダ') : honke.createFolder('会計フォルダ');
    log.push('本家に「会計フォルダ」を作成' + (tAccounting ? '（テンプレートの中身ごとコピー）' : ''));
  }

  // 本家の「グループ」に班のひな形（リストtmp）が無ければ、テンプレートのものをコピーする（複製元が本家になったため）
  var honkeGroup = findFolderByName(honke, GROUP_FOLDER_NAME) || findFolderByName(honke, GROUP_FOLDER_NAME_ALT);
  if (honkeGroup && !findExistingCopy(honkeGroup, TEMPLATE_FILE_NAME)) {
    var tGroup = findFolderByName(templateFolder, GROUP_FOLDER_NAME);
    var tBandTemplate = tGroup ? findExistingCopy(tGroup, TEMPLATE_FILE_NAME) : null;
    if (tBandTemplate) {
      tBandTemplate.makeCopy(TEMPLATE_FILE_NAME, honkeGroup);
      log.push('本家の「グループ」に班のひな形「' + TEMPLATE_FILE_NAME + '」をコピー');
    }
  }

  return { log: log, minutesFolderId: minutes.getId(), accountingFolderId: accounting.getId() };
}

// ---- 複製の動作確認用（名前が「複製テスト」で始まる自治会フォルダだけを対象にする） ----
var TEST_ORG_PREFIX = '複製テスト';

function findOrgFolderByName(folderName) {
  var masterFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = masterFolder.getParents().hasNext() ? masterFolder.getParents().next() : null;
  return parent ? findFolderByName(parent, folderName) : null;
}

// 自治会フォルダの中身（フォルダ構成と名簿のタブ・行数）を返す。読み取り専用
function inspectOrg(folderName) {
  var folder = findOrgFolderByName(folderName);
  if (!folder) throw new Error('フォルダが見つかりません: ' + folderName);
  var result = { tree: summarizeFolder(folder, 3) };
  var roster = findFileBySuffix(folder, ROSTER_FILE_SUFFIX);
  if (roster) result.roster = summarizeSheetTabs(roster.getId(), true);
  return result;
}

function trashTestOrg(folderName) {
  if (folderName.indexOf(TEST_ORG_PREFIX) !== 0) throw new Error('テスト用フォルダ以外は消せません');
  var folder = findOrgFolderByName(folderName);
  if (!folder) return { trashed: false };
  folder.setTrashed(true);
  return { trashed: true };
}

// 管理者アプリ（プロジェクト/自治会システム_JS/管理者アプリ/script.js）と同じ値にしておく
var ADMIN_LAUNCHER_KEY = '01cbef3b8d4fc6769eb15cf2576b97a3';

var HAN_WEBHOOK_BASE_URL ='https://script.google.com/macros/s/AKfycbzo1TUhnvOKPz4EmCQwT4j3rbKpx5DBOxe-3tmYDjCRsn3FCi-2N8fv1310lYcLAxNa/exec';

function buildHanWebhookUrl(spreadsheetId) {
  return HAN_WEBHOOK_BASE_URL + '?ss=' + spreadsheetId;
}

// 既存の全班のWebhook URL一覧（LINE Developersへの貼り替え用）。画面から google.script.run 経由で呼ばれる
function listHanWebhookUrls() {
  var list = [];
  var masterFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = masterFolder.getParents().hasNext() ? masterFolder.getParents().next() : null;
  if (!parent) return list;

  var orgFolders = parent.getFolders();
  while (orgFolders.hasNext()) {
    var orgFolder = orgFolders.next();
    if (orgFolder.getId() === MASTER_TEMPLATE_FOLDER_ID) continue;
    if (!isEligibleOrgFolder(orgFolder)) continue;

    var groupFolder = findFolderByName(orgFolder, GROUP_FOLDER_NAME) || findFolderByName(orgFolder, GROUP_FOLDER_NAME_ALT);
    if (!groupFolder) continue;

    var hanFiles = groupFolder.getFiles();
    while (hanFiles.hasNext()) {
      var hanFile = hanFiles.next();
      if (hanFile.getName() === TEMPLATE_FILE_NAME) continue;
      if (hanFile.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
      list.push({ org: orgFolder.getName(), han: hanFile.getName(), url: buildHanWebhookUrl(hanFile.getId()) });
    }
  }
  return list;
}

// ==============================================================
// ---- 全自治会の設定チェック（QRコード・班Webhook） ----
// ==============================================================
// 「複製したのに動いていない」を後から使ってみて気づくのではなく、ここで一覧にして
// 先に気づけるようにする。管理者アプリの「設定チェック」ボタンから呼ばれる。

function countFilesInFolder(folder) {
  var count = 0;
  var files = folder.getFiles();
  while (files.hasNext()) { files.next(); count += 1; }
  return count;
}

// 自治会1つぶんのQRコード設定（Driveにフォルダ・画像があるか）をチェックする。
// 「Cloud Run側のQR_CODE_DRIVE_FOLDER_ID」までは（Apps Scriptからは見えないので）確認できない点に注意
function checkQrFolderForOrg(orgFolder) {
  var qrFolder = findFolderByName(orgFolder, 'QRコード');
  if (!qrFolder) return { ok: false, detail: '「QRコード」フォルダ自体がありません' };

  var originals = findFolderByName(qrFolder, QR_ORIGINALS_FOLDER_NAME);
  var originalsCount = originals ? countFilesInFolder(originals) : 0;
  if (!originals || originalsCount === 0) {
    return { ok: false, detail: 'QRコード画像（原紙）がありません' };
  }

  var flyers = findFolderByName(qrFolder, FLYER_FOLDER_NAME);
  var flyersCount = flyers ? countFilesInFolder(flyers) : 0;
  if (!flyers || flyersCount === 0) {
    return { ok: true, warn: true, detail: '原紙' + originalsCount + '件（チラシは未設定。必須ではない）' };
  }
  return { ok: true, detail: '原紙' + originalsCount + '件・チラシ' + flyersCount + '件' };
}

// 班1つぶんのWebhook設定を、LINE側に実際に問い合わせて確認する
// （LINEの「Webhookエンドポイント情報取得」API。トークンさえ有効なら追加の許可は不要）
function checkHanWebhook(hanFile) {
  var expectedUrl = buildHanWebhookUrl(hanFile.getId());
  var result = { han: hanFile.getName(), url: expectedUrl };

  var ss;
  try {
    ss = SpreadsheetApp.openById(hanFile.getId());
  } catch (e) {
    result.ok = false;
    result.detail = 'シートを開けませんでした';
    return result;
  }
  var sheet = ss.getSheetByName('データベース');
  if (!sheet) {
    result.ok = false;
    result.detail = '「データベース」タブがありません';
    return result;
  }
  var token = String(sheet.getRange('C1').getValue() || '');
  if (!token || token.length < 50) {
    result.ok = false;
    result.detail = 'C1にアクセストークンが未設定です';
    return result;
  }

  try {
    var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) {
      result.ok = false;
      result.detail = 'LINE側への問い合わせに失敗（HTTP ' + res.getResponseCode() + '）。トークンが無効な可能性があります';
      return result;
    }
    var info = JSON.parse(res.getContentText());
    if (!info.endpoint) {
      result.ok = false;
      result.detail = 'LINE DevelopersにWebhook URLが未設定です';
      return result;
    }
    if (info.endpoint !== expectedUrl) {
      result.ok = false;
      result.detail = '違うURLが設定されています: ' + info.endpoint;
      return result;
    }
    if (!info.active) {
      result.ok = false;
      result.detail = 'URLは合っていますが「Webhookの利用」がOFFです';
      return result;
    }
    result.ok = true;
    result.detail = '正常';
    return result;
  } catch (e) {
    result.ok = false;
    result.detail = '確認中にエラー: ' + e.message;
    return result;
  }
}

// 全自治会ぶん、QRコードと班Webhookの設定をまとめてチェックする。
// 班の数だけLINE APIを呼ぶため、自治会数・班数が多いと数十秒かかることがある
function checkAllConfigurations() {
  var result = [];
  var masterFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = masterFolder.getParents().hasNext() ? masterFolder.getParents().next() : null;
  if (!parent) return result;

  var orgFolders = parent.getFolders();
  while (orgFolders.hasNext()) {
    var orgFolder = orgFolders.next();
    if (orgFolder.getId() === MASTER_TEMPLATE_FOLDER_ID) continue;
    if (!isEligibleOrgFolder(orgFolder)) continue;

    var orgResult = { org: orgFolder.getName(), qr: checkQrFolderForOrg(orgFolder), hans: [] };

    var groupFolder = findFolderByName(orgFolder, GROUP_FOLDER_NAME) || findFolderByName(orgFolder, GROUP_FOLDER_NAME_ALT);
    if (groupFolder) {
      var hanFiles = groupFolder.getFiles();
      while (hanFiles.hasNext()) {
        var hanFile = hanFiles.next();
        if (hanFile.getName() === TEMPLATE_FILE_NAME) continue;
        if (hanFile.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
        orgResult.hans.push(checkHanWebhook(hanFile));
      }
    }
    result.push(orgResult);
  }
  return result;
}

// 直下、なければ1階層下のサブフォルダまで探して「リストtmp」を見つける
function findTemplateFile(rootFolder) {
  var direct = rootFolder.getFilesByName(TEMPLATE_FILE_NAME);
  if (direct.hasNext()) return direct.next();

  var subFolders = rootFolder.getFolders();
  while (subFolders.hasNext()) {
    var sub = subFolders.next();
    var files = sub.getFilesByName(TEMPLATE_FILE_NAME);
    if (files.hasNext()) return files.next();
  }
  return null;
}

// 同名ファイルがすでにあれば使い回す（再実行してもコピーが増えないようにする）
function findExistingCopy(folder, name) {
  var files = folder.getFilesByName(name);
  return files.hasNext() ? files.next() : null;
}

// 本家（動作確認の基準にしている自治会tmp_制作用の名簿スプレッドシート）を基準に、
// targetSpreadsheetIdに足りないタブがあればコピーして補う
var REFERENCE_SPREADSHEET_ID = '1WqfENB2do5y7yIem8a6ozDqS_wuVp5waOSTLS-tKOsw';
function fixMissingTabs(targetSpreadsheetId) {
  var reference = SpreadsheetApp.openById(REFERENCE_SPREADSHEET_ID);
  var target = SpreadsheetApp.openById(targetSpreadsheetId);
  var existingNames = target.getSheets().map(function (s) { return s.getName(); });

  var added = [];
  reference.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (existingNames.indexOf(name) !== -1) return; // 既にある
    var copied = sheet.copyTo(target);
    copied.setName(name); // copyToは「◯◯のコピー」という名前になるので正しい名前に直す
    added.push(name);
  });
  return { added: added };
}

// 全自治会を巡回して、それぞれの名簿スプレッドシートにfixMissingTabsをかける
// （syncAllHanToRosterと同じ「全自治会フォルダを見つける」ロジックを流用）
function fixAllOrgsMissingTabs() {
  var summary = [];
  var masterFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = masterFolder.getParents().hasNext() ? masterFolder.getParents().next() : null;
  if (!parent) return summary;

  var orgFolders = parent.getFolders();
  while (orgFolders.hasNext()) {
    var orgFolder = orgFolders.next();
    if (orgFolder.getId() === MASTER_TEMPLATE_FOLDER_ID) continue;
    if (!isEligibleOrgFolder(orgFolder)) continue;

    var rosterFile = findFileBySuffix(orgFolder, ROSTER_FILE_SUFFIX);
    if (!rosterFile) continue; // 名簿がまだ無い自治会はスキップ

    try {
      var result = fixMissingTabs(rosterFile.getId());
      summary.push({ org: orgFolder.getName(), added: result.added });
    } catch (err) {
      summary.push({ org: orgFolder.getName(), error: err.message });
    }
  }
  return summary;
}

// ==============================================================
// ---- C) 班シート → 中心の名簿タブへの自動吸い上げ（ポーリング型） ----
// ==============================================================
// 班ごとのスプレッドシート（LINE友だち追加で行が自動追加される）の内容を、
// 全自治会ぶんまとめて、それぞれの中心「名簿」タブへLINEIDをキーに反映する。
// 「友だち追加の瞬間に即時反映」ではなく、時間主導トリガーで数分おきに巡回するポーリング方式。
// 班シート側の「友だち追加で行が増える」既存の仕組み（班シートにバインドされた別のスクリプト）
// には一切手を入れないので、既存の動きを壊す心配がない。
//
// 【初回セットアップ（1回だけ）】
// 1. このエディタ上部の関数選択プルダウンで setupSyncTrigger を選ぶ
// 2. 「▶ 実行」を押す（初回は権限の承認ポップアップが出るので許可する）
// 3. これで10分おきに syncAllHanToRoster が自動実行されるようになる
// （すでに設定済みかどうかは実行後のログ、または左メニュー「トリガー」で確認できる。
//  重複して仕掛けても実害はないが、setupSyncTriggerは既存の同名トリガーを消してから
//  1つだけ作り直すので、何度実行しても増殖しない）
//
// 【間隔を変えたい場合】
// 下の SYNC_INTERVAL_MINUTES の値を変えてから、もう一度 setupSyncTrigger を実行し直す。

var SYNC_INTERVAL_MINUTES = 10; // ポーリング間隔（分）。GASの実行回数クォータを考えて10分を初期値にしている
var ROSTER_FILE_SUFFIX = '_名簿';
var GROUP_FOLDER_NAME = 'グループ';
var ORG_FOLDER_SUFFIX = '_自治会';
var ROSTER_SHEET_NAME_CANDIDATES = ['名簿']; // 中心名簿タブの名前（見つからなければ先頭タブを使う）

function setupSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAllHanToRoster') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAllHanToRoster')
    .timeBased()
    .everyMinutes(SYNC_INTERVAL_MINUTES)
    .create();
  Logger.log(SYNC_INTERVAL_MINUTES + '分おきのトリガーを設定しました');
}

function removeSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncAllHanToRoster') ScriptApp.deleteTrigger(t);
  });
  Logger.log('トリガーを削除しました');
}

// 診断用：syncOneOrgと同じ辿り方で、各自治会のグループフォルダの中身をそのまま列挙する（書き込みはしない）
function debugSyncScan() {
  var orgs = [];
  var masterFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = masterFolder.getParents().hasNext() ? masterFolder.getParents().next() : null;
  if (!parent) return orgs;

  var orgFolders = parent.getFolders();
  while (orgFolders.hasNext()) {
    var orgFolder = orgFolders.next();
    if (orgFolder.getId() === MASTER_TEMPLATE_FOLDER_ID) continue;
    if (!isEligibleOrgFolder(orgFolder)) continue;

    var rosterFile = findFileBySuffix(orgFolder, ROSTER_FILE_SUFFIX);
    var groupFolder = findFolderByName(orgFolder, GROUP_FOLDER_NAME);
    var minutesFolder = findFolderByName(orgFolder, '議事録フォルダ');
    var accountingFolder = findFolderByName(orgFolder, '会計フォルダ');
    var entry = {
      org: orgFolder.getName(),
      rosterFound: !!rosterFile,
      rosterName: rosterFile ? rosterFile.getName() : null,
      rosterId: rosterFile ? rosterFile.getId() : null,
      groupFolderFound: !!groupFolder,
      groupFolderId: groupFolder ? groupFolder.getId() : null,
      minutesFolderId: minutesFolder ? minutesFolder.getId() : null,
      accountingFolderId: accountingFolder ? accountingFolder.getId() : null,
      files: []
    };

    if (groupFolder) {
      var files = groupFolder.getFiles();
      while (files.hasNext()) {
        var f = files.next();
        var fileInfo = { name: f.getName(), mimeType: f.getMimeType() };
        if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
          try {
            var sheet = SpreadsheetApp.openById(f.getId()).getSheets()[0];
            fileInfo.lastRow = sheet.getLastRow();
            fileInfo.c1Token = sheet.getRange('C1').getValue() ? '(あり)' : '(空)';
            if (sheet.getLastRow() >= 4) {
              fileInfo.row4 = sheet.getRange(4, 1, 1, 4).getValues()[0];
            }
          } catch (err) {
            fileInfo.error = err.message;
          }
        }
        entry.files.push(fileInfo);
      }
    }
    orgs.push(entry);
  }
  return orgs;
}

// トリガーおよび「今すぐ更新」ボタンから呼ばれるメイン処理：全自治会を巡回する
// 戻り値は [{org, added, updated}, ...]（ボタン側の表示用。トリガー実行時は使わない）
function syncAllHanToRoster() {
  var summary = [];
  var masterFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = masterFolder.getParents().hasNext() ? masterFolder.getParents().next() : null;
  if (!parent) {
    Logger.log('マスターテンプレートフォルダの親フォルダが見つかりません');
    return summary;
  }

  var orgFolders = parent.getFolders();
  while (orgFolders.hasNext()) {
    var orgFolder = orgFolders.next();
    if (orgFolder.getId() === MASTER_TEMPLATE_FOLDER_ID) continue;
    if (!isEligibleOrgFolder(orgFolder)) continue;
    try {
      var counts = syncOneOrg(orgFolder);
      if (counts) summary.push({ org: orgFolder.getName(), added: counts.added, updated: counts.updated });
    } catch (err) {
      Logger.log('[' + orgFolder.getName() + '] 同期中にエラー: ' + err.message);
    }
  }
  return summary;
}

// 1自治会ぶんの同期（グループフォルダ内の全班シート → その自治会の名簿タブ）
// 戻り値: {added, updated} または対象外の場合はnull
function syncOneOrg(orgFolder) {
  var rosterFile = findFileBySuffix(orgFolder, ROSTER_FILE_SUFFIX);
  if (!rosterFile) return null; // 名簿がまだ複製されていない自治会はスキップ

  var groupFolder = findFolderByName(orgFolder, GROUP_FOLDER_NAME);
  if (!groupFolder) return null; // 班シートがまだ無い自治会はスキップ

  var rosterSS = SpreadsheetApp.openById(rosterFile.getId());
  var rosterSheet = getRosterSheet(rosterSS);

  var lastRow = rosterSheet.getLastRow();
  var existing = lastRow >= 2 ? rosterSheet.getRange(2, 1, lastRow - 1, 6).getValues() : [];
  // LINEID(D列) → シート上の行番号 の対応表（重複排除・更新先の特定に使う）
  var lineIdToRow = {};
  existing.forEach(function (row, i) {
    var lineId = row[3];
    if (lineId) lineIdToRow[lineId] = i + 2;
  });

  var addedCount = 0;
  var updatedCount = 0;

  var hanFiles = groupFolder.getFiles();
  while (hanFiles.hasNext()) {
    var hanFile = hanFiles.next();
    if (hanFile.getName() === TEMPLATE_FILE_NAME) continue; // 複製前のテンプレート自体は対象外
    if (hanFile.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;

    var hanName = hanFile.getName();
    var hanSheet = SpreadsheetApp.openById(hanFile.getId()).getSheets()[0];
    var token = hanSheet.getRange('C1').getValue();

    var hanLastRow = hanSheet.getLastRow();
    if (hanLastRow < 4) continue; // 4行目からがメンバーの実データ（3行目までは見出し等）
    var hanRows = hanSheet.getRange(4, 1, hanLastRow - 3, 4).getValues(); // A:LINE名 B:本名 C:役員 D:LINEID

    hanRows.forEach(function (row) {
      var lineName = row[0];
      var realName = row[1];
      var lineId = row[3];
      if (!lineId) return; // LINEIDが無い行（空行など）はスキップ

      if (lineIdToRow[lineId]) {
        // 既存メンバー：所属・トークンだけ最新化する。役職(C列)は運用者が手で入れている場合があるので上書きしない
        var rowNum = lineIdToRow[lineId];
        rosterSheet.getRange(rowNum, 5).setValue(hanName); // E:所属
        rosterSheet.getRange(rowNum, 6).setValue(token); // F:アクセストークン
        updatedCount++;
      } else {
        // 新規メンバー：末尾に1行追加（役職は空のまま）
        rosterSheet.appendRow([lineName, realName || '', '', lineId, hanName, token]);
        lineIdToRow[lineId] = rosterSheet.getLastRow();
        addedCount++;
      }
    });
  }

  if (addedCount > 0 || updatedCount > 0) {
    Logger.log('[' + orgFolder.getName() + '] 新規' + addedCount + '件・更新' + updatedCount + '件');
  }
  return { added: addedCount, updated: updatedCount };
}

// 中心の名簿タブを取得する（名前が見つからなければ先頭タブにフォールバック）
function getRosterSheet(spreadsheet) {
  for (var i = 0; i < ROSTER_SHEET_NAME_CANDIDATES.length; i++) {
    var sheet = spreadsheet.getSheetByName(ROSTER_SHEET_NAME_CANDIDATES[i]);
    if (sheet) return sheet;
  }
  return spreadsheet.getSheets()[0];
}

// フォルダ直下から、名前が指定した接尾辞で終わるファイルを探す（例："〇〇_名簿"）
function findFileBySuffix(folder, suffix) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (file.getName().indexOf(suffix, file.getName().length - suffix.length) !== -1) return file;
  }
  return null;
}

// ==============================================================
// ---- D) QRコードの一括更新（メンテナンス用） ----
// ==============================================================
// 新しい班が増えてQRコードを発行し直したときなどに、既存の自治会（複数班があれば班ごと全部）の
// QRコードをまとめて作り直す。「QRコードチラシ」は自動生成できないので、架空自治会に置いてある
// ひな形フォルダを、まだ持っていない自治会にだけそのままコピーする（中身の書き換えはしない）。

var FLYER_FOLDER_NAME = 'QRコードチラシ';
var QR_ORIGINALS_FOLDER_NAME = 'QRコード_原紙'; // QRコード画像そのもの（チラシに加工する前の原本）を入れるフォルダ
var FLYER_REFERENCE_ORG_NAME = '架空自治会'; // QRコードチラシのひな形を置いている基準の自治会
// 架空自治会は名前に「_自治会」が付いておらず、班フォルダの名前も古い「管理地区フォルダ」のままだが、
// テスト用に実際にQRコードを持たせたい対象でもあるので、一括更新の対象にも含める
var GROUP_FOLDER_NAME_ALT = '管理地区フォルダ';

// 対象自治会かどうか（通常の「〇〇_自治会」か、基準の架空自治会自身か）
function isEligibleOrgFolder(orgFolder) {
  if (orgFolder.getName() === FLYER_REFERENCE_ORG_NAME) return true;
  return orgFolder.getName().indexOf(ORG_FOLDER_SUFFIX) !== -1;
}

// ドロップダウン用：全自治会名を返す（マスターテンプレートは対象外）
function listOrgNames() {
  var names = [];
  var masterFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = masterFolder.getParents().hasNext() ? masterFolder.getParents().next() : null;
  if (!parent) return names;

  var orgFolders = parent.getFolders();
  while (orgFolders.hasNext()) {
    var orgFolder = orgFolders.next();
    if (orgFolder.getId() === MASTER_TEMPLATE_FOLDER_ID) continue;
    if (!isEligibleOrgFolder(orgFolder)) continue;
    names.push(orgFolder.getName());
  }
  return names;
}

// 架空自治会の「QRコード」フォルダの中にある「QRコードチラシ」フォルダ（ひな形）を探す
function findFlyerReferenceFolder(parent) {
  var refOrg = findFolderByName(parent, FLYER_REFERENCE_ORG_NAME);
  if (!refOrg) return null;
  var refQrFolder = findFolderByName(refOrg, 'QRコード');
  if (!refQrFolder) return null;
  return findFolderByName(refQrFolder, FLYER_FOLDER_NAME);
}

// 対象自治会の「QRコード」フォルダに「QRコードチラシ」が無ければ、ひな形をそのままコピーする
function copyFlyerIfMissing(orgFolder, flyerReferenceFolder) {
  if (!flyerReferenceFolder) return false;
  var qrFolder = findOrCreateFolder(orgFolder, 'QRコード');
  if (findFolderByName(qrFolder, FLYER_FOLDER_NAME)) return false; // すでにあるので何もしない
  copyFolderRecursive(flyerReferenceFolder, qrFolder, FLYER_FOLDER_NAME);
  return true;
}

// 1自治会ぶん：グループフォルダ内の班シートを見つけ、それぞれのQRコードを作り直す
function refreshQrCodesForOrg(orgFolder, flyerReferenceFolder) {
  var refreshed = [];
  var errors = [];

  var groupFolder = findFolderByName(orgFolder, GROUP_FOLDER_NAME) || findFolderByName(orgFolder, GROUP_FOLDER_NAME_ALT);
  if (groupFolder) {
    var hanFiles = groupFolder.getFiles();
    while (hanFiles.hasNext()) {
      var hanFile = hanFiles.next();
      if (hanFile.getName() === TEMPLATE_FILE_NAME) continue; // 複製前のテンプレート自体は対象外
      if (hanFile.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;

      var hanName = hanFile.getName();
      var token = SpreadsheetApp.openById(hanFile.getId()).getSheets()[0].getRange('C1').getValue();
      if (!token) continue; // トークン未設定の班はスキップ

      try {
        generateAndSaveFriendQrCode(token, hanName, orgFolder);
        refreshed.push(hanName);
      } catch (err) {
        errors.push({ han: hanName, message: err.message });
      }
    }
  }

  var flyerCopied = copyFlyerIfMissing(orgFolder, flyerReferenceFolder);
  return { refreshed: refreshed, errors: errors, flyerCopied: flyerCopied };
}

// 画面から呼ばれるメイン処理。target='ALL'なら全自治会、それ以外は指定した自治会名だけを対象にする
function refreshAllQrCodes(target) {
  var summary = [];
  var masterFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = masterFolder.getParents().hasNext() ? masterFolder.getParents().next() : null;
  if (!parent) return summary;

  var flyerReferenceFolder = findFlyerReferenceFolder(parent);

  var orgFolders = parent.getFolders();
  while (orgFolders.hasNext()) {
    var orgFolder = orgFolders.next();
    if (orgFolder.getId() === MASTER_TEMPLATE_FOLDER_ID) continue;
    if (!isEligibleOrgFolder(orgFolder)) continue;
    if (target !== 'ALL' && orgFolder.getName() !== target) continue;

    try {
      var result = refreshQrCodesForOrg(orgFolder, flyerReferenceFolder);
      summary.push({ org: orgFolder.getName(), refreshed: result.refreshed, errors: result.errors, flyerCopied: result.flyerCopied });
    } catch (err) {
      summary.push({ org: orgFolder.getName(), error: err.message });
    }
  }
  return summary;
}
