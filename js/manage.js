// app.html用：サブスクの登録・一覧・削除・サービスピッカー（ロゴ付き）

let _popular = { categories: [], subscriptions: [] };
let _pickerState = { open: false, view: 'services', categoryFilter: null, query: '', selectedSub: null };

// 並び替え・表示モードのlocalStorage保存キー
const LIST_PREF_KEY = 'subsk_kanri_list_pref';
let _listPref = { sort: 'score', mode: 'normal' };

function loadListPref() {
  try {
    const raw = localStorage.getItem(LIST_PREF_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p.sort) _listPref.sort = p.sort;
      if (p.mode) _listPref.mode = p.mode;
    }
  } catch (e) {}
}

function saveListPref() {
  try { localStorage.setItem(LIST_PREF_KEY, JSON.stringify(_listPref)); } catch (e) {}
}

async function init() {
  const form = document.getElementById('sub-form');
  const clearBtn = document.getElementById('clear-all-btn');
  const openPickerBtn = document.getElementById('open-picker-btn');
  const openManualBtn = document.getElementById('open-manual-btn');
  const closeManualBtn = document.getElementById('close-manual-btn');

  loadListPref();
  _popular = await loadPopularSubscriptions();
  populateCategorySelect();

  form.addEventListener('submit', onSubmit);
  clearBtn.addEventListener('click', onClearAll);
  openPickerBtn.addEventListener('click', openPicker);
  openManualBtn.addEventListener('click', toggleManualForm);
  closeManualBtn.addEventListener('click', toggleManualForm);

  // 並び替え・表示モードボタン
  document.querySelectorAll('.sort-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _listPref.sort = btn.dataset.sort;
      saveListPref();
      renderList();
      trackEvent('list_sort_change', { sort: _listPref.sort });
    });
  });
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _listPref.mode = btn.dataset.mode;
      saveListPref();
      renderList();
      trackEvent('list_mode_change', { mode: _listPref.mode });
    });
  });

  renderList();
  trackEvent('checker_open', { sub_count: loadSubscriptions().length });
}

function populateCategorySelect() {
  const select = document.getElementById('sub-category');
  if (!select) return;
  select.innerHTML = _popular.categories
    .map((c) => `<option value="${c.id}">${c.emoji} ${c.label}</option>`)
    .join('');
  select.value = 'other';
}

function toggleManualForm() {
  const form = document.getElementById('sub-form');
  if (!form) return;
  if (form.classList.contains('hidden')) {
    form.classList.remove('hidden');
    document.getElementById('sub-name').focus();
    trackEvent('manual_form_open');
  } else {
    form.classList.add('hidden');
    form.reset();
    document.getElementById('sub-category').value = 'other';
  }
}

// ====== サービスピッカー（モーダル） ======

function openPicker() {
  _pickerState = { open: true, view: 'services', categoryFilter: null, query: '', selectedSub: null };
  trackEvent('picker_open');
  renderPicker();
}

function closePicker() {
  document.getElementById('picker-modal')?.remove();
  _pickerState.open = false;
}

function renderPicker() {
  document.getElementById('picker-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'picker-modal';
  modal.className = 'fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50';

  if (_pickerState.view === 'services') {
    modal.innerHTML = renderServicesView();
  } else {
    modal.innerHTML = renderPlanView();
  }

  document.body.appendChild(modal);
  attachPickerListeners(modal);
}

function renderServicesView() {
  const { categoryFilter, query } = _pickerState;
  const filteredSubs = filterSubscriptions(_popular.subscriptions, categoryFilter, query);

  return `
    <div class="bg-white w-full max-w-md md:max-w-lg h-[85vh] md:h-[80vh] rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col">
      <!-- ヘッダー -->
      <div class="p-4 border-b border-gray-100 flex items-center justify-between">
        <button id="picker-close" class="text-emerald-700 text-sm font-bold">閉じる</button>
        <h3 class="text-base font-bold text-gray-800">サブスクを追加</h3>
        <div class="w-12"></div>
      </div>

      <!-- 検索 -->
      <div class="p-4 border-b border-gray-100">
        <input id="picker-search" type="text" placeholder="サービス名で検索…" value="${escapeAttr(query)}"
          class="w-full p-3 bg-gray-100 rounded-xl text-sm focus:bg-white focus:border-emerald-500 outline-none border-2 border-transparent transition">
      </div>

      <!-- カテゴリタブ -->
      <div class="px-4 py-3 border-b border-gray-100">
        <div class="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          <button data-cat="ALL" class="picker-cat-btn flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border-2 ${categoryFilter === null ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}">すべて</button>
          ${_popular.categories.map((c) => `
            <button data-cat="${c.id}" class="picker-cat-btn flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border-2 ${categoryFilter === c.id ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}">${c.emoji} ${c.label}</button>
          `).join('')}
        </div>
      </div>

      <!-- サービスグリッド -->
      <div class="flex-1 overflow-y-auto p-4">
        ${filteredSubs.length === 0 ? `
          <div class="text-center text-sm text-gray-500 py-10">
            <p>該当するサービスがありません</p>
            <p class="text-xs mt-2">「閉じる」→「手動で入力する」から追加できます</p>
          </div>
        ` : `
          <div class="grid grid-cols-3 gap-3">
            ${filteredSubs.map(renderServiceTile).join('')}
          </div>
          <p class="text-xs text-gray-400 text-center mt-6">表示金額は公式の参考値・実額と異なる場合は次画面で編集できます</p>
        `}
      </div>
    </div>
  `;
}

function renderServiceTile(sub) {
  const cat = findCategoryById(_popular.categories, sub.category);
  const logoHTML = renderServiceLogo(sub);
  return `
    <button data-pick-name="${escapeAttr(sub.name)}" class="picker-service-btn bg-gray-50 hover:bg-emerald-50 rounded-2xl p-3 text-center transition flex flex-col items-center gap-1 border border-transparent hover:border-emerald-200">
      <div class="w-12 h-12 rounded-xl bg-white border border-gray-100 flex items-center justify-center overflow-hidden">
        ${logoHTML}
      </div>
      <p class="text-xs font-bold text-gray-800 leading-tight line-clamp-2 mt-1">${escapeHtml(sub.name)}</p>
      <p class="text-[10px] text-gray-500">${cat.emoji} ${cat.label}</p>
    </button>
  `;
}

function renderServiceLogo(sub) {
  if (sub.icon) {
    const color = sub.brandColor ? sub.brandColor : null;
    const url = color
      ? `https://cdn.simpleicons.org/${sub.icon}/${color}`
      : `https://cdn.simpleicons.org/${sub.icon}`;
    return `<img src="${url}" alt="${escapeAttr(sub.name)}" class="w-8 h-8 object-contain" onerror="this.outerHTML='<span class=\\'text-xl\\'>📦</span>'">`;
  }
  // アイコン未設定なら、カテゴリ絵文字でフォールバック
  const cat = findCategoryById(_popular.categories, sub.category);
  return `<span class="text-2xl">${cat.emoji}</span>`;
}

function renderPlanView() {
  const sub = _pickerState.selectedSub;
  if (!sub) return '';
  const cat = findCategoryById(_popular.categories, sub.category);
  const logoHTML = renderServiceLogo(sub);
  const defaultPlan = sub.plans.find((p) => p.default) || sub.plans[0];
  const selectedPlanIdx = _pickerState.selectedPlanIdx ?? sub.plans.findIndex((p) => p.default);
  const selectedPlan = sub.plans[selectedPlanIdx >= 0 ? selectedPlanIdx : 0];
  const editedPrice = _pickerState.editedPrice ?? selectedPlan.price;

  return `
    <div class="bg-white w-full max-w-md md:max-w-lg h-[90vh] md:max-h-[85vh] rounded-t-2xl md:rounded-2xl shadow-xl flex flex-col">
      <!-- ヘッダー -->
      <div class="p-4 border-b border-gray-100 flex items-center justify-between">
        <button id="picker-back" class="text-emerald-700 text-sm font-bold">← 戻る</button>
        <h3 class="text-base font-bold text-gray-800">プラン選択</h3>
        <button id="picker-close" class="text-gray-400 text-2xl leading-none">×</button>
      </div>

      <div class="flex-1 overflow-y-auto p-5">
        <!-- サービス情報 -->
        <div class="text-center mb-6">
          <div class="w-16 h-16 mx-auto rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden mb-2">
            ${logoHTML}
          </div>
          <p class="text-lg font-bold text-gray-800">${escapeHtml(sub.name)}</p>
          <p class="text-xs text-gray-500">${cat.emoji} ${cat.label}</p>
        </div>

        <!-- プラン一覧 -->
        <p class="text-sm font-bold text-gray-700 mb-2">プランを選択</p>
        <div class="space-y-2 mb-5">
          ${sub.plans.map((p, i) => `
            <button data-plan-idx="${i}" class="picker-plan-btn w-full flex items-center justify-between p-4 rounded-xl text-left transition ${i === selectedPlanIdx ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}">
              <div>
                <p class="text-sm font-bold">${escapeHtml(p.label)}</p>
                <p class="text-xs ${i === selectedPlanIdx ? 'text-gray-300' : 'text-gray-500'}">月次</p>
              </div>
              <p class="text-base font-bold">¥${p.price.toLocaleString('ja-JP')}</p>
            </button>
          `).join('')}
        </div>

        <!-- 金額編集 -->
        <div class="bg-gray-50 rounded-xl p-4 mb-5">
          <p class="text-sm font-bold text-gray-700 mb-1">💰 金額を編集</p>
          <p class="text-xs text-gray-500 mb-3">プラン変更や値上げで金額が違う場合は編集できます</p>
          <div class="flex items-center gap-2">
            <input id="picker-price-input" type="number" min="0" max="100000" step="1" value="${editedPrice}"
              class="flex-1 p-3 bg-white border-2 border-gray-200 rounded-xl text-gray-800 focus:border-emerald-500 outline-none">
            <span class="text-sm text-gray-500">JPY /月次</span>
          </div>
        </div>

        <!-- 使用頻度（ここで答えてもらう） -->
        <p class="text-sm font-bold text-gray-700 mb-2">最近、使ってますか？</p>
        <div class="grid grid-cols-1 gap-2 mb-3">
          ${[
            { value: 'often', emoji: '😊', label: 'よく使ってる（週1回以上）' },
            { value: 'sometimes', emoji: '🤔', label: 'たまに使う（月に数回）' },
            { value: 'unused', emoji: '😴', label: '1ヶ月以上使ってない' },
          ].map((opt) => `
            <button data-usage="${opt.value}" class="picker-usage-btn flex items-center gap-3 p-3 border-2 rounded-xl transition ${_pickerState.usage === opt.value ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'}">
              <span class="text-xl">${opt.emoji}</span>
              <span class="text-sm text-gray-700">${opt.label}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <!-- 追加ボタン -->
      <div class="p-4 border-t border-gray-100">
        <button id="picker-confirm" class="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-2xl transition disabled:opacity-40 disabled:cursor-not-allowed" ${_pickerState.usage ? '' : 'disabled'}>
          このプランで追加
        </button>
      </div>
    </div>
  `;
}

function filterSubscriptions(subs, categoryFilter, query) {
  let filtered = subs;
  if (categoryFilter) filtered = filtered.filter((s) => s.category === categoryFilter);
  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    filtered = filtered.filter((s) => s.name.toLowerCase().includes(q));
  }
  return filtered;
}

function attachPickerListeners(modal) {
  // 共通：閉じる・背景クリック
  modal.querySelector('#picker-close')?.addEventListener('click', closePicker);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePicker();
  });

  if (_pickerState.view === 'services') {
    // 検索
    const searchInput = modal.querySelector('#picker-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        _pickerState.query = e.target.value;
        // フォーカス維持のためフルrerenderせず、結果エリアだけ更新したいが、シンプル優先でフルrerender
        const cursor = searchInput.selectionStart;
        renderPicker();
        const newInput = document.querySelector('#picker-search');
        if (newInput) {
          newInput.focus();
          newInput.setSelectionRange(cursor, cursor);
        }
      });
    }
    // カテゴリ
    modal.querySelectorAll('.picker-cat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.cat;
        _pickerState.categoryFilter = cat === 'ALL' ? null : cat;
        renderPicker();
      });
    });
    // サービス選択 → プラン選択画面へ
    modal.querySelectorAll('.picker-service-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.pickName;
        const sub = _popular.subscriptions.find((s) => s.name === name);
        if (!sub) return;
        const defaultIdx = sub.plans.findIndex((p) => p.default);
        _pickerState.selectedSub = sub;
        _pickerState.selectedPlanIdx = defaultIdx >= 0 ? defaultIdx : 0;
        _pickerState.editedPrice = sub.plans[_pickerState.selectedPlanIdx].price;
        _pickerState.usage = null;
        _pickerState.view = 'plan';
        trackEvent('picker_service_select', { name });
        renderPicker();
      });
    });
  } else if (_pickerState.view === 'plan') {
    // 戻る
    modal.querySelector('#picker-back')?.addEventListener('click', () => {
      _pickerState.view = 'services';
      _pickerState.selectedSub = null;
      renderPicker();
    });
    // プラン選択
    modal.querySelectorAll('.picker-plan-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.planIdx);
        _pickerState.selectedPlanIdx = idx;
        _pickerState.editedPrice = _pickerState.selectedSub.plans[idx].price;
        renderPicker();
      });
    });
    // 金額編集
    const priceInput = modal.querySelector('#picker-price-input');
    if (priceInput) {
      priceInput.addEventListener('input', (e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v) && v >= 0) {
          _pickerState.editedPrice = v;
        }
      });
    }
    // 使用頻度
    modal.querySelectorAll('.picker-usage-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        _pickerState.usage = btn.dataset.usage;
        const cursor = (modal.querySelector('#picker-price-input') || {}).selectionStart;
        renderPicker();
      });
    });
    // 追加
    modal.querySelector('#picker-confirm')?.addEventListener('click', confirmPickerAdd);
  }
}

function confirmPickerAdd() {
  const sub = _pickerState.selectedSub;
  const plan = sub.plans[_pickerState.selectedPlanIdx];
  const price = Math.max(0, Math.min(100000, Number(_pickerState.editedPrice) || plan.price));
  const usage = _pickerState.usage;
  if (!usage) return;

  const fullName = sub.plans.length > 1 ? `${sub.name}（${plan.label}）` : sub.name;
  addSubscription({ name: fullName, price, usage, category: sub.category, cancelUrl: sub.cancelUrl || null });
  trackEvent('picker_subscription_add', { name: sub.name, plan: plan.label, price, usage });

  closePicker();
  updateDacchoooMessage();
  renderList();

  setTimeout(() => {
    const list = document.getElementById('sub-list');
    if (list) list.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 100);
}

// ====== 手動入力フォーム ======

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
  trackEvent('subscription_add', { price, usage, category, source: 'manual' });

  form.reset();
  document.getElementById('sub-category').value = 'other';
  form.classList.add('hidden'); // 入力後は自動で閉じる

  updateDacchoooMessage();
  renderList();

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
  const listControls = document.getElementById('list-controls');

  count.textContent = subs.length;

  if (subs.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    clearBtn.classList.add('hidden');
    resultBottom.classList.add('hidden');
    listControls?.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  clearBtn.classList.remove('hidden');
  resultBottom.classList.remove('hidden');
  listControls?.classList.remove('hidden');

  // ボタンの選択状態を反映
  document.querySelectorAll('.sort-btn').forEach((btn) => {
    if (btn.dataset.sort === _listPref.sort) {
      btn.className = 'sort-btn text-xs px-2 py-1 rounded-full border-2 bg-emerald-600 text-white border-emerald-600 transition';
    } else {
      btn.className = 'sort-btn text-xs px-2 py-1 rounded-full border-2 bg-white text-gray-700 border-emerald-200 transition';
    }
  });
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    if (btn.dataset.mode === _listPref.mode) {
      btn.className = 'mode-btn text-xs px-2 py-1 rounded-full border-2 bg-emerald-600 text-white border-emerald-600 transition';
    } else {
      btn.className = 'mode-btn text-xs px-2 py-1 rounded-full border-2 bg-white text-gray-700 border-emerald-200 transition';
    }
  });

  // 並び替え
  const sorted = sortSubscriptions(subs, _listPref.sort);
  const monthlyTotal = subs.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

  list.innerHTML = `
    <div class="bg-emerald-600 text-white rounded-2xl p-4 mb-3 text-center">
      <p class="text-xs opacity-90 mb-1">現時点の月額合計</p>
      <p class="text-3xl font-bold">${formatJPY(monthlyTotal)}</p>
      <p class="text-xs opacity-90 mt-1">年間 ${formatJPY(monthlyTotal * 12)} ・ 1日あたり ${formatJPY(Math.round(monthlyTotal * 12 / 365))}</p>
    </div>
    ${sorted.map((sub) => _listPref.mode === 'compact' ? renderSubCardCompact(sub) : renderSubCard(sub)).join('')}
  `;

  list.querySelectorAll('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDelete(btn.dataset.deleteId);
    });
  });

  // 解約リンクのクリック計測
  list.querySelectorAll('.cancel-link').forEach((a) => {
    a.addEventListener('click', () => {
      trackEvent('cancel_link_click', { sub_name: a.dataset.subName, from: 'app_list' });
    });
  });
}

function sortSubscriptions(subs, sortBy) {
  const arr = [...subs];
  switch (sortBy) {
    case 'score':
      return arr.sort((a, b) => calcScore(b) - calcScore(a));
    case 'price-desc':
      return arr.sort((a, b) => (b.price || 0) - (a.price || 0));
    case 'added':
      return arr.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    case 'name':
      return arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
    case 'category':
      return arr.sort((a, b) => (a.category || 'z').localeCompare(b.category || 'z'));
    default:
      return arr;
  }
}

function renderSubCard(sub) {
  const usageMap = {
    often: { emoji: '😊', label: 'よく使ってる', color: 'text-emerald-700' },
    sometimes: { emoji: '🤔', label: 'たまに使う', color: 'text-yellow-700' },
    unused: { emoji: '😴', label: '使ってない', color: 'text-red-600' },
  };
  const u = usageMap[sub.usage] || usageMap.often;
  const cat = findCategoryById(_popular.categories, sub.category);
  const dailyCost = Math.round((sub.price * 12) / 365);

  return `
    <div class="bg-white rounded-2xl p-4 shadow-sm border border-emerald-100">
      <div class="flex items-center gap-3">
        <span class="text-2xl flex-shrink-0">${u.emoji}</span>
        <div class="flex-1 min-w-0">
          <p class="font-bold text-gray-800 truncate">${escapeHtml(sub.name)}</p>
          <p class="text-xs ${u.color}">${u.label} ・ <span class="text-gray-500">${cat.emoji} ${cat.label}</span></p>
          <p class="text-[10px] text-gray-400">1日あたり ${formatJPY(dailyCost)}</p>
        </div>
        <div class="text-right flex-shrink-0">
          <p class="font-bold text-gray-800">${formatJPY(sub.price)}</p>
          <p class="text-xs text-gray-400">月額</p>
        </div>
        <button data-delete-id="${sub.id}" aria-label="削除" class="text-gray-300 hover:text-red-500 text-xl flex-shrink-0 px-1">×</button>
      </div>
      ${sub.cancelUrl ? `
        <a href="${escapeAttr(sub.cancelUrl)}" target="_blank" rel="noopener" class="cancel-link block mt-2 pt-2 border-t border-gray-100 text-xs text-red-600 hover:text-red-700 font-bold text-center" data-sub-name="${escapeAttr(sub.name)}">
          🚫 解約方法を確認する →
        </a>
      ` : ''}
    </div>
  `;
}

function renderSubCardCompact(sub) {
  const usageMap = {
    often: { emoji: '😊', color: 'text-emerald-700' },
    sometimes: { emoji: '🤔', color: 'text-yellow-700' },
    unused: { emoji: '😴', color: 'text-red-600' },
  };
  const u = usageMap[sub.usage] || usageMap.often;

  return `
    <div class="bg-white rounded-xl p-2.5 shadow-sm border border-emerald-100 flex items-center gap-2 text-sm">
      <span class="text-base flex-shrink-0">${u.emoji}</span>
      <p class="flex-1 min-w-0 font-bold text-gray-800 truncate">${escapeHtml(sub.name)}</p>
      <p class="font-bold text-gray-800 flex-shrink-0">${formatJPY(sub.price)}</p>
      ${sub.cancelUrl ? `
        <a href="${escapeAttr(sub.cancelUrl)}" target="_blank" rel="noopener" class="cancel-link text-red-500 hover:text-red-600 text-base flex-shrink-0" title="解約ページ" data-sub-name="${escapeAttr(sub.name)}">🚫</a>
      ` : ''}
      <button data-delete-id="${sub.id}" aria-label="削除" class="text-gray-300 hover:text-red-500 text-lg flex-shrink-0 px-1 leading-none">×</button>
    </div>
  `;
}

function updateDacchoooMessage() {
  const subs = loadSubscriptions();
  const msg = document.getElementById('dacchooo-message');
  if (!msg) return;

  if (subs.length === 0) {
    msg.textContent = 'サブスクをひとつずつ登録してください。「よくあるサブスクから選ぶ」をタップすると、ロゴ付きでサクッと追加できます！';
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

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

document.addEventListener('DOMContentLoaded', init);
