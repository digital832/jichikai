const config = require('./config');

const UPLOAD_BASE = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const SUMMARY_PROMPT = `あなたは自治会の会議の書記です。以下は会議の文字起こしです。これをもとに、日本語で議事録を作成してください。

・話し合われた議題ごとに「### 」で見出しを立て、要点は「* 」で箇条書きにする
・決定事項がある場合は「### 決定事項」として明記する
・次回までの宿題やアクションがあれば「### 次回までの対応」として明記する
・シニアの方も読みやすいよう、平易な言葉で簡潔にまとめる
・文字起こし自体は繰り返さず、要約だけを出力する
・「ご提示いただいた〜」のような前置きや、「以上です」のような後書き、区切り線（---）は
  絶対に書かないこと。議事録の中身だけを出力すること
・強調したい語句以外は「**」（太字）を使わないこと

【文字起こし】
`;

const FALLBACK_TRANSCRIBE_PROMPT = '添付した音声を、日本語でできるだけ忠実に文字起こししてください。要約や言い換えはせず、聞こえた通りに書いてください。';

// 音声ファイルをGemini File APIにアップロードし、file_uriを取得する
async function uploadAudioFile(buffer, mimeType) {
  const startRes = await fetch(`${UPLOAD_BASE}?key=${config.gemini.apiKey}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(buffer.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'jichikai-recording' } }),
  });
  if (!startRes.ok) {
    throw new Error(`Gemini File API(開始)に失敗: ${startRes.status} ${await startRes.text()}`);
  }
  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini File APIのアップロードURLが取得できませんでした');

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(buffer.length),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
  });
  if (!uploadRes.ok) {
    throw new Error(`Gemini File API(本体)に失敗: ${uploadRes.status} ${await uploadRes.text()}`);
  }
  const uploaded = await uploadRes.json();
  return uploaded.file;
}

// ファイルの処理(PROCESSING)が終わりACTIVEになるまで待つ
async function waitUntilActive(fileName, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const res = await fetch(`${API_BASE}/${fileName}?key=${config.gemini.apiKey}`);
    if (!res.ok) throw new Error(`Gemini ファイル状態確認に失敗: ${res.status} ${await res.text()}`);
    const file = await res.json();
    if (file.state === 'ACTIVE') return file;
    if (file.state === 'FAILED') throw new Error('Geminiでの音声処理に失敗しました');
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Geminiでの音声処理がタイムアウトしました');
}

function extractText(data) {
  // gemini-3.5-transcribeのような音声専用モデルは、結果をtextではなくaudioTranscription.textで返す
  return data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text || p.audioTranscription?.text || '')
    .join('\n') || '';
}

async function callGenerateContent(model, parts, generationConfig) {
  const res = await fetch(`${API_BASE}/models/${model}:generateContent?key=${config.gemini.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig }),
  });
  if (!res.ok) {
    throw new Error(`Gemini生成に失敗: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const text = extractText(data);
  if (!text) {
    // thinking系モデルが内部思考だけでトークンを使い切ると本文が空になることがあるため、
    // 原因調査用にfinishReasonなどをログに残す
    console.error('Gemini応答が空でした:', JSON.stringify({
      finishReason: data.candidates?.[0]?.finishReason,
      usageMetadata: data.usageMetadata,
    }));
  }
  return text;
}

// 一時的な混雑や空応答に備えて、指定回数まで自動で再試行する
async function withRetry(fn, attempts, delayMs = 1500) {
  let lastErr;
  for (let i = 0; i <= attempts; i += 1) {
    try {
      const result = await fn();
      if (result) return result;
      lastErr = new Error('空の応答でした');
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw lastErr;
}

// 文字起こし専用モデルで試し、それでもダメなら実績のある汎用モデルにフォールバックする
async function transcribeAudio(file) {
  try {
    // 文字起こし専用モデルは音声のみを受け付ける。文章の指示を一緒に渡すと応答が空になるため付けない
    // （thinkingConfigも'Thinking is not enabled for this model'エラーになるため付けない）
    return await withRetry(() => callGenerateContent(config.gemini.transcribeModel, [
      { file_data: { mime_type: file.mimeType, file_uri: file.uri } },
    ]), 2);
  } catch (err) {
    console.error('文字起こし専用モデルが失敗、汎用モデルにフォールバックします:', err.message);
  }
  return withRetry(() => callGenerateContent(config.gemini.model, [
    { file_data: { mime_type: file.mimeType, file_uri: file.uri } },
    { text: FALLBACK_TRANSCRIBE_PROMPT },
  ], { thinkingConfig: { thinkingBudget: 0 } }), 1);
}

// 音声から議事録テキストと文字起こしテキストを生成する
// (専用の文字起こしモデルで正確に書き起こしてから、その結果をもとに要約する2段階構成)
async function generateMinutesFromAudio(buffer, mimeType) {
  if (!config.gemini.apiKey) throw new Error('GEMINI_API_KEYが設定されていません');

  const uploaded = await uploadAudioFile(buffer, mimeType);
  const file = uploaded.state === 'ACTIVE' ? uploaded : await waitUntilActive(uploaded.name);

  let transcriptText;
  try {
    transcriptText = await transcribeAudio(file);
  } catch (err) {
    throw new Error('Geminiから文字起こし結果が得られませんでした（再試行・代替モデルとも失敗）');
  }

  const summaryText = await withRetry(() => callGenerateContent(config.gemini.model, [
    { text: SUMMARY_PROMPT + transcriptText },
  ], { thinkingConfig: { thinkingBudget: 0 } }), 2);
  if (!summaryText) throw new Error('Geminiから議事録の要約が得られませんでした');

  return { summaryText: summaryText.trim(), transcriptText: transcriptText.trim() };
}

module.exports = { generateMinutesFromAudio };
