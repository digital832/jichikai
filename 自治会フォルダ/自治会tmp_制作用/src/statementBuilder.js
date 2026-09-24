const path = require('path');
const PDFDocument = require('pdfkit');

const FONT_REGULAR = path.join(__dirname, 'assets/fonts/NotoSansJP-Regular.otf');
const FONT_BOLD = path.join(__dirname, 'assets/fonts/NotoSansJP-Bold.otf');

const MARGIN = 40;
const BORDER_COLOR = '#999999';
const HEADER_FILL = '#EFEFEF';
const PAD_X = 4;
const PAD_Y = 4;
const HEADER_ROW_HEIGHT = 22;

const INCOME_COLUMNS = [
  { key: 'name', label: '項　目', width: 170, align: 'left' },
  { key: 'budget', label: '予算額', width: 85, align: 'right', money: true },
  { key: 'actual', label: '決算額', width: 85, align: 'right', money: true },
  { key: 'diff', label: '比較増減', width: 85, align: 'right', money: true },
  { key: 'note', label: '摘　要', width: 90, align: 'left' },
];

const EXPENSE_COLUMNS = [
  { key: 'group', label: '区　分', width: 45, align: 'center' },
  { key: 'name', label: '項　目', width: 150, align: 'left' },
  { key: 'budget', label: '予算額', width: 80, align: 'right', money: true },
  { key: 'actual', label: '決算額', width: 80, align: 'right', money: true },
  { key: 'diff', label: '比較増減', width: 80, align: 'right', money: true },
  { key: 'note', label: '摘　要', width: 80, align: 'left' },
];

function tableWidth(columns) {
  return columns.reduce((sum, c) => sum + c.width, 0);
}

function formatYen(n) {
  const v = Number(n || 0);
  return v < 0 ? `▲ ${Math.abs(v).toLocaleString('ja-JP')}` : v.toLocaleString('ja-JP');
}

function cellText(row, col) {
  if (col.money) return formatYen(row[col.key]);
  return row[col.key] != null ? String(row[col.key]) : '';
}

function measureRowHeight(doc, columns, row, fontSize) {
  doc.fontSize(fontSize);
  let maxH = fontSize * 1.3;
  columns.forEach((col) => {
    const h = doc.heightOfString(cellText(row, col) || ' ', { width: col.width - PAD_X * 2 });
    if (h > maxH) maxH = h;
  });
  return maxH + PAD_Y * 2;
}

// ページ下端に収まらない場合は改ページし、必要ならヘッダー行を描き直す
function ensureSpace(doc, x0, needed, onNewPage) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
    doc.x = x0;
    doc.y = doc.page.margins.top;
    if (onNewPage) onNewPage();
  }
}

function drawHeaderRow(doc, x0, columns) {
  const y0 = doc.y;
  let x = x0;
  columns.forEach((col) => {
    doc.rect(x, y0, col.width, HEADER_ROW_HEIGHT).fillAndStroke(HEADER_FILL, BORDER_COLOR);
    doc.fillColor('#000000').font('jp-bold').fontSize(10);
    doc.text(col.label, x + PAD_X, y0 + 6, { width: col.width - PAD_X * 2, align: 'center' });
    x += col.width;
  });
  doc.x = x0;
  doc.y = y0 + HEADER_ROW_HEIGHT;
}

// 1項目分の行を描く
function drawRow(doc, x0, columns, row, { bold = false, fontSize = 9, onNewPage, minHeight = 0 } = {}) {
  const height = Math.max(measureRowHeight(doc, columns, row, fontSize), minHeight);
  ensureSpace(doc, x0, height, onNewPage);
  const y0 = doc.y;
  let x = x0;
  columns.forEach((col) => {
    doc.rect(x, y0, col.width, height).lineWidth(0.75).strokeColor(BORDER_COLOR).stroke();
    doc.fillColor('#000000').font(bold ? 'jp-bold' : 'jp').fontSize(fontSize);
    doc.text(cellText(row, col), x + PAD_X, y0 + PAD_Y, { width: col.width - PAD_X * 2, align: col.align });
    x += col.width;
  });
  doc.x = x0;
  doc.y = y0 + height;
  return { y0, height };
}

function withDiff(item) {
  return { ...item, diff: Number(item.actual || 0) - Number(item.budget || 0) };
}

// 決算書（PDF）を組み立てる。入力データはすでに実績集計済みの状態で受け取る。
// data: {
//   communityName, yearLabel, periodStart, periodEnd,
//   carryoverBudget, carryoverActual,
//   income: [{ name, budget, actual, note }],
//   expenseGroups: [{ group, items: [{ name, budget, actual, note }] }],
// }
async function buildKessanBuffer(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('jp', FONT_REGULAR);
    doc.registerFont('jp-bold', FONT_BOLD);

    const x0 = MARGIN;
    const contentWidth = tableWidth(EXPENSE_COLUMNS);

    doc.font('jp').fontSize(11).text('第２号議案', x0, doc.y, { width: contentWidth });
    doc.moveDown(0.5);

    doc.font('jp-bold').fontSize(16).text(`${data.yearLabel}　${data.communityName || ''}　収支決算書`, x0, doc.y, { width: contentWidth, align: 'center' });
    doc.moveDown(0.3);
    doc.font('jp').fontSize(11).text(`${data.periodStart}〜${data.periodEnd}`, x0, doc.y, { width: contentWidth, align: 'center' });
    doc.moveDown(1);

    doc.font('jp-bold').fontSize(12).text('1　一般会計', x0, doc.y, { width: contentWidth });
    doc.font('jp').fontSize(10).text('　（収入の部）', x0, doc.y, { width: contentWidth });
    doc.moveDown(0.3);

    const redrawIncomeHeader = () => drawHeaderRow(doc, x0, INCOME_COLUMNS);
    drawHeaderRow(doc, x0, INCOME_COLUMNS);

    const carryover = withDiff({ name: '前年度繰越金', budget: data.carryoverBudget, actual: data.carryoverActual, note: '' });
    drawRow(doc, x0, INCOME_COLUMNS, carryover, { onNewPage: redrawIncomeHeader });
    let incomeBudgetTotal = Number(data.carryoverBudget || 0);
    let incomeActualTotal = Number(data.carryoverActual || 0);

    (data.income || []).forEach((item) => {
      drawRow(doc, x0, INCOME_COLUMNS, withDiff(item), { onNewPage: redrawIncomeHeader });
      incomeBudgetTotal += Number(item.budget || 0);
      incomeActualTotal += Number(item.actual || 0);
    });

    drawRow(doc, x0, INCOME_COLUMNS, {
      name: '合　計', budget: incomeBudgetTotal, actual: incomeActualTotal, diff: incomeActualTotal - incomeBudgetTotal, note: '',
    }, { bold: true, onNewPage: redrawIncomeHeader });
    doc.font('jp').fontSize(9).text('(A)', x0 + INCOME_COLUMNS[0].width, doc.y + 2, { width: 40 });
    doc.moveDown(1.2);

    doc.font('jp').fontSize(10).text('　（支出の部）', x0, doc.y, { width: contentWidth });
    doc.moveDown(0.3);

    const redrawExpenseHeader = () => drawHeaderRow(doc, x0, EXPENSE_COLUMNS);
    drawHeaderRow(doc, x0, EXPENSE_COLUMNS);

    let expenseBudgetTotal = 0;
    let expenseActualTotal = 0;
    const itemColumns = EXPENSE_COLUMNS.slice(1);
    const groupColumn = EXPENSE_COLUMNS[0];

    (data.expenseGroups || []).forEach((group) => {
      const items = group.items && group.items.length ? group.items : [{ name: '', budget: 0, actual: 0, note: '' }];
      // グループの区分セルは複数行にまたがるため、途中で改ページされないよう先にグループ全体の高さを見積もって確保する。
      // 区分名（例：団体負担金等）が短いグループより長くなり得るので、区分ラベルが収まる高さも確保する
      doc.font('jp-bold').fontSize(9);
      const labelBoxHeight = doc.heightOfString(group.group, { width: groupColumn.width - PAD_X * 2 }) + PAD_Y * 2;
      const naturalHeights = items.map((item) => measureRowHeight(doc, itemColumns, withDiff(item), 9));
      const naturalTotal = naturalHeights.reduce((sum, h) => sum + h, 0);
      const shortfall = Math.max(0, labelBoxHeight - naturalTotal);
      ensureSpace(doc, x0, naturalTotal + shortfall, redrawExpenseHeader);
      const groupStartY = doc.y;
      const rowYs = [];
      items.forEach((item, i) => {
        const isLast = i === items.length - 1;
        const { y0, height } = drawRow(doc, x0 + groupColumn.width, itemColumns, withDiff(item), {
          onNewPage: redrawExpenseHeader,
          minHeight: isLast ? naturalHeights[i] + shortfall : 0,
        });
        rowYs.push({ y0, height });
        expenseBudgetTotal += Number(item.budget || 0);
        expenseActualTotal += Number(item.actual || 0);
      });
      const groupEndY = rowYs[rowYs.length - 1].y0 + rowYs[rowYs.length - 1].height;
      const groupHeight = groupEndY - groupStartY;
      doc.rect(x0, groupStartY, groupColumn.width, groupHeight).lineWidth(0.75).strokeColor(BORDER_COLOR).stroke();
      doc.fillColor('#000000').font('jp-bold').fontSize(9);
      const labelHeight = doc.heightOfString(group.group, { width: groupColumn.width - PAD_X * 2 });
      doc.text(group.group, x0 + PAD_X, groupStartY + Math.max(PAD_Y, (groupHeight - labelHeight) / 2), {
        width: groupColumn.width - PAD_X * 2, align: 'center',
      });
      // group.group のテキスト描画で doc.y/doc.x が動くため、次のグループが正しい位置から続くよう明示的に戻す
      doc.x = x0;
      doc.y = groupEndY;
    });

    drawRow(doc, x0, EXPENSE_COLUMNS, {
      group: '', name: '合　計', budget: expenseBudgetTotal, actual: expenseActualTotal, diff: expenseActualTotal - expenseBudgetTotal, note: '',
    }, { bold: true, onNewPage: redrawExpenseHeader });
    doc.font('jp').fontSize(9).text('(B)', x0 + groupColumn.width + itemColumns[0].width, doc.y + 2, { width: 40 });
    doc.moveDown(1.2);

    const balance = incomeActualTotal - expenseActualTotal;
    ensureSpace(doc, x0, 30);
    doc.font('jp-bold').fontSize(11).text(
      `差引残高【(A)－(B)】　　${balance.toLocaleString('ja-JP')} 円は、次年度に繰り越します。`,
      x0, doc.y, { width: contentWidth },
    );

    doc.end();
  });
}

module.exports = { buildKessanBuffer };
