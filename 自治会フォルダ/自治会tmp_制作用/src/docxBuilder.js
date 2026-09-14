const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

function infoLine(label, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}：`, bold: true }),
      new TextRun({ text: value || '（未設定）' }),
    ],
  });
}

// お知らせ配信ウィザードの入力内容から、掲示用のシンプルなWord文書を作る
async function buildAnnouncementDocx(fields) {
  const doc = new Document({
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
          ...String(fields.messageBody || '').split('\n').map((line) => new Paragraph({ text: line })),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

module.exports = { buildAnnouncementDocx };
