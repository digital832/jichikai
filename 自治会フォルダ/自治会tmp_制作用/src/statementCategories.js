// 決算書テンプレート（収支決算書）の項目を並べるためのロジック。
// 実際の科目一覧（科目マスタ）はGoogleスプレッドシートで管理し、管理画面から自由に追加・編集・削除できる
// （sheetsClient.getCategories参照）。ここでは伊都の杜自治会の決算書フォーマットに合わせた
// 支出の部の中区分（事業費／団体負担金等／事務費／予備費）の並び順だけを定義する。
const EXPENSE_GROUP_ORDER = ['事業費', '団体負担金等', '事務費', '予備費'];

// 決算書の表の並び順どおりに、支出の部をグループ分けして返す
function expenseGroupsInOrder(list) {
  return EXPENSE_GROUP_ORDER.map((group) => ({
    group,
    categories: (list || []).filter((c) => c.section === '支出' && c.group === group),
  }));
}

function incomeCategoriesInOrder(list) {
  return (list || []).filter((c) => c.section === '収入');
}

module.exports = { EXPENSE_GROUP_ORDER, expenseGroupsInOrder, incomeCategoriesInOrder };
