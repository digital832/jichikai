(function () {
  const recordButton = document.getElementById('recordButton');
  const recordTimer = document.getElementById('recordTimer');
  const recordStatus = document.getElementById('recordStatus');

  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let startTime = null;
  let timerInterval = null;

  function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function pickMimeType() {
    const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg'];
    return candidates.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error(err);
      window.alert('マイクへのアクセスが許可されていません。ブラウザの設定を確認してください。');
      return;
    }
    chunks = [];
    const mimeType = pickMimeType();
    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    mediaRecorder.onstop = handleStop;
    mediaRecorder.start();

    startTime = Date.now();
    timerInterval = setInterval(() => {
      recordTimer.textContent = formatElapsed(Date.now() - startTime);
    }, 500);
    recordTimer.classList.add('active');
    recordButton.textContent = '⏹ 録音を停止';
    recordButton.classList.add('recording');
    recordStatus.textContent = '録音中です...';
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    clearInterval(timerInterval);
    recordTimer.classList.remove('active');
    recordButton.textContent = '🔴 録音を開始';
    recordButton.classList.remove('recording');
  }

  function handleStop() {
    const mimeType = mediaRecorder.mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: mimeType });
    const durationLabel = recordTimer.textContent;
    recordTimer.textContent = '00:00';

    const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const defaultName = `議事録_${new Date().toLocaleString('ja-JP').replace(/[/:]/g, '-').replace(/\s+/g, '_')}`;
    const name = window.prompt('保存するファイル名を入力してください', defaultName) || defaultName;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    recordStatus.textContent = `ダウンロードしました（録音時間: ${durationLabel}）`;
  }

  recordButton.addEventListener('click', () => {
    if (recordButton.classList.contains('recording')) {
      stopRecording();
    } else {
      startRecording();
    }
  });
})();
