// 共通スクリプト：サブスクのlocalStorage管理・スコアリング・GA4

const STORAGE_KEY = 'subsk_kanri_subscriptions';

// ====== デモモード（?demo=1 で起動。スクショ・QA用） ======
(function initDemoMode() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') !== '1') return;
    const demoSubs = [
      { id: 'd1', name: 'Netflix', price: 1590, category: 'video', usage: 'often', addedAt: Date.now() - 6000 },
      { id: 'd2', name: 'Spotify', price: 980, category: 'music', usage: 'often', addedAt: Date.now() - 5000 },
      { id: 'd3', name: 'Amazon Prime', price: 600, category: 'shopping', usage: 'often', addedAt: Date.now() - 4000 },
      { id: 'd4', name: 'マンガアプリ', price: 980, category: 'reading', usage: 'unused', addedAt: Date.now() - 3000 },
      { id: 'd5', name: '使ってないジム', price: 8800, category: 'fitness', usage: 'unused', addedAt: Date.now() - 2000 },
      { id: 'd6', name: 'クラウドストレージ', price: 1300, category: 'other', usage: 'sometimes', addedAt: Date.now() - 1000 }
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demoSubs));
  } catch (e) { /* noop */ }
})();
const DATA_BASE = 'data';

// ====== GA4 イベント計測ユーティリティ ======
function trackEvent(eventName, params = {}) {
  if (typeof window.gtag === 'function') {
    try {
      window.gtag('event', eventName, params);
    } catch (e) {
      // GA4が読み込まれていない場合は何もしない
    }
  }
}

// ====== データ読み込み ======
async function loadJSON(path) {
  const res = await fetch(`${DATA_BASE}/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function loadAffiliates() {
  const data = await loadJSON('affiliates.json');
  return {
    affiliates: data.affiliates,
    themes: data.themes || [],
  };
}

async function loadPopularSubscriptions() {
  const data = await loadJSON('popular_subscriptions.json');
  return {
    categories: data.categories || [],
    subscriptions: data.subscriptions || [],
  };
}

function findCategoryById(categories, id) {
  return categories.find((c) => c.id === id) || { id: 'other', label: 'その他', emoji: '📦', color: '#94a3b8' };
}

// ====== サブスクのlocalStorage管理 ======
function loadSubscriptions() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveSubscriptions(subs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
}

function clearSubscriptions() {
  localStorage.removeItem(STORAGE_KEY);
}

function addSubscription(sub) {
  const subs = loadSubscriptions();
  const newSub = {
    id: 'sub_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: sub.name,
    price: Number(sub.price) || 0,
    usage: sub.usage, // 'often' | 'sometimes' | 'unused'
    category: sub.category || 'other', // カテゴリID
    cancelUrl: sub.cancelUrl || null, // Phase 5-D: 解約ページURL
    detail: sub.detail || null, // Phase 3 追加診断結果
    billingDay: sub.billingDay ? Number(sub.billingDay) : null, // Phase 7: 引き落とし日（1-31）
    trialEndDate: sub.trialEndDate || null, // Phase 8: 無料トライアル終了日（YYYY-MM-DD）
    createdAt: new Date().toISOString(),
  };
  subs.push(newSub);
  saveSubscriptions(subs);
  return newSub;
}

function deleteSubscription(id) {
  const subs = loadSubscriptions().filter((s) => s.id !== id);
  saveSubscriptions(subs);
}

// ====== スコアリングロジック ======
// スコアの高いものほど解約候補
function calcScore(sub) {
  let score = 0;
  // 使用頻度
  if (sub.usage === 'unused') score += 50;
  else if (sub.usage === 'sometimes') score += 20;
  else score += 0; // often

  // 月額金額
  if (sub.price >= 3000) score += 30;
  else if (sub.price >= 1000) score += 20;
  else score += 10;

  // 追加診断（Phase 3）が完了している場合のボーナス加点
  if (sub.detail) {
    const d = sub.detail;
    // Q1: 先月実際に使ったか（false=使ってない）
    if (d.usedLastMonth === false) score += 25;
    // Q2: 代替手段があるか（true=ある）
    if (d.hasAlternative === true) score += 15;
    // Q3: 解約しても困らないか（'easy'=高い）
    if (d.cancelEase === 'easy') score += 20;
    else if (d.cancelEase === 'medium') score += 10;
  }

  return score;
}

// サブスクの detail を更新（Phase 3 追加診断の保存）
function updateSubscriptionDetail(id, detail) {
  const subs = loadSubscriptions();
  const sub = subs.find((s) => s.id === id);
  if (!sub) return null;
  sub.detail = detail;
  sub.detailUpdatedAt = new Date().toISOString();
  saveSubscriptions(subs);
  return sub;
}

// スコア→★レベル（1〜5）
function scoreToStars(score) {
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}

// スコア→ラベル
function scoreToLabel(score) {
  if (score >= 80) return { label: '即解約を検討', color: 'red', emoji: '🚨' };
  if (score >= 60) return { label: '解約を強く検討', color: 'orange', emoji: '⚠️' };
  if (score >= 40) return { label: '見直し余地あり', color: 'yellow', emoji: '🤔' };
  if (score >= 20) return { label: '様子見でOK', color: 'blue', emoji: '👀' };
  return { label: '継続でOK', color: 'green', emoji: '😊' };
}

// ====== 集計ヘルパー ======
function calcSummary(subs) {
  const monthlyTotal = subs.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const yearlyTotal = monthlyTotal * 12;

  const scored = subs.map((s) => ({ ...s, score: calcScore(s), stars: scoreToStars(calcScore(s)) }));
  // 解約候補=★4以上
  const candidates = scored.filter((s) => s.stars >= 4);
  const savingsMonthly = candidates.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const savingsYearly = savingsMonthly * 12;

  return {
    count: subs.length,
    monthlyTotal,
    yearlyTotal,
    candidates,
    savingsMonthly,
    savingsYearly,
    scored: scored.sort((a, b) => b.score - a.score),
  };
}

// ====== 通貨フォーマット ======
function formatJPY(n) {
  return '¥' + Number(n).toLocaleString('ja-JP');
}

// ====== Phase 9: 履歴スナップショット ======
const SNAPSHOTS_KEY = 'subsk_kanri_snapshots';

function loadSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveSnapshot(snapshot) {
  const snapshots = loadSnapshots();
  // 同じ日のスナップショットは上書き
  const today = new Date().toISOString().split('T')[0];
  const filtered = snapshots.filter((s) => s.date !== today);
  filtered.push({ ...snapshot, date: today, savedAt: new Date().toISOString() });
  // 最新12件のみ保持
  const trimmed = filtered.slice(-12);
  localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(trimmed));
}

function getLatestPreviousSnapshot() {
  const snapshots = loadSnapshots();
  const today = new Date().toISOString().split('T')[0];
  // 今日以外の最新を取得
  const previous = snapshots.filter((s) => s.date !== today);
  if (previous.length === 0) return null;
  return previous[previous.length - 1];
}
