// 結果ページ：スコアリング結果＋解約候補ランキング＋カテゴリ別円グラフ＋アフィリ訴求

const TODAY = new Date().toISOString().split('T')[0];

let _categories = [];

async function initResult() {
  const subs = loadSubscriptions();
  if (!subs || subs.length === 0) {
    window.location.href = 'app.html';
    return;
  }

  const [affResult, popular] = await Promise.all([
    loadAffiliates(),
    loadPopularSubscriptions(),
  ]);
  const affiliates = affResult.affiliates;
  const themes = affResult.themes;
  _categories = popular.categories;
  const summary = calcSummary(subs);
  const categorySummary = calcCategorySummary(subs, _categories);

  trackEvent('result_view', {
    sub_count: summary.count,
    monthly_total: summary.monthlyTotal,
    yearly_total: summary.yearlyTotal,
    candidate_count: summary.candidates.length,
    savings_yearly: summary.savingsYearly,
  });

  renderResult(summary, affiliates, themes, categorySummary);
  // renderResult後にChart.js初期化
  renderCategoryChart(categorySummary);
}

function calcCategorySummary(subs, categories) {
  const byCategory = {};
  for (const s of subs) {
    const catId = s.category || 'other';
    if (!byCategory[catId]) byCategory[catId] = { total: 0, count: 0 };
    byCategory[catId].total += Number(s.price) || 0;
    byCategory[catId].count += 1;
  }
  // 金額順にソート
  const entries = Object.entries(byCategory)
    .map(([id, data]) => {
      const cat = categories.find((c) => c.id === id) || { id, label: 'その他', emoji: '📦', color: '#94a3b8' };
      return { id, label: cat.label, emoji: cat.emoji, color: cat.color, total: data.total, count: data.count };
    })
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total);
  return entries;
}

function renderCategoryChart(categorySummary) {
  const ctx = document.getElementById('category-chart');
  if (!ctx || !window.Chart || categorySummary.length === 0) return;

  try {
    new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: categorySummary.map((c) => `${c.emoji} ${c.label}`),
        datasets: [{
          data: categorySummary.map((c) => c.total),
          backgroundColor: categorySummary.map((c) => c.color),
          borderColor: '#ffffff',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 10,
              boxWidth: 14,
              font: { size: 11 },
            },
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const v = context.parsed;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const pct = total > 0 ? Math.round((v / total) * 100) : 0;
                return `¥${v.toLocaleString('ja-JP')} (${pct}%)`;
              },
            },
          },
        },
      },
    });
  } catch (e) {
    console.error('Chart render error:', e);
  }
}

function renderResult(summary, affiliates, themes, categorySummary) {
  const root = document.getElementById('result-root');
  const { count, monthlyTotal, yearlyTotal, candidates, savingsMonthly, savingsYearly, scored } = summary;

  // だっちょメッセージ：候補数で変わる
  const characterMessages = buildCharacterMessages(summary);

  // ランキング表示
  const rankingHTML = scored.map((sub, idx) => renderSubRanking(sub, idx)).join('');

  // テーマ別アフィリセクション
  const affHTML = renderAffiliatesByTheme(affiliates, themes);

  root.innerHTML = `
    <div class="max-w-xl mx-auto" id="result-capture">
      <!-- ヒーロー：結果サマリー -->
      <div class="text-center mb-6">
        <div class="text-sm text-emerald-700 font-bold mb-2">あなたのサブスク棚卸し結果</div>
        <div class="text-5xl mb-3">${summary.candidates.length > 0 ? '🚨' : '✨'}</div>
        <h1 class="text-2xl md:text-3xl font-bold text-gray-800 mb-1">${candidates.length > 0 ? `解約候補が ${candidates.length}件 見つかりました` : '健全な家計です！'}</h1>
        <p class="text-sm text-gray-500">登録サブスク ${count}件 / 月額合計 ${formatJPY(monthlyTotal)}</p>
      </div>

      <!-- 節約見込みカード（候補がある場合） -->
      ${candidates.length > 0 ? `
      <div class="bg-gradient-to-br from-red-500 to-orange-500 text-white rounded-2xl p-6 mb-4 shadow-md text-center">
        <p class="text-xs opacity-90 mb-1">解約候補（★4以上）をすべて解約した場合</p>
        <p class="text-xs opacity-90 mb-3">節約見込み額</p>
        <p class="text-4xl md:text-5xl font-bold mb-1">${formatJPY(savingsYearly)}<span class="text-base font-normal">/年</span></p>
        <p class="text-sm opacity-90">月額 ${formatJPY(savingsMonthly)} の削減</p>
        <div class="mt-3 pt-3 border-t border-white/30 text-xs opacity-90 space-y-0.5">
          ${buildSavingsVisuals(savingsYearly)}
        </div>
      </div>
      ${buildAchievementBadges(summary)}
      ` : `
      <div class="bg-emerald-600 text-white rounded-2xl p-6 mb-6 shadow-md text-center">
        <p class="text-sm mb-2">解約候補は見つかりませんでした 👏</p>
        <p class="text-xs opacity-90">登録したサブスクはどれもしっかり活用できているようです。</p>
        ${buildAchievementBadges(summary)}
      </div>
      `}

      <!-- 月額・年間合計カード -->
      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-emerald-100 text-center">
          <p class="text-xs text-gray-500 mb-1">月額合計</p>
          <p class="text-xl font-bold text-gray-800">${formatJPY(monthlyTotal)}</p>
        </div>
        <div class="bg-white rounded-2xl p-4 shadow-sm border border-emerald-100 text-center">
          <p class="text-xs text-gray-500 mb-1">年間合計</p>
          <p class="text-xl font-bold text-gray-800">${formatJPY(yearlyTotal)}</p>
        </div>
      </div>

      <!-- カテゴリ別 円グラフ -->
      ${categorySummary && categorySummary.length > 0 ? `
      <div class="bg-white rounded-2xl p-5 shadow-sm border border-emerald-100 mb-6">
        <h2 class="text-base font-bold text-gray-800 mb-1">📊 カテゴリ別の月額内訳</h2>
        <p class="text-xs text-gray-500 mb-4">どこにお金が流れてるかチェック</p>
        <div class="relative mx-auto" style="max-width: 280px;">
          <canvas id="category-chart"></canvas>
        </div>
        <div class="mt-4 space-y-1">
          ${categorySummary.slice(0, 5).map((c) => `
            <div class="flex items-center justify-between text-xs">
              <span class="flex items-center gap-1">
                <span class="inline-block w-3 h-3 rounded-full" style="background-color: ${c.color};"></span>
                ${c.emoji} ${c.label}（${c.count}件）
              </span>
              <span class="font-bold text-gray-800">${formatJPY(c.total)}<span class="text-gray-400">/月</span></span>
            </div>
          `).join('')}
          ${categorySummary.length > 5 ? `<p class="text-xs text-gray-400 text-center pt-1">他 ${categorySummary.length - 5}カテゴリ</p>` : ''}
        </div>
      </div>
      ` : ''}

      <!-- だっちょメッセージ -->
      ${characterMessages}

      <!-- サブスク別ランキング -->
      <div class="bg-white rounded-2xl p-5 shadow-sm border border-emerald-100 mb-6">
        <h2 class="text-base font-bold text-gray-800 mb-3">🏆 解約検討度ランキング</h2>
        <p class="text-xs text-gray-500 mb-4">スコアが高いほど解約検討の優先度が高い目安です。最終判断はご自身の用途に合わせてください。</p>
        ${rankingHTML}
      </div>

      <!-- アフィリ訴求（テーマ別） -->
      <div class="mb-6">
        <h2 class="text-base font-bold text-gray-800 mb-1 px-1">💡 次のアクション、何を選ぶ？</h2>
        <p class="text-xs text-gray-600 mb-4 px-1">だっちょが実際に試して良かったサービスを「目的別」に並べました。</p>
        ${affHTML}
      </div>

      <!-- 関連記事リンク -->
      <div class="bg-white rounded-2xl p-4 shadow-sm border border-emerald-100 mb-6">
        <p class="text-sm text-gray-700 mb-2">📖 詳しい棚卸しのコツは記事でも解説してます</p>
        <a id="blog-link" href="https://dacchooo-money.com/subscription-review/" target="_blank" rel="noopener" class="text-sm font-bold text-emerald-700 hover:underline">
          サブスク棚卸し記事を読む →
        </a>
      </div>

      <!-- フッター更新日 -->
      <div class="bg-white border border-emerald-100 rounded-2xl p-4 mb-6 text-center">
        <p class="text-xs text-gray-500">結果情報の最終更新：${TODAY}</p>
      </div>
    </div>

    <div class="max-w-xl mx-auto">
      <a href="app.html" id="edit-cta" class="block w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-full transition mb-3 shadow-md">
        ✏️ サブスクを追加・編集する
      </a>
      <p class="text-xs text-gray-500 text-center mb-4">※ 登録したサブスクはブラウザに保存されているので、次回も続きから使えます</p>
      <a href="https://www.instagram.com/dacchooo_money/" id="insta-cta" target="_blank" rel="noopener" class="block w-full text-center bg-white hover:bg-pink-50 text-pink-600 font-bold py-3 rounded-full border-2 border-pink-200 transition mb-3">
        💌 だっちょに感想を送る（インスタDM）
      </a>
      <p class="text-xs text-gray-400 text-center mt-8 leading-relaxed">※ このページ内のリンク先には、広告（アフィリエイトリンク）を含むコンテンツがあります。掲載情報は目安です。解約方法は決済種別（Web／Apple／Google等）によって異なる場合があります。最新の手順は各公式ヘルプでご確認ください。サービスのロゴ・名称は各社の商標です。</p>
      <p class="text-xs text-gray-500 text-center mt-3 space-x-3">
        <a href="about.html" class="hover:text-emerald-700 underline">運営者情報</a>
        <a href="privacy.html" class="hover:text-emerald-700 underline">プライバシーポリシー</a>
        <a href="terms.html" class="hover:text-emerald-700 underline">利用規約</a>
      </p>
      <p class="text-xs text-gray-400 text-center mt-3">© だっちょ｜お金・投資・節約</p>
    </div>
  `;

  // 詳細チェックボタン（Phase 3）
  root.querySelectorAll('.detail-check-btn').forEach((btn) => {
    btn.addEventListener('click', () => openDetailCheckModal(btn.dataset.detailId));
  });

  // 解約リンク（Phase 5-D）
  root.querySelectorAll('.cancel-link').forEach((a) => {
    a.addEventListener('click', () => {
      trackEvent('cancel_link_click', { sub_name: a.dataset.subName, from: 'result_page' });
    });
  });

  // クリック計測
  root.querySelectorAll('a[data-affiliate-id]').forEach((a) => {
    a.addEventListener('click', () => {
      trackEvent('affiliate_click', {
        affiliate_id: a.dataset.affiliateId,
        affiliate_name: a.dataset.affiliateName,
      });
    });
  });
  document.getElementById('insta-cta')?.addEventListener('click', () => {
    trackEvent('feedback_dm_click', { candidates: summary.candidates.length });
  });
  document.getElementById('blog-link')?.addEventListener('click', () => {
    trackEvent('blog_link_click');
  });
  document.getElementById('edit-cta')?.addEventListener('click', () => {
    trackEvent('edit_subs_click');
  });
}

function buildCharacterMessages(summary) {
  const { candidates, savingsYearly, count } = summary;
  let messages = [];

  if (candidates.length === 0) {
    messages.push('登録されたサブスクはどれも活用度が高そうです！この調子で家計を整えていきましょう。');
    messages.push('もしまだ登録漏れがあれば、追加して再度チェックしてみてくださいね。');
  } else if (candidates.length === 1) {
    messages.push(`「${escapeHtml(candidates[0].name)}」が解約候補に上がりました。本当に必要か、一度立ち止まって考えてみる価値ありです。`);
    messages.push('1件でも解約できれば、その分を投資や貯蓄に回せます。小さな見直しが、1年後に大きな差を生みます。');
  } else {
    messages.push(`解約候補が ${candidates.length}件 見つかりました。全部解約すれば年間 ${formatJPY(savingsYearly)} の節約見込みです。`);
    messages.push('ただし「使うかも…」の引きずられがちなので、まずは★5（最優先）から見直すのがオススメです。');
  }

  return messages.map((m) => `
    <div class="flex items-start gap-3 mb-3">
      <img src="images/characters/dacchooo.png" alt="だっちょ" class="w-12 h-12 rounded-full flex-shrink-0 border border-emerald-200 bg-white">
      <div class="bg-white rounded-2xl px-4 py-3 shadow-sm border border-emerald-100 max-w-md text-sm leading-relaxed text-gray-700">${m}</div>
    </div>
  `).join('');
}

function renderSubRanking(sub, idx) {
  const stars = sub.stars;
  const starHTML = '★'.repeat(stars) + '☆'.repeat(5 - stars);
  const label = scoreToLabel(sub.score);
  const colorMap = {
    red: 'bg-red-100 text-red-700 border-red-200',
    orange: 'bg-orange-100 text-orange-700 border-orange-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  const colorClass = colorMap[label.color] || colorMap.blue;
  const rankNum = idx + 1;
  const cat = findCategoryById(_categories, sub.category);
  const hasDetail = !!sub.detail;

  return `
    <div class="flex items-start gap-3 p-3 ${stars >= 4 ? 'bg-red-50' : 'bg-emerald-50'} rounded-xl mb-2">
      <div class="flex-shrink-0 w-8 h-8 rounded-full bg-white text-gray-700 text-sm font-bold flex items-center justify-center border ${stars >= 4 ? 'border-red-200' : 'border-emerald-200'}">${rankNum}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1 flex-wrap">
          <p class="font-bold text-gray-800 text-sm truncate">${escapeHtml(sub.name)}</p>
          <span class="text-xs ${colorClass} border px-2 py-0.5 rounded-full font-bold whitespace-nowrap">${label.emoji} ${label.label}</span>
        </div>
        <p class="text-xs text-gray-600">月額 ${formatJPY(sub.price)} ・ 1日 ${formatJPY(Math.round((sub.price * 12) / 365))} ・ <span class="text-gray-500">${cat.emoji} ${cat.label}</span></p>
        <p class="text-yellow-500 text-sm mt-1">${starHTML}</p>
        <div class="flex flex-wrap gap-x-3 gap-y-1 mt-2 items-center">
          <button data-detail-id="${sub.id}" class="detail-check-btn text-xs font-bold text-emerald-700 hover:text-emerald-800 underline">
            ${hasDetail ? '✓ 詳しくチェック済み（再診断）' : '🔍 もっと詳しくチェック'}
          </button>
          ${sub.cancelUrl ? `
            <a href="${escapeAttr(sub.cancelUrl)}" target="_blank" rel="noopener" class="cancel-link text-xs font-bold text-red-600 hover:text-red-700 underline" data-sub-name="${escapeAttr(sub.name)}">
              🚫 解約方法を確認
            </a>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderAffiliatesByTheme(affiliates, themes) {
  // テーマごとに紐付く商材をグルーピング
  const themeGroups = themes.map((theme) => {
    const items = Object.entries(affiliates)
      .filter(([id, a]) => a.themeId === theme.id)
      .map(([id, a]) => ({ id, ...a }));
    return { theme, items };
  }).filter((g) => g.items.length > 0);

  return themeGroups.map((g) => `
    <div class="bg-white rounded-2xl border border-emerald-100 p-4 mb-4 shadow-sm">
      <div class="mb-3 pb-2 border-b border-gray-100">
        <p class="text-base font-bold text-gray-800">${g.theme.emoji} ${g.theme.label}</p>
        <p class="text-xs text-gray-500 mt-0.5">${g.theme.lead}</p>
      </div>
      ${g.items.map(renderAffiliateCard).join('')}
    </div>
  `).join('');
}

function renderAffiliateCard(a) {
  return `
    <article class="bg-emerald-50 rounded-xl border border-emerald-100 overflow-hidden mb-3 last:mb-0">
      <div class="p-3">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">${a.category}</span>
          <span class="text-xs font-bold text-gray-400">PR</span>
        </div>
        <h4 class="text-base font-bold text-gray-800 mb-0.5">${a.name}</h4>
        <p class="text-xs text-emerald-700 font-bold mb-2">${a.tagline}</p>
        <div class="flex items-start gap-2 mb-3 p-2 bg-white rounded-lg">
          <img src="images/characters/dacchooo.png" alt="だっちょ" class="w-7 h-7 rounded-full flex-shrink-0 border border-emerald-200 bg-white">
          <p class="text-xs text-gray-700 leading-relaxed">${a.characterComment}</p>
        </div>
        <a href="${a.url}" target="_blank" rel="noopener sponsored" data-affiliate-id="${a.id}" data-affiliate-name="${a.name}" class="block w-full text-center bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-2.5 rounded-full transition">
          詳しく見る →
        </a>
      </div>
    </article>
  `;
}

// ====== Phase 5-C: コスト換算＋達成バッジ ======

function buildSavingsVisuals(savingsYearly) {
  if (!savingsYearly || savingsYearly <= 0) return '';
  const cafe = Math.round(savingsYearly / 500); // カフェ1杯500円換算
  const movie = Math.round(savingsYearly / 1800); // 映画1800円換算
  const dailyCost = Math.round(savingsYearly / 365);
  const lines = [];
  lines.push(`☕ カフェ <strong>${cafe}杯</strong> 分 ／ 🎬 映画 <strong>${movie}本</strong> 分`);
  lines.push(`1日あたり <strong>${formatJPY(dailyCost)}</strong> の節約に相当`);
  return lines.join('<br>');
}

function buildAchievementBadges(summary) {
  const badges = [];
  const { count, candidates, savingsYearly, monthlyTotal } = summary;

  // バッジ条件
  if (count >= 10) badges.push({ emoji: '🏆', label: 'サブスク10件達成', color: 'bg-yellow-500' });
  else if (count >= 5) badges.push({ emoji: '📊', label: '5件登録達成', color: 'bg-emerald-600' });
  if (candidates.length >= 5) badges.push({ emoji: '🎯', label: '解約候補5件発見', color: 'bg-red-500' });
  else if (candidates.length >= 3) badges.push({ emoji: '🔍', label: '解約候補3件発見', color: 'bg-orange-500' });
  if (savingsYearly >= 50000) badges.push({ emoji: '💎', label: '年間5万円節約見込み', color: 'bg-purple-600' });
  else if (savingsYearly >= 20000) badges.push({ emoji: '💰', label: '年間2万円節約見込み', color: 'bg-emerald-500' });
  if (candidates.length === 0 && count >= 3) badges.push({ emoji: '✨', label: '健全な家計マスター', color: 'bg-emerald-500' });
  if (monthlyTotal >= 10000) badges.push({ emoji: '👀', label: '月1万円超え（要注意）', color: 'bg-amber-500' });

  if (badges.length === 0) return '';

  return `
    <div class="flex flex-wrap gap-2 justify-center mt-4 ${candidates.length > 0 ? '' : 'pt-3 border-t border-white/30'}">
      ${badges.map((b) => `
        <span class="${b.color} text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">${b.emoji} ${b.label}</span>
      `).join('')}
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ====== Phase 3: 「本当に使ってる？」3タップ追加診断 ======

const DETAIL_QUESTIONS = [
  {
    id: 'usedLastMonth',
    title: '先月、実際に使いましたか？',
    subtitle: '「ログインしたかどうか」レベルでOK',
    options: [
      { label: '使った', value: true, emoji: '😊' },
      { label: '使ってない', value: false, emoji: '😴' },
    ],
  },
  {
    id: 'hasAlternative',
    title: '無料の代替手段はありますか？',
    subtitle: '別の無料サービスで代わりが効くかどうか',
    options: [
      { label: 'ある', value: true, emoji: '🆓' },
      { label: 'ない', value: false, emoji: '🚫' },
    ],
  },
  {
    id: 'cancelEase',
    title: '解約しても困らない可能性は？',
    subtitle: 'あなたの肌感覚で',
    options: [
      { label: '高い（すぐ解約できそう）', value: 'easy', emoji: '🎯' },
      { label: '中くらい', value: 'medium', emoji: '🤔' },
      { label: '低い（必要）', value: 'hard', emoji: '🛡️' },
    ],
  },
];

let _detailState = null;

function openDetailCheckModal(subId) {
  const subs = loadSubscriptions();
  const sub = subs.find((s) => s.id === subId);
  if (!sub) return;

  _detailState = {
    subId,
    subName: sub.name,
    questionIndex: 0,
    answers: {},
  };

  trackEvent('detail_check_open', { sub_id: subId });
  renderDetailModal();
}

function renderDetailModal() {
  const { questionIndex, answers, subName } = _detailState;
  const q = DETAIL_QUESTIONS[questionIndex];
  const progress = Math.round(((questionIndex) / DETAIL_QUESTIONS.length) * 100);

  // 既存のモーダルを削除
  document.getElementById('detail-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'detail-modal';
  modal.className = 'fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4';
  modal.innerHTML = `
    <div class="bg-white w-full max-w-md rounded-t-2xl md:rounded-2xl shadow-xl">
      <div class="p-5">
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs text-emerald-700 font-bold">🔍 詳しくチェック</p>
          <button id="detail-close" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <p class="text-sm font-bold text-gray-800 mb-1 truncate">${escapeHtml(subName)}</p>
        <div class="w-full h-1.5 bg-emerald-100 rounded-full overflow-hidden mb-5">
          <div class="h-full bg-emerald-600 rounded-full transition-all duration-300" style="width: ${progress}%"></div>
        </div>
        <h3 class="text-lg font-bold text-gray-800 mb-1">${q.title}</h3>
        <p class="text-xs text-gray-500 mb-4">${q.subtitle}</p>
        <div class="grid gap-2 mb-2">
          ${q.options.map((opt, i) => `
            <button data-answer-index="${i}" class="detail-answer-btn w-full text-left p-4 bg-white border-2 border-emerald-100 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition flex items-center gap-3">
              <span class="text-2xl">${opt.emoji}</span>
              <span class="font-bold text-gray-800">${opt.label}</span>
            </button>
          `).join('')}
        </div>
        <p class="text-xs text-gray-400 text-center mt-3">質問 ${questionIndex + 1} / ${DETAIL_QUESTIONS.length}</p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // イベント設定
  modal.querySelector('#detail-close')?.addEventListener('click', closeDetailModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeDetailModal();
  });
  modal.querySelectorAll('.detail-answer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.answerIndex);
      const option = q.options[idx];
      _detailState.answers[q.id] = option.value;
      _detailState.questionIndex++;

      if (_detailState.questionIndex >= DETAIL_QUESTIONS.length) {
        finishDetailCheck();
      } else {
        renderDetailModal();
      }
    });
  });
}

function closeDetailModal() {
  document.getElementById('detail-modal')?.remove();
  _detailState = null;
}

async function finishDetailCheck() {
  const { subId, answers } = _detailState;
  updateSubscriptionDetail(subId, answers);
  trackEvent('detail_check_complete', {
    sub_id: subId,
    usedLastMonth: answers.usedLastMonth,
    hasAlternative: answers.hasAlternative,
    cancelEase: answers.cancelEase,
  });

  closeDetailModal();

  // 結果ページを再描画（スコア再計算）
  const subs = loadSubscriptions();
  const affiliates = await loadAffiliates();
  const popular = await loadPopularSubscriptions();
  _categories = popular.categories;
  const summary = calcSummary(subs);
  const categorySummary = calcCategorySummary(subs, _categories);
  renderResult(summary, affiliates, categorySummary);
  renderCategoryChart(categorySummary);

  // 完了通知トースト
  showToast('✓ 再診断完了！スコアを更新しました');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.5s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 500);
  }, 2000);
}

document.addEventListener('DOMContentLoaded', initResult);
