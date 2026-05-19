// app.html用：サブスクの登録・一覧・削除・よくあるサブスクサジェスト

let _popular = { categories: [], subscriptions: [] };
let _activeCategoryFilter = null;

async function init() {
  const form = document.getElementById('sub-form');
  const clearBtn = document.getElementById('clear-all-btn');
  const popularToggle = document.getElementById('popular-toggle');

  // 人気サブスクとカテゴリ読み込み
  _popular = await loadPopularSubscriptions();
  populateCategorySelect();
  renderPopularPanel();

  form.addEventListener('submit', onSubmit);
  clearBtn.addEventListener('click', onClearAll);
  popularToggle.addEventListener('click', togglePopularPanel);

  renderList();

  // GA4: 棚卸し画面到達
  trackEvent('checker_open', { sub_count: loadSubscriptions().length });
}

function populateCategorySelect() {
  const select = document.getElementById('sub-category');
  if (!select) return;
  select.innerHTML = _popular.categories
    .map((c) => `<option value="${c.id}">${c.emoji} ${c.label}</option>`)
    .join('');
  // デフォルトはothers
  select.value = 'other';
}

function togglePopularPanel() {
  const panel = document.getElementById('popular-panel');
  const arrow = document.getElementById('popular-arrow');
  if (!panel || !arrow) return;
  const opened = !panel.classList.contains('hidden');
  if (opened) {
    panel.classList.add('hidden');
    arrow.textContent = '▼';
  } else {
    panel.classList.remove('hidden');
    arrow.textContent = '▲';
    trackEvent('popular_panel_open');
  }
}

function renderPopularPanel() {
  // カテゴリフィルター
  const catContainer = document.getElementById('popular-categories');
  const listContainer = document.getElementById('popular-list');
  if (!catContainer || !listContainer) return;

  catContainer.innerHTML = `
    <button data-cat="ALL" class="popular-cat-btn flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold border-2 ${_activeCategoryFilter === null ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-emerald-200'}">すべて</button>
    ${_popular.categories.map((c) => `
      <button data-cat="${c.id}" class="popular-cat-btn flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold border-2 ${_activeCategoryFilter === c.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-700 border-emerald-200'}">${c.emoji} ${c.label}</button>
    `).join('')}
  `;

  catContainer.querySelectorAll('.popular-cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      _activeCategoryFilter = cat === 'ALL' ? null : cat;
      renderPopularPanel();
    });
  });

  // サブスクボタン
  const filtered = _activeCategoryFilter
    ? _popular.subscriptions.filter((s) => s.category === _activeCategoryFilter)
    : _popular.subscriptions;

  if (filtered.length === 0) {
    listContainer.innerHTML = `<p class="col-span-2 text-xs text-gray-500 text-center py-4">該当なし</p>`;
    return;
  }

  listContainer.innerHTML = filtered.map((sub) => {
    const cat = findCategoryById(_popular.categories, sub.category);
    return `
      <button type="button" class="popular-item-btn text-left p-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-xl transition" data-name="${escapeHtml(sub.name)}" data-price="${sub.price}" data-category="${sub.category}">
        <div class="flex items-center gap-1 mb-1">
          <span class="text-sm">${cat.emoji}</span>
          <span class="text-[10px] text-gray-500">${cat.label}</span>
        </div>
        <p class="text-xs font-bold text-gray-800 leading-tight truncate">${escapeHtml(sub.name)}</p>
        <p class="text-xs text-emerald-700 font-bold mt-1">${formatJPY(sub.price)}<span class="text-[10px] text-gray-500">/月</span></p>
      </button>
    `;
  }).join('');

  listContainer.querySelectorAll('.popular-item-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('sub-name').value = btn.dataset.name;
      document.getElementById('sub-price').value = btn.dataset.price;
      document.getElementById('sub-category').value = btn.dataset.category;
      trackEvent('popular_item_select', { name: btn.dataset.name });
      // フォームへスクロール＆使用頻度フィールドにフォーカス
      const firstRadio = document.querySelector('input[name="usage"]');
      if (firstRadio) {
        firstRadio.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });
}

function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const formData = new FormData(form);
  const name = (formData.get('name') || '').toString().trim();
  const price = Number(formData.get('price') || 0);
  const usage = formData.get('usage');
  const category = formData.get('category') || 'other';

  if (!name || !usage) return;
  if (price < 0 || price > 100000) return;

  addSubscription({ name, price, usage, category });
  trackEvent('subscription_add', { price, usage, category });

  // フォームリセット（カテゴリはother戻し）
  form.reset();
  document.getElementById('sub-category').value = 'other';
  document.getElementById('sub-name').focus();

  // メッセージ更新
  updateDacchoooMessage();
  renderList();

  // スクロール：追加したアイテムが見えるように
  setTimeout(() => {
    const list = document.getElementById('sub-list');
    if (list) list.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 100);
}

function onClearAll() {
  if (!confirm('登録した全てのサブスクを削除します。本当によろしいですか？')) return;
  clearSubscriptions();
  trackEvent('subscription_clear_all');
  renderList();
  updateDacchoooMessage();
}

function onDelete(id) {
  if (!confirm('このサブスクを削除しますか？')) return;
  deleteSubscription(id);
  trackEvent('subscription_delete');
  renderList();
  updateDacchoooMessage();
}

function renderList() {
  const subs = loadSubscriptions();
  const list = document.getElementById('sub-list');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('sub-count');
  const clearBtn = document.getElementById('clear-all-btn');
  const resultBottom = document.getElementById('result-cta-bottom');

  count.textContent = subs.length;

  if (subs.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    clearBtn.classList.add('hidden');
    resultBottom.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  clearBtn.classList.remove('hidden');
  resultBottom.classList.remove('hidden');

  // 月額合計
  const monthlyTotal = subs.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

  list.innerHTML = `
    <div class="bg-emerald-600 text-white rounded-2xl p-4 mb-3 text-center">
      <p class="text-xs opacity-90 mb-1">現時点の月額合計</p>
      <p class="text-3xl font-bold">${formatJPY(monthlyTotal)}</p>
      <p class="text-xs opacity-90 mt-1">年間 ${formatJPY(monthlyTotal * 12)}</p>
    </div>
    ${subs.map(renderSubCard).join('')}
  `;

  // 削除ボタンにイベント
  list.querySelectorAll('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', () => onDelete(btn.dataset.deleteId));
  });
}

function renderSubCard(sub) {
  const usageMap = {
    often: { emoji: '😊', label: 'よく使ってる', color: 'text-emerald-700' },
    sometimes: { emoji: '🤔', label: 'たまに使う', color: 'text-yellow-700' },
    unused: { emoji: '😴', label: '使ってない', color: 'text-red-600' },
  };
  const u = usageMap[sub.usage] || usageMap.often;
  const cat = findCategoryById(_popular.categories, sub.category);

  return `
    <div class="bg-white rounded-2xl p-4 shadow-sm border border-emerald-100 flex items-center gap-3">
      <span class="text-2xl flex-shrink-0">${u.emoji}</span>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-gray-800 truncate">${escapeHtml(sub.name)}</p>
        <p class="text-xs ${u.color}">${u.label} ・ <span class="text-gray-500">${cat.emoji} ${cat.label}</span></p>
      </div>
      <div class="text-right flex-shrink-0">
        <p class="font-bold text-gray-800">${formatJPY(sub.price)}</p>
        <p class="text-xs text-gray-400">月額</p>
      </div>
      <button data-delete-id="${sub.id}" aria-label="削除" class="text-gray-300 hover:text-red-500 text-xl flex-shrink-0 px-1">×</button>
    </div>
  `;
}

function updateDacchoooMessage() {
  const subs = loadSubscriptions();
  const msg = document.getElementById('dacchooo-message');
  if (!msg) return;

  if (subs.length === 0) {
    msg.textContent = 'サブスクをひとつずつ登録してください。「よくあるサブスク」から選ぶとサクッと入力できます！';
  } else if (subs.length < 3) {
    msg.textContent = `${subs.length}件追加しました！クレカ明細を見ながらだと思い出しやすいですよ。`;
  } else if (subs.length < 6) {
    msg.textContent = `${subs.length}件、いい感じです！「見えてなかったサブスク」が浮き上がってきましたか？`;
  } else {
    msg.textContent = `${subs.length}件もあるんですね…！結果ページで「解約候補」を確認してみましょう。`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', init);
