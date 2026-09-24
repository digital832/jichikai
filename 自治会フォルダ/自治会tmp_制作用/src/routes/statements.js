const express = require('express');
const config = require('../config');
const sheetsClient = require('../sheetsClient');
const { incomeCategoriesInOrder, expenseGroupsInOrder } = require('../statementCategories');
const { buildKessanBuffer } = require('../statementBuilder');
const { getOrCreateYearFolder, uploadStatementPdf, replaceStatementPdf, deleteStatementFile } = require('../statementDrive');

const router = express.Router();

function parseFlexibleDate(str) {
  if (!str) return null;
  const m = String(str).trim().match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// 期間内の入出金記録を、科目（決算書の項目）ごとに集計する
async function aggregateActuals(periodStart, periodEnd) {
  const transactions = await sheetsClient.getTransactions();
  const start = parseFlexibleDate(periodStart);
  const end = parseFlexibleDate(periodEnd);
  const totals = {};
  transactions.forEach((t) => {
    if (!t.category) return;
    const d = parseFlexibleDate(t.date);
    if (!d || !start || !end || d < start || d > end) return;
    totals[t.category] = (totals[t.category] || 0) + t.amount;
  });
  return totals;
}

function buildReportData({ yearLabel, periodStart, periodEnd, carryoverBudget, carryoverActual, budgets, notes, actuals, categoryList }) {
  const income = incomeCategoriesInOrder(categoryList).map((c) => ({
    name: c.name,
    budget: (budgets || {})[c.name] || 0,
    actual: (actuals || {})[c.name] || 0,
    note: (notes || {})[c.name] || '',
  }));
  const expenseGroups = expenseGroupsInOrder(categoryList).map((g) => ({
    group: g.group,
    items: g.categories.map((c) => ({
      name: c.name,
      budget: (budgets || {})[c.name] || 0,
      actual: (actuals || {})[c.name] || 0,
      note: (notes || {})[c.name] || '',
    })),
  }));
  return {
    communityName: config.communityName,
    yearLabel,
    periodStart,
    periodEnd,
    carryoverBudget: carryoverBudget || 0,
    carryoverActual: carryoverActual != null ? carryoverActual : (carryoverBudget || 0),
    income,
    expenseGroups,
  };
}

function checkConfigured(res) {
  if (!config.accounting.driveFolderId) {
    res.status(400).json({ error: '決算書の保存先フォルダ（ACCOUNTING_DRIVE_FOLDER_ID）が未設定です' });
    return false;
  }
  return true;
}

// 一覧（直近5件、?all=1で全件）
router.get('/', async (req, res) => {
  try {
    const list = await sheetsClient.getStatements();
    const summary = list.map((s) => ({
      id: s.id, yearLabel: s.yearLabel, periodStart: s.periodStart, periodEnd: s.periodEnd, driveUrl: s.driveUrl, createdAt: s.createdAt,
    }));
    const items = req.query.all ? summary : summary.slice(0, 5);
    res.json({ items, total: summary.length });
  } catch (err) {
    console.error('決算書一覧の取得に失敗:', err);
    res.status(500).json({ error: '決算書一覧の取得に失敗しました' });
  }
});

// 前回作成時の予算額（新規作成フォームの初期値に使う）
router.get('/budgets/latest', async (req, res) => {
  try {
    const budgets = await sheetsClient.getLatestBudgets();
    res.json({ budgets });
  } catch (err) {
    console.error('前回予算額の取得に失敗:', err);
    res.status(500).json({ error: '前回予算額の取得に失敗しました' });
  }
});

// 指定した年度の予算額を取得・保存する。決算書をまだ作っていなくても、
// 入出金ページから年度の始まりに予算額だけ先に設定しておけるようにするために使う
router.get('/budgets', async (req, res) => {
  try {
    const { yearLabel } = req.query;
    if (!yearLabel) return res.status(400).json({ error: '年度を指定してください' });
    const budgets = await sheetsClient.getBudgets(yearLabel);
    res.json({ budgets });
  } catch (err) {
    console.error('予算額の取得に失敗:', err);
    res.status(500).json({ error: '予算額の取得に失敗しました' });
  }
});

router.post('/budgets', async (req, res) => {
  try {
    const { yearLabel, budgets } = req.body || {};
    if (!yearLabel) return res.status(400).json({ error: '年度を指定してください' });
    await sheetsClient.saveBudgets(yearLabel, budgets || {});
    res.json({ ok: true });
  } catch (err) {
    console.error('予算額の保存に失敗:', err);
    res.status(500).json({ error: '予算額の保存に失敗しました' });
  }
});

// 対象期間の開始日より前の入出金をすべて合計し、前年度繰越金（実績）として使う。
// 「欄を空欄にしておく」というルールを人に覚えさせず、常に入出金の記録から機械的に計算する。
router.get('/carryover', async (req, res) => {
  try {
    const start = parseFlexibleDate(req.query.periodStart);
    if (!start) return res.status(400).json({ error: '対象期間の開始日を指定してください' });
    const transactions = await sheetsClient.getTransactions();
    const carryover = transactions.reduce((sum, t) => {
      const d = parseFlexibleDate(t.date);
      if (!d || d >= start) return sum;
      return sum + (t.type === '入金' ? t.amount : -t.amount);
    }, 0);
    res.json({ carryover });
  } catch (err) {
    console.error('繰越金の計算に失敗:', err);
    res.status(500).json({ error: '繰越金の計算に失敗しました' });
  }
});

// 対象期間内の入出金を科目ごとに集計した実績額。予算額の入力欄の横に「実績」として表示するために使う
// （予算額はあくまで手入力の見込み額で、実績とは別物であることが画面上でも分かるようにする）
router.get('/actuals', async (req, res) => {
  try {
    const { periodStart, periodEnd } = req.query;
    if (!periodStart || !periodEnd) return res.status(400).json({ error: '対象期間を指定してください' });
    const actuals = await aggregateActuals(periodStart, periodEnd);
    res.json({ actuals });
  } catch (err) {
    console.error('実績の集計に失敗:', err);
    res.status(500).json({ error: '実績の集計に失敗しました' });
  }
});

// 編集画面用の1件取得
router.get('/:id', async (req, res) => {
  try {
    const item = await sheetsClient.getStatementById(req.params.id);
    if (!item) return res.status(404).json({ error: '決算書が見つかりません' });
    res.json({ item });
  } catch (err) {
    console.error('決算書の取得に失敗:', err);
    res.status(500).json({ error: '決算書の取得に失敗しました' });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!checkConfigured(res)) return;
    const { yearLabel, periodStart, periodEnd, carryoverBudget, carryoverActual, budgets, notes } = req.body || {};
    if (!yearLabel || !periodStart || !periodEnd) {
      return res.status(400).json({ error: '年度・期間開始・期間終了は必須です' });
    }

    const actuals = await aggregateActuals(periodStart, periodEnd);
    const categoryList = await sheetsClient.getCategories();
    const reportData = buildReportData({ yearLabel, periodStart, periodEnd, carryoverBudget, carryoverActual, budgets, notes, actuals, categoryList });
    const buffer = await buildKessanBuffer(reportData);
    // 新規作成時は年度名のフォルダ（決算書フォルダの横に並ぶ）を探し、無ければ作ってそこに保存する
    const yearFolderId = await getOrCreateYearFolder(config.accounting.driveFolderId, yearLabel);
    const file = await uploadStatementPdf(buffer, `${yearLabel}_収支決算書`, yearFolderId);

    await sheetsClient.saveBudgets(yearLabel, budgets || {});
    const id = await sheetsClient.addStatement({
      yearLabel,
      periodStart,
      periodEnd,
      driveFileId: file.id,
      driveUrl: file.webViewLink,
      inputData: { yearLabel, periodStart, periodEnd, carryoverBudget, carryoverActual, budgets, notes },
    });

    res.json({ ok: true, id, url: file.webViewLink });
  } catch (err) {
    console.error('決算書の作成に失敗:', err);
    res.status(500).json({ error: '決算書の作成に失敗しました。時間をおいて再度お試しください。' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!checkConfigured(res)) return;
    const { yearLabel, periodStart, periodEnd, carryoverBudget, carryoverActual, budgets, notes } = req.body || {};
    if (!yearLabel || !periodStart || !periodEnd) {
      return res.status(400).json({ error: '年度・期間開始・期間終了は必須です' });
    }

    const existing = await sheetsClient.getStatementById(req.params.id);
    if (!existing) return res.status(404).json({ error: '決算書が見つかりません' });

    const actuals = await aggregateActuals(periodStart, periodEnd);
    const categoryList = await sheetsClient.getCategories();
    const reportData = buildReportData({ yearLabel, periodStart, periodEnd, carryoverBudget, carryoverActual, budgets, notes, actuals, categoryList });
    const buffer = await buildKessanBuffer(reportData);

    let driveUrl = existing.driveUrl;
    if (existing.driveFileId) {
      const file = await replaceStatementPdf(existing.driveFileId, buffer, `${yearLabel}_収支決算書`);
      driveUrl = file.webViewLink;
    }

    await sheetsClient.saveBudgets(yearLabel, budgets || {});
    await sheetsClient.updateStatement(req.params.id, {
      yearLabel,
      periodStart,
      periodEnd,
      driveUrl,
      inputData: { yearLabel, periodStart, periodEnd, carryoverBudget, carryoverActual, budgets, notes },
    });

    res.json({ ok: true, url: driveUrl });
  } catch (err) {
    console.error('決算書の更新に失敗:', err);
    res.status(500).json({ error: '決算書の更新に失敗しました' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await sheetsClient.getStatementById(req.params.id);
    if (!existing) return res.status(404).json({ error: '決算書が見つかりません' });
    await deleteStatementFile(existing.driveFileId);
    await sheetsClient.deleteStatement(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('決算書の削除に失敗:', err);
    res.status(500).json({ error: '決算書の削除に失敗しました' });
  }
});

module.exports = router;
