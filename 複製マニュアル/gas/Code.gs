/**
 * 班別LINEリスト準備ツール（Apps Script版）
 *
 * これ1つで「フォームの画面」と「Googleドライブを操作する処理」がまとまっています。
 * ローカルのHTMLファイルは使わず、このプロジェクトをWebアプリとして公開したURLを
 * そのまま使ってください。
 *
 * やること：
 *  A) マスターの「テンプレートリンク」フォルダ（グループフォルダ・リストtmpごと）を
 *     この自治会用に丸ごと複製する
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
 */

var TEMPLATE_FILE_NAME = 'リストtmp';
// マスターの「テンプレートリンク」フォルダのID
// https://drive.google.com/drive/folders/【ここの部分】?usp=drive_link
var MASTER_TEMPLATE_FOLDER_ID = '1Y1kfOTFH0u3JzniYNgDs_rbCF-pxjfkV';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('班別LINEリスト準備ツール')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---- A) テンプレートフォルダ全体をこの自治会用に複製する ----
// 画面から google.script.run 経由で呼ばれる
function duplicateTemplateFolder(orgName) {
  orgName = (orgName || '').trim();
  if (!orgName) throw new Error('自治会名を入力してください');

  var masterFolder = DriveApp.getFolderById(MASTER_TEMPLATE_FOLDER_ID);
  var parent = masterFolder.getParents().hasNext()
    ? masterFolder.getParents().next()
    : DriveApp.getRootFolder();
  var newName = orgName + '_自治会';

  // 同名フォルダがすでにあれば使い回す（二重クリックなどで増殖しないように）
  var newFolder = findFolderByName(parent, newName) || copyFolderRecursive(masterFolder, parent, newName);

  return { url: newFolder.getUrl(), folderId: newFolder.getId() };
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

  return { url: ss.getUrl(), fileId: newFile.getId() };
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
