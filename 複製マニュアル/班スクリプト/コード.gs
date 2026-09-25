/**
 * 班Webhook（独立GAS・全班共通）：LINE Webhook受信＋本名登録ページ
 *
 * 班ごとのシートにスクリプトを貼る方式をやめ、このプロジェクト1つで全班を受け持つ。
 * LINE DevelopersのWebhook URLは班ごとに「このWebアプリのURL ＋ ?ss=<その班のシートID>」にする
 * （複製マニュアルのツールが班登録のときにこのURLを自動で表示する）。
 *
 * 本名の扱い
 *  - 友だち追加（follow。ブロック解除して再追加した場合も含む）のたびに、本人専用の登録ページのリンクを返信する
 *  - 送られてきたテキストは本名として扱わない（本名としては使わず、リンクを案内するだけ）
 *  - 本名は同じリンク（同じuid）から何度でも登録・修正できる（一度登録したら変更不可、という制限は無い）
 *
 * 班シートの「データベース」タブの列: A:LINE名 B:本名 C:役職 D:LINEID E:所属 F:(未使用) G:登録日時
 *
 * 【デプロイ】
 *  - 実行するユーザー：自分 ／ アクセスできるユーザー：全員（LINEと住民がGoogleログインなしで開くため）
 *  - コードを直したら clasp push → clasp deploy --deploymentId <ID> で同じURLのまま更新
 *  - LINE公式アカウントマネージャー側の「あいさつメッセージ」はオフにする（二重送信防止）
 *  - 文面を変えたい場合は班シートの「メッセージ設定」タブのA2に本文を書く（登録ページへは、本文の下の「本名を登録する」ボタンで案内する。{リンク}と書いても表示されない）
 */

// 長いURLをそのまま見せると高齢の方が不安になるため、URLは文面に出さず「ボタン」で開いてもらう
const 既定のあいさつ =
  "友だち追加ありがとうございます。\n" +
  "名簿づくりのため、下のボタンから本名のご登録をお願いします。\n\n" +
  "※あとから登録し直すこともできます。";

// 所属（班名）：ファイル名が「地区_班」なら班の部分、「_」が無ければファイル名そのもの（例：「1班」）
function 班名を求める(ファイル名) {
  return String(ファイル名).split("_")[1] || String(ファイル名) || "所属なし";
}

// 班シートを開く（データベースタブが無いものは班シートではないので拒否）
function 班シートを開く(ss) {
  if (!ss) return null;
  try {
    const スプレッドシート = SpreadsheetApp.openById(ss);
    return スプレッドシート.getSheetByName("データベース") ? スプレッドシート : null;
  } catch (e) {
    return null;
  }
}

function doPost(イベントデータ) {
  const ssパラメータ = イベントデータ.parameter && イベントデータ.parameter.ss;
  const スプレッドシート = 班シートを開く(ssパラメータ);
  if (!スプレッドシート) {
    console.log("班シートを開けません（?ss=の値、または「データベース」タブを確認）ss=" + ssパラメータ);
    return;
  }
  const ss = スプレッドシート.getId();
  const データベースシート = スプレッドシート.getSheetByName("データベース");

  const ファイル名 = スプレッドシート.getName();
  const ファイル名からのグループ名 = 班名を求める(ファイル名);

  const ジェイソン = JSON.parse(イベントデータ.postData.contents);
  if (!ジェイソン || !ジェイソン.events || ジェイソン.events.length === 0) {
    console.log("イベントなし（LINEの「検証」ボタンの空リクエスト）: " + ファイル名);
    return;
  }

  // アクセストークンの取得（C1セル）
  const トークン = データベースシート.getRange("C1").getValue();
  if (!トークン || トークン.length < 50) {
    console.log("アクセストークンがC1にありません（または短すぎます）: " + ファイル名);
    return;
  }

  // 混雑時はLINEが複数人ぶんのイベントを1回の通知にまとめて送ってくるため、全部を順に処理する。
  // 1件が失敗しても残りが処理されなくならないよう、イベントごとに独立してエラーを受け止める。
  let 残数を更新する = false;
  ジェイソン.events.forEach(function (ラインイベント) {
    try {
      if (イベントを処理する(ラインイベント, ss, スプレッドシート, データベースシート, トークン, ファイル名, ファイル名からのグループ名)) {
        残数を更新する = true;
      }
    } catch (エラー) {
      console.log("実行エラー: " + エラー);
    }
  });

  // 残数の取得はLINEに2回問い合わせて時間がかかるため、返信を全部済ませたあとに1回だけ行う
  if (残数を更新する) 残数カウント更新(データベースシート, トークン);
}

// 1件のイベントを処理する。あとで「メッセージ残数」を更新したい場合はtrueを返す
function イベントを処理する(ラインイベント, ss, スプレッドシート, データベースシート, トークン, ファイル名, ファイル名からのグループ名) {
  const ユーザーＩＤ = ラインイベント.source && ラインイベント.source.userId;
  if (!ユーザーＩＤ) return false;
  console.log("受信: " + ファイル名 + " type=" + ラインイベント.type);

  // ==========================================
  // ★ 出欠ボタン（postback）が押された場合の処理（変更なし）
  // ==========================================
  if (ラインイベント.type === 'postback') {
    const ボタン裏データ = ラインイベント.postback.data;

    const パラメータ = {};
    ボタン裏データ.split('&').forEach(要素 => {
      const キーと値 = 要素.split('=');
      パラメータ[キーと値[0]] = decodeURIComponent(キーと値[1]);
    });

    if (パラメータ.ssId && パラメータ.status) {
      const 登録データ = データベースシート.getRange("A2:E" + データベースシート.getLastRow()).getValues();
      let 本名 = "未登録のユーザー";
      let ユーザー所属 = ファイル名からのグループ名;

      for (let i = 0; i < 登録データ.length; i++) {
        if (String(登録データ[i][3]).trim() === String(ユーザーＩＤ).trim()) {
          本名 = 登録データ[i][1] || 本名;
          ユーザー所属 = 登録データ[i][4] || ユーザー所属;
          break;
        }
      }

      if (本名 === "未登録のユーザー") {
        try {
          const プロフィール応答 = UrlFetchApp.fetch("https://api.line.me/v2/bot/profile/" + ユーザーＩＤ, {
            "headers": { "Authorization": "Bearer " + トークン }
          });
          本名 = JSON.parse(プロフィール応答.getContentText()).displayName + "（名簿未照合）";
        } catch (e) {
          本名 = "不明な回答者";
        }
      }

      let 回答先ブック;
      try {
        回答先ブック = SpreadsheetApp.openById(パラメータ.ssId);
      } catch (エラー) {
        console.log("回答用スプレッドシートが開けませんでした: " + エラー.message);
        return false;
      }

      let 回答先シート = 回答先ブック.getSheetByName(ユーザー所属);
      if (!回答先シート) {
        回答先シート = 回答先ブック.getSheets()[0];
      }

      // 同時に押されても行が重複・上書きされないよう、読み書きの間は順番待ちにする
      const ロック = LockService.getScriptLock();
      ロック.waitLock(10000);
      try {
        const 既存の回答データ = 回答先シート.getDataRange().getValues();
        let 上書き対象行 = -1;
        const 現在日時 = new Date();

        for (let k = 1; k < 既存の回答データ.length; k++) {
          if (既存の回答データ[k][1] === 本名) {
            上書き対象行 = k + 1;
            break;
          }
        }

        if (上書き対象行 !== -1) {
          回答先シート.getRange(上書き対象行, 1).setValue(現在日時);
          回答先シート.getRange(上書き対象行, 3).setValue(パラメータ.status);
        } else {
          回答先シート.appendRow([現在日時, 本名, パラメータ.status]);
        }
      } finally {
        ロック.releaseLock();
      }

      const イベント名 = パラメータ.event ? `「${パラメータ.event}」` : "イベント";
      const 返信メッセージ = `ご回答ありがとうございます。\n\n${本名}様の出欠を ${イベント名} にて【${パラメータ.status}】で受け付けました。\n\n※もし変更したい場合は、もう一度案内メッセージのボタンを押し直していただければ自動で修正されます。`;

      カスタムメッセージ返信(ラインイベント.replyToken, トークン, 返信メッセージ);
      return true;
    }
    return false;
  }

  // ==========================================
  // ★ 友だち追加：行を作り（無ければ）、本名登録ページのリンクを毎回返信する
  //   （ブロック解除して再追加した場合も含め、登録済みかどうかに関わらず送る）
  //   返信トークンは短時間で失効するため、返信を最優先にして、残数の更新などは後回しにする
  // ==========================================
  if (ラインイベント.type === 'follow') {
    let 行番 = 行を探す(データベースシート, ユーザーＩＤ);
    let 新規 = false;
    if (行番 === -1) {
      行番 = 名簿に行を作る(データベースシート, トークン, ユーザーＩＤ, ファイル名からのグループ名);
      新規 = true;
    }
    登録案内を返信(ラインイベント.replyToken, トークン, あいさつ文を作る(スプレッドシート), 登録リンクを作る(ss, ユーザーＩＤ));
    console.log("登録リンクを返信しました（行" + 行番 + "）");
    return 新規;
  }

  // ==========================================
  // ➔ 通常のテキストメッセージ：自動返信はしない（管理者と住民のふだんのやり取り＝コミュニケーションの場として使うため）。
  //   名簿に行が無い人だけ行を作っておく。登録リンクは友だち追加時に送っている。
  // ==========================================
  if (ラインイベント.type === 'message' && ラインイベント.message.type === 'text') {
    if (行を探す(データベースシート, ユーザーＩＤ) === -1) {
      名簿に行を作る(データベースシート, トークン, ユーザーＩＤ, ファイル名からのグループ名);
      return true;
    }
  }
  return false;
}

// ==============================================================
// 本名登録ページ（住民がリンクを開いたときの画面）  ?ss=<班シートID>&uid=<LINEユーザーID>
// ==============================================================
// 診断用（読み取り専用）：?action=diag&ss=<班シートID>&key=<診断キー>
const 診断キー = "b7e41c0a95d24f3e8a6c1d7f52e90b34";

function 診断する(ss) {
  const スプレッドシート = 班シートを開く(ss);
  if (!スプレッドシート) return { シートを開けた: false };
  const シート = スプレッドシート.getSheetByName("データベース");
  const トークン = String(シート.getRange("C1").getValue() || "");
  const 行数 = シート.getLastRow();
  const 行一覧 = 行数 >= 1 ? シート.getRange(1, 1, 行数, 7).getValues() : [];
  const 会員 = [];
  for (let i = 0; i < 行一覧.length; i++) {
    if (!行一覧[i][3] || String(行一覧[i][3]).indexOf("U") !== 0) continue; // LINEユーザーID（Uで始まる）の行だけ
    会員.push({ 行: i + 1, LINE名: 行一覧[i][0], 本名あり: String(行一覧[i][1] || "").trim() !== "", 固定F: 行一覧[i][5] === true });
  }
  return {
    シートを開けた: true,
    ファイル名: スプレッドシート.getName(),
    タブ名: スプレッドシート.getSheets().map(s => s.getName()),
    トークン文字数: トークン.length,
    トークン有効な長さ: トークン.length >= 50,
    会員: 会員,
    登録リンクの例: 登録リンクを作る(スプレッドシート.getId(), "Uxxxx")
  };
}

function doGet(e) {
  const パラメータ = (e && e.parameter) || {};
  if (パラメータ.action === "diag") {
    const 出力 = パラメータ.key === 診断キー ? 診断する(パラメータ.ss) : { error: "forbidden" };
    return ContentService.createTextOutput(JSON.stringify(出力)).setMimeType(ContentService.MimeType.JSON);
  }
  if (!パラメータ.ss && !パラメータ.uid) {
    return ContentService.createTextOutput("班Webhook 稼働中");
  }
  const テンプレート = HtmlService.createTemplateFromFile("登録");
  テンプレート.ss = パラメータ.ss || "";
  テンプレート.uid = パラメータ.uid || "";
  return テンプレート.evaluate()
    .setTitle("本名のご登録")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

// ページから呼ばれる：このリンクの持ち主の現在の登録状況（無ければ空欄のフォームを、あれば今の本名を返してプリフィルする）
function getRegistrationState(ss, uid) {
  const スプレッドシート = 班シートを開く(ss);
  if (!スプレッドシート) return { state: "unknown", name: "" };
  const シート = スプレッドシート.getSheetByName("データベース");
  const 行番 = 行を探す(シート, uid);
  if (行番 === -1) return { state: "unknown", name: "" };
  const 行 = シート.getRange(行番, 1, 1, 6).getValues()[0];
  return { state: "ok", name: String(行[1] || "") };
}

// ページから呼ばれる：本名を登録する。同じuidであれば何度でも上書きできる（固定チェックは廃止）
function registerRealName(ss, uid, 名前) {
  const 本名 = String(名前 || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!本名) return { ok: false, reason: "empty" };
  if (本名.length > 30) return { ok: false, reason: "toolong" };

  const ロック = LockService.getScriptLock();
  ロック.waitLock(10000);
  try {
    const スプレッドシート = 班シートを開く(ss);
    if (!スプレッドシート) return { ok: false, reason: "unknown" };
    const シート = スプレッドシート.getSheetByName("データベース");
    const 行番 = 行を探す(シート, uid);
    if (行番 === -1) return { ok: false, reason: "unknown" };

    const 本名セル = シート.getRange(行番, 2);
    本名セル.setNumberFormat("@"); // 「=」などで始まる名前が数式として解釈されないよう文字列で保存する
    本名セル.setValue(本名);
    シート.getRange(行番, 7).setValue(new Date());

    // 所属が空、または旧仕様の「所属なし」のままなら、班名（シート名）で埋める
    const 所属セル = シート.getRange(行番, 5);
    const 現在の所属 = String(所属セル.getValue() || "").trim();
    if (現在の所属 === "" || 現在の所属 === "所属なし") 所属セル.setValue(班名を求める(スプレッドシート.getName()));
    return { ok: true };
  } finally {
    ロック.releaseLock();
  }
}

// ==============================================================
// 共通の部品
// ==============================================================
function 行を探す(シート, ユーザーＩＤ) {
  if (!ユーザーＩＤ) return -1;
  const ＩＤ列データ = シート.getRange("D:D").getValues();
  for (let j = 0; j < ＩＤ列データ.length; j++) {
    if (String(ＩＤ列データ[j][0]).trim() === String(ユーザーＩＤ).trim()) return j + 1;
  }
  return -1;
}

// LINE名とユーザーIDだけの行を作る（本名は空のまま）
// 混雑時に他の人を待たせないよう、時間のかかるLINEへの問い合わせはロックの外で済ませ、
// ロックの中は「もう行があるか確認→追加」だけにする
function 名簿に行を作る(シート, トークン, ユーザーＩＤ, グループ名) {
  const すでにある = 行を探す(シート, ユーザーＩＤ);
  if (すでにある !== -1) return すでにある;

  let ライン表示名 = "";
  try {
    const プロフィール応答 = UrlFetchApp.fetch("https://api.line.me/v2/bot/profile/" + ユーザーＩＤ, {
      "headers": { "Authorization": "Bearer " + トークン }
    });
    ライン表示名 = JSON.parse(プロフィール応答.getContentText()).displayName;
  } catch (e) {
    console.log("プロフィール取得エラー: " + e);
  }

  const ロック = LockService.getScriptLock();
  ロック.waitLock(30000);
  try {
    const 既存 = 行を探す(シート, ユーザーＩＤ);
    if (既存 !== -1) return 既存;
    シート.appendRow([ライン表示名, "", "", ユーザーＩＤ, グループ名, false, new Date()]);
    return シート.getLastRow();
  } finally {
    ロック.releaseLock();
  }
}

function 登録リンクを作る(ss, ユーザーＩＤ) {
  return ScriptApp.getService().getUrl() + "?ss=" + encodeURIComponent(ss) + "&uid=" + encodeURIComponent(ユーザーＩＤ);
}

// 「メッセージ設定」タブのA2に文面があればそれを使い、無ければ既定の文面（文中の{リンク}は取り除く。リンクはボタンで出す）
function あいさつ文を作る(スプレッドシート) {
  let 文面 = 既定のあいさつ;
  const 設定シート = スプレッドシート.getSheetByName("メッセージ設定");
  if (設定シート) {
    const 設定文 = String(設定シート.getRange("A2").getValue() || "").trim();
    if (設定文) 文面 = 設定文;
  }
  return 文面.split("{リンク}").join("").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 登録の案内：URLは見せず、大きな「本名を登録する」ボタンだけを出す（ボタン型メッセージ）。
 * ボタン型の本文は160文字までなので、超える場合は本文を先に普通のメッセージで送り、ボタンには短い案内を付ける。
 */
function 登録案内を返信(返信トークン, トークン, 本文, リンク) {
  const メッセージ一覧 = [];
  let ボタンの本文 = 本文;
  if (本文.length > 160) {
    メッセージ一覧.push({ "type": "text", "text": 本文 });
    ボタンの本文 = "下のボタンを押してください";
  }
  メッセージ一覧.push({
    "type": "template",
    "altText": "本名のご登録をお願いします（ボタンを押してください）",
    "template": {
      "type": "buttons",
      "text": ボタンの本文,
      "actions": [{ "type": "uri", "label": "本名を登録する", "uri": リンク }]
    }
  });
  返信を送る(返信トークン, トークン, メッセージ一覧);
}

/**
 * 返信メッセージ関数（出欠完了・登録案内で共用）
 */
function カスタムメッセージ返信(返信トークン, トークン, テキスト) {
  返信を送る(返信トークン, トークン, [{ "type": "text", "text": テキスト }]);
}

// LINEの返信API。混雑や一時的な障害で失敗した場合に1回だけやり直し、結果はログに残す
function 返信を送る(返信トークン, トークン, メッセージ一覧) {
  const 送信内容 = {
    "headers": { "Content-Type": "application/json; charset=UTF-8", "Authorization": "Bearer " + トークン },
    "method": "post",
    "payload": JSON.stringify({ "replyToken": 返信トークン, "messages": メッセージ一覧 }),
    "muteHttpExceptions": true
  };
  for (let 回数 = 1; 回数 <= 2; 回数++) {
    try {
      const 応答 = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", 送信内容);
      const コード = 応答.getResponseCode();
      if (コード === 200) return true;
      console.log("返信に失敗（HTTP " + コード + "）" + 回数 + "回目: " + 応答.getContentText());
      if (コード < 500) return false; // 4xx（返信トークンの期限切れなど）はやり直しても直らない
    } catch (e) {
      console.log("返信で例外 " + 回数 + "回目: " + e);
    }
    Utilities.sleep(500);
  }
  return false;
}

/**
 * LINEのメッセージ残数（今月の上限 － 使用済み）。上限なしのプランならnull
 */
function getLineRemainingMessages(トークン) {
  const ヘッダー = { "Authorization": "Bearer " + トークン };
  const 上限応答 = JSON.parse(UrlFetchApp.fetch("https://api.line.me/v2/bot/message/quota", { "headers": ヘッダー }).getContentText());
  if (上限応答.type !== "limited") return null;
  const 使用済み応答 = JSON.parse(UrlFetchApp.fetch("https://api.line.me/v2/bot/message/quota/consumption", { "headers": ヘッダー }).getContentText());
  return 上限応答.value - 使用済み応答.totalUsage;
}

function 残数カウント更新(データベースシート, トークン) {
  try {
    const 残り通数 = getLineRemainingMessages(トークン);
    if (残り通数 !== null) データベースシート.getRange("K2").setValue(残り通数);
  } catch (e) {
    console.log("残数取得エラー");
  }
}
