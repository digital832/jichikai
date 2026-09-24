const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

// シニアの方にも読みやすいよう、本文は大きめ・太字寄りのフォントを既定にする
const BODY_FONT = 'Meiryo';
const BODY_SIZE = 28; // 14pt（半ポイント単位）

const DOC_STYLES = {
  default: {
    document: {
      run: { font: BODY_FONT, size: BODY_SIZE },
    },
  },
};

// "**太字**" を実際の太字TextRunに変換する（残りは通常のTextRun）
function parseInlineBold(text) {
  const segments = text.split(/\*\*(.+?)\*\*/g);
  return segments
    .filter((s) => s !== '')
    .map((s, i) => new TextRun({ text: s, bold: i % 2 === 1, size: BODY_SIZE }));
}

// Geminiが返すマークダウン記法（見出し・太字・箇条書き・区切り線）を、
// 記号を残したまま流し込むのではなく実際のWordの見た目に変換する
function markdownToParagraphs(text) {
  const lines = String(text || '').split('\n');
  const paragraphs = [];
  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line || /^-{3,}$/.test(line)) {
      paragraphs.push(new Paragraph({ text: '' }));
      return;
    }
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length; // 1〜3個の# → 見出しレベル
      const headingLevel = level >= 3 ? HeadingLevel.HEADING_4 : HeadingLevel.HEADING_3;
      paragraphs.push(new Paragraph({ children: parseInlineBold(headingMatch[2]), heading: headingLevel }));
      return;
    }
    const bulletMatch = line.match(/^[*-]\s+(.*)$/);
    if (bulletMatch) {
      paragraphs.push(new Paragraph({ children: parseInlineBold(bulletMatch[1]), bullet: { level: 0 } }));
      return;
    }
    paragraphs.push(new Paragraph({ children: parseInlineBold(line) }));
  });
  return paragraphs;
}

function infoLine(label, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}：`, bold: true, size: BODY_SIZE }),
      new TextRun({ text: value || '（未設定）', size: BODY_SIZE }),
    ],
  });
}

// お知らせ配信ウィザードの入力内容から、掲示用のシンプルなWord文書を作る
async function buildAnnouncementDocx(fields) {
  const doc = new Document({
    styles: DOC_STYLES,
    sections: [
      {
        children: [
          new Paragraph({ text: fields.eventName || 'お知らせ', heading: HeadingLevel.HEADING_1 }),
          infoLine('行事日', fields.eventDate),
          infoLine('場所', fields.place),
          infoLine('時間', fields.timeStart && fields.timeEnd ? `${fields.timeStart}〜${fields.timeEnd}` : ''),
          infoLine('持ち物', fields.belongings),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '内容', heading: HeadingLevel.HEADING_2 }),
          ...String(fields.messageBody || '').split('\n').map((line) => new Paragraph({ text: line, run: { size: BODY_SIZE } })),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

// 録音の文字起こし・要約結果から議事録のWord文書を作る（文字起こし自体は出力しない）
async function buildMinutesDocx({ title, meetingDate, meetingTime, place, attendees, summaryText }) {
  const dateTimeLabel = [meetingDate, meetingTime].filter(Boolean).join(' ');

  const doc = new Document({
    styles: DOC_STYLES,
    sections: [
      {
        children: [
          new Paragraph({ text: title || '議事録', heading: HeadingLevel.HEADING_1 }),
          infoLine('日時', dateTimeLabel),
          infoLine('場所', place),
          infoLine('出席者', (attendees || []).join('、')),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '議事録', heading: HeadingLevel.HEADING_2 }),
          ...markdownToParagraphs(summaryText),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildAnnouncementDocx, buildMinutesDocx };
