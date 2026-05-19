// app.html用：サブスクの登録・一覧・削除

function init() {
  const form = document.getElementById('sub-form');
  const clearBtn = document.getElementById('clear-all-btn');

  form.addEventListener('submit', onSubmit);
  clearBtn.addEventListener('click', onClearAll);

  renderList();

  // GA4: 棚卸し画面到達
  trackEvent('checker_open', { sub_count: loadSubscriptions().length });
}

function onSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const formData = new FormData(form);
  const name = (formData.get('name') || '').toString().trim();
  const price = Number(formData.get('price') || 0);
  const usage = formData.get('usage');

  if (!name || !usage) return;
  if (price < 0 || price > 100000) return;

  const newSub = addSubscription({ name, price, usage });
  trackEvent('subscription_add', { price, usage });

  // フォームリセット
  form.reset();
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

  return `
    <div class="bg-white rounded-2xl p-4 shadow-sm border border-emerald-100 flex items-center gap-3">
      <span class="text-2xl flex-shrink-0">${u.emoji}</span>
      <div class="flex-1 min-w-0">
        <p class="font-bold text-gray-800 truncate">${escapeHtml(sub.name)}</p>
        <p class="text-xs ${u.color}">${u.label}</p>
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
    msg.textContent = 'サブスクをひとつずつ登録してください。思い出せる分だけでOKです！';
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
