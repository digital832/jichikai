const express = require('express');
const config = require('../config');
const sheetsClient = require('../sheetsClient');
const { generateMinutesFromAudio } = require('../gemini');
const { buildMinutesDocx } = require('../docxBuilder');
const { uploadMinutesPdf, replaceMinutesPdf, deleteMinutesFile } = require('../minutesDrive');

const router = express.Router();

// 録音ページの「会議情報」入力欄(日付・時刻・場所・出席者)をヘッダーから取り出す
function readMeetingInfo(req) {
  const decode = (headerName) => {
    const raw = req.get(headerName);
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return '';
    }
  };
  let attendees = [];
  const attendeesRaw = decode('X-Meeting-Attendees');
  if (attendeesRaw) {
    try {
      attendees = JSON.parse(attendeesRaw);
    } catch {
      attendees = [];
    }
  }
  return {
    meetingName: decode('X-Meeting-Name'),
    meetingDate: decode('X-Meeting-Date'),
    meetingTime: decode('X-Meeting-Time'),
    place: decode('X-Meeting-Place'),
    attendees,
  };
}

function checkConfigured(res) {
  if (!config.gemini.apiKey) {
    res.status(400).json({ error: 'GEMINI_API_KEYが未設定のため議事録を作成できません' });
    return false;
  }
  if (!config.minutes.driveFolderId) {
    res.status(400).json({ error: '議事録の保存先フォルダが未設定です' });
    return false;
  }
  return true;
}

// 一覧（直近5件、?all=1で全件）
router.get('/', async (req, res) => {
  try {
    const list = await sheetsClient.getMinutesList();
    const summary = list.map((m) => ({
      id: m.id, meetingDate: m.meetingDate, meetingTime: m.meetingTime, title: m.title, driveUrl: m.driveUrl,
    }));
    const items = req.query.all ? summary : summary.slice(0, 5);
    res.json({ items, total: summary.length });
  } catch (err) {
    console.error('議事録一覧の取得に失敗:', err);
    res.status(500).json({ error: '議事録一覧の取得に失敗しました' });
  }
});

// 編集画面用の1件取得
router.get('/:id', async (req, res) => {
  try {
    const item = await sheetsClient.getMinutesById(req.params.id);
    if (!item) return res.status(404).json({ error: '議事録が見つかりません' });
    res.json({ item });
  } catch (err) {
    console.error('議事録の取得に失敗:', err);
    res.status(500).json({ error: '議事録の取得に失敗しました' });
  }
});

// 録音した音声(バイナリ)をそのままリクエストボディで受け取り、新規作成する
router.post('/', express.raw({ type: '*/*', limit: '200mb' }), async (req, res) => {
  try {
    if (!checkConfigured(res)) return;
    const audioBuffer = req.body;
    if (!audioBuffer || !audioBuffer.length) {
      return res.status(400).json({ error: '音声データが空です' });
    }
    const mimeType = req.get('Content-Type') || 'audio/webm';

    const { summaryText, transcriptText } = await generateMinutesFromAudio(audioBuffer, mimeType);

    const now = new Date();
    const meetingInfo = readMeetingInfo(req);
    // Cloud Run上はUTCで動いているため、画面側から時刻が送られてこなかった場合のフォールバックは
    // 日本時間(Asia/Tokyo)で計算する（そのままだと9時間ズレた時刻が保存されてしまう）
    const meetingDate = meetingInfo.meetingDate || now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
    const meetingTime = meetingInfo.meetingTime || now.toLocaleTimeString('sv-SE', { timeZone: 'Asia/Tokyo' }).slice(0, 5);
    const title = meetingInfo.meetingName || `議事録_${meetingDate}_${meetingTime}`.replace(/:/g, '-');
    const docxBuffer = await buildMinutesDocx({
      title, meetingDate, meetingTime, place: meetingInfo.place, attendees: meetingInfo.attendees, summaryText, transcriptText,
    });
    const file = await uploadMinutesPdf(docxBuffer, title, config.minutes.driveFolderId);

    const id = await sheetsClient.addMinutes({
      meetingDate,
      meetingTime,
      title,
      place: meetingInfo.place,
      attendees: meetingInfo.attendees,
      summaryText,
      transcriptText,
      driveFileId: file.id,
      driveUrl: file.webViewLink,
    });

    res.json({ ok: true, id, url: file.webViewLink });
  } catch (err) {
    console.error('議事録の作成に失敗:', err);
    res.status(500).json({ error: '議事録の作成に失敗しました。時間をおいて再度お試しください。' });
  }
});

// 本文の編集（テキストを直し、PDFを作り直して同じ場所に上書きする）
router.put('/:id', express.json(), async (req, res) => {
  try {
    const { title, meetingDate, meetingTime, place, attendees, summaryText, transcriptText } = req.body || {};
    if (!title) return res.status(400).json({ error: 'タイトルは必須です' });

    const existing = await sheetsClient.getMinutesById(req.params.id);
    if (!existing) return res.status(404).json({ error: '議事録が見つかりません' });

    const docxBuffer = await buildMinutesDocx({
      title,
      meetingDate: meetingDate || existing.meetingDate,
      meetingTime: meetingTime || existing.meetingTime,
      place: place != null ? place : existing.place,
      attendees: attendees != null ? attendees : existing.attendees,
      summaryText,
    });

    let driveUrl = existing.driveUrl;
    if (existing.driveFileId && config.minutes.driveFolderId) {
      const file = await replaceMinutesPdf(existing.driveFileId, docxBuffer, title, config.minutes.driveFolderId);
      driveUrl = file.webViewLink;
    }

    await sheetsClient.updateMinutesContent(req.params.id, {
      title, meetingDate, meetingTime, place, attendees, summaryText, transcriptText, driveUrl,
    });
    res.json({ ok: true, url: driveUrl });
  } catch (err) {
    console.error('議事録の更新に失敗:', err);
    res.status(500).json({ error: '議事録の更新に失敗しました' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await sheetsClient.getMinutesById(req.params.id);
    if (!existing) return res.status(404).json({ error: '議事録が見つかりません' });
    await deleteMinutesFile(existing.driveFileId);
    await sheetsClient.deleteMinutes(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('議事録の削除に失敗:', err);
    res.status(500).json({ error: '議事録の削除に失敗しました' });
  }
});

module.exports = router;
