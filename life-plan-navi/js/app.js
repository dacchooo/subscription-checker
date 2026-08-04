const ANSWER_KEY = 'life_plan_answers';
const COMPARE_KEY = 'life_plan_compare';
const DATA_URL = 'data/sources.json';
const MAX_EVENTS = 10;
const MAX_CHILDREN = 4;

// 教育費の年間目安（万円）。出典：文部科学省「子供の学習費調査」、日本政策金融公庫「教育費負担の実態調査」の平均値をもとに丸めた値
const EDU_COST = {
  elem: { public: 35, private: 167 },
  jhs: { public: 54, private: 144 },
  hs: { public: 51, private: 105 },
  univ: {
    national: { annual: 104, entry: 67, label: '大学（国公立）' },
    privArts: { annual: 152, entry: 82, label: '大学（私立文系）' },
    privSci: { annual: 183, entry: 89, label: '大学（私立理系）' },
  },
  awayAnnual: 96,
};

const SCHOOL_PATTERNS = {
  allPublic: { label: 'オール公立', elem: 'public', jhs: 'public', hs: 'public' },
  highPrivate: { label: '高校から私立', elem: 'public', jhs: 'public', hs: 'private' },
  midPrivate: { label: '中学から私立', elem: 'public', jhs: 'private', hs: 'private' },
  allPrivate: { label: '小学校から私立', elem: 'private', jhs: 'private', hs: 'private' },
};

function childEduCostAt(child, childAge) {
  const pattern = SCHOOL_PATTERNS[child.school] || SCHOOL_PATTERNS.allPublic;
  if (childAge >= 6 && childAge <= 11) return EDU_COST.elem[pattern.elem];
  if (childAge >= 12 && childAge <= 14) return EDU_COST.jhs[pattern.jhs];
  if (childAge >= 15 && childAge <= 17) return EDU_COST.hs[pattern.hs];
  if (child.univ !== 'none' && childAge >= 18 && childAge <= 21) {
    const univ = EDU_COST.univ[child.univ];
    if (!univ) return 0;
    let cost = univ.annual + (childAge === 18 ? univ.entry : 0);
    if (child.away) cost += EDU_COST.awayAnnual;
    return cost;
  }
  return 0;
}

async function initAppPage() {
  const form = document.getElementById('life-form');
  if (!form) return;

  trackEvent('life_plan_open');

  const data = await loadDataWithFallback();
  renderEvents(data.defaultEvents || []);
  setupFamilyUI();
  setupHousingUI();
  restoreAnswers();
  updateEventTally();

  const addButton = document.getElementById('add-event');
  if (addButton) {
    addButton.addEventListener('click', () => {
      if (document.querySelectorAll('#event-list .event-row').length >= MAX_EVENTS) return;
      appendEventRow({ name: '', age: 50, amountMan: 0, years: 1, type: 'expense' });
      updateAddButton();
      updateEventTally();
    });
  }

  const eventList = document.getElementById('event-list');
  if (eventList) {
    eventList.addEventListener('input', updateEventTally);
    eventList.addEventListener('change', updateEventTally);
  }

  // エラー表示は再入力で消す
  form.addEventListener('input', (event) => {
    const el = event.target;
    if (el.classList && el.classList.contains('is-invalid')) {
      el.classList.remove('is-invalid');
      const label = el.closest('label');
      const error = label && label.nextElementSibling;
      if (error && error.classList.contains('field-error')) error.remove();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const answers = collectAnswers();
    if (!answers) return;
    sessionStorage.setItem(ANSWER_KEY, JSON.stringify(answers));
    trackEvent('life_plan_submit', {
      years: answers.endAge - answers.currentAge,
      current_age: answers.currentAge,
      end_age: answers.endAge,
      retirement_age: answers.retirementAge,
      pension_age: answers.pensionAge,
      has_spouse: answers.spouse ? 1 : 0,
      child_count: answers.children.length,
      housing_type: answers.housingType,
      inflation_rate: answers.inflationRate,
      event_count: answers.events.filter((item) => item.amountMan > 0).length,
    });
    window.location.href = 'result.html';
  });
}

async function loadDataWithFallback() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('data load failed');
    return res.json();
  } catch (error) {
    return {
      lastVerified: '2026-08-03',
      sources: [],
      defaultEvents: [
        { name: '車・家電の買い替え', age: 50, amountMan: 150, years: 1, type: 'expense' },
        { name: '住宅修繕', age: 55, amountMan: 200, years: 1, type: 'expense' },
        { name: '旅行・帰省', age: 60, amountMan: 80, years: 1, type: 'expense' },
        { name: '臨時収入', age: 65, amountMan: 0, years: 1, type: 'income' },
      ],
    };
  }
}

/* ---------- インラインエラー ---------- */

function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach((el) => el.remove());
  document.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
}

function showFieldError(target, message) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) {
    alert(message);
    return;
  }
  el.classList.add('is-invalid');
  const label = el.closest('label') || el;
  label.insertAdjacentHTML('afterend', `<p class="field-error">${escapeHtml(message)}</p>`);
  const details = el.closest('details');
  if (details) details.open = true;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
}

/* ---------- 家族 UI ---------- */

function setupFamilyUI() {
  const toggle = document.getElementById('spouse-enabled');
  const fields = document.getElementById('spouse-fields');
  if (toggle && fields) {
    toggle.addEventListener('change', () => fields.classList.toggle('is-hidden', !toggle.checked));
  }
  const addChild = document.getElementById('add-child');
  if (addChild) {
    addChild.addEventListener('click', () => {
      if (document.querySelectorAll('#child-list .child-row').length >= MAX_CHILDREN) return;
      appendChildRow({ nowAge: 5, future: false, school: 'allPublic', univ: 'national', away: false });
      updateChildButton();
    });
  }
  updateChildButton();
}

function appendChildRow(child) {
  const root = document.getElementById('child-list');
  if (!root) return;
  const row = document.createElement('div');
  row.className = 'event-row child-row';
  row.innerHTML = `
    <label>
      <span data-child-age-label>${child.future ? '何年後に生まれる予定？' : '子どもの今の年齢'}</span>
      <div class="money-input">
        <input data-child="ageValue" type="number" min="0" max="30" inputmode="numeric" value="${escapeAttr(child.future ? (child.yearsUntil || 1) : (child.nowAge ?? 5))}">
        <small data-child-age-unit>${child.future ? '年後' : '歳'}</small>
      </div>
    </label>
    <label class="toggle-row toggle-row--compact">
      <input data-child="future" type="checkbox" ${child.future ? 'checked' : ''}>
      <span>これから生まれる予定</span>
    </label>
    <label>
      <span>小・中・高の進路</span>
      <select data-child="school">
        ${Object.entries(SCHOOL_PATTERNS).map(([key, p]) => `<option value="${key}" ${child.school === key ? 'selected' : ''}>${p.label}</option>`).join('')}
      </select>
    </label>
    <label>
      <span>大学</span>
      <select data-child="univ">
        <option value="none" ${child.univ === 'none' ? 'selected' : ''}>進学しない・未定</option>
        <option value="national" ${child.univ === 'national' ? 'selected' : ''}>国公立</option>
        <option value="privArts" ${child.univ === 'privArts' ? 'selected' : ''}>私立文系</option>
        <option value="privSci" ${child.univ === 'privSci' ? 'selected' : ''}>私立理系</option>
      </select>
    </label>
    <label class="toggle-row toggle-row--compact">
      <input data-child="away" type="checkbox" ${child.away ? 'checked' : ''}>
      <span>大学は自宅外（下宿）</span>
    </label>
    <button class="button button--ghost button--small" type="button" data-remove-child>削除</button>
  `;
  row.querySelector('[data-remove-child]').addEventListener('click', () => {
    row.remove();
    updateChildButton();
  });
  row.querySelector('[data-child="future"]').addEventListener('change', (event) => {
    const future = event.target.checked;
    row.querySelector('[data-child-age-label]').textContent = future ? '何年後に生まれる予定？' : '子どもの今の年齢';
    row.querySelector('[data-child-age-unit]').textContent = future ? '年後' : '歳';
    const input = row.querySelector('[data-child="ageValue"]');
    input.min = future ? 1 : 0;
    input.max = future ? 20 : 30;
    if (future && Number(input.value) < 1) input.value = 1;
  });
  root.appendChild(row);
}

function updateChildButton() {
  const btn = document.getElementById('add-child');
  if (!btn) return;
  const count = document.querySelectorAll('#child-list .child-row').length;
  btn.disabled = count >= MAX_CHILDREN;
  btn.textContent = count >= MAX_CHILDREN ? `子どもは最大${MAX_CHILDREN}人までです` : '＋ 子どもを追加する（最大4人）';
}

function collectChildren(currentAge) {
  const rows = [...document.querySelectorAll('#child-list .child-row')];
  const children = [];
  for (const row of rows) {
    const input = row.querySelector('[data-child="ageValue"]');
    const value = Number(input.value);
    const future = row.querySelector('[data-child="future"]').checked;
    if (!Number.isFinite(value)) continue;
    if (!future && (value < 0 || value > 30)) {
      showFieldError(input, '子どもの年齢は0〜30歳で入力してください。');
      return null;
    }
    if (future && (value < 1 || value > 20)) {
      showFieldError(input, '「何年後に生まれる予定？」は1〜20年で入力してください。');
      return null;
    }
    children.push({
      bornAtAge: future ? currentAge + value : currentAge - value,
      school: row.querySelector('[data-child="school"]').value,
      univ: row.querySelector('[data-child="univ"]').value,
      away: row.querySelector('[data-child="away"]').checked,
    });
  }
  return children;
}

/* ---------- 住まい UI ---------- */

function setupHousingUI() {
  const select = document.getElementById('housing-type');
  if (!select) return;
  const sync = () => {
    document.getElementById('housing-rent-fields').classList.toggle('is-hidden', select.value !== 'rent');
    document.getElementById('housing-loan-fields').classList.toggle('is-hidden', select.value !== 'loan');
    const hint = document.getElementById('living-hint');
    if (hint) {
      if (select.value === 'none') {
        hint.textContent = '✅ このプランでは家賃・ローンも上の「生活費」に含めて計算します。教育費は自動計算されるので入れないでください。';
      } else if (select.value === 'rent' || select.value === 'loan') {
        hint.textContent = '⚠️ 生活費に家賃・ローンは入れないでください（「住まい」で分けて入力します）。教育費は自動計算されるので入れないでください。';
      } else {
        hint.textContent = '⚠️ 生活費に家賃・住宅ローンを入れるかどうかは、次の「住まい」の選択で決まります。教育費は自動計算されるので入れないでください。';
      }
    }
  };
  select.addEventListener('change', sync);
  sync();
}

/* ---------- イベント UI ---------- */

function renderEvents(events) {
  const root = document.getElementById('event-list');
  if (!root) return;
  root.innerHTML = '';
  events.slice(0, MAX_EVENTS).forEach((eventItem) => appendEventRow(eventItem));
  updateAddButton();
  updateEventTally();
}

function appendEventRow(eventItem) {
  const root = document.getElementById('event-list');
  if (!root) return;
  const row = document.createElement('div');
  row.className = 'event-row';
  row.innerHTML = `
    <label>
      <span>イベント名</span>
      <input data-event="name" type="text" value="${escapeAttr(eventItem.name)}">
    </label>
    <label>
      <span>年齢</span>
      <input data-event="age" type="number" min="18" max="100" inputmode="numeric" value="${escapeAttr(eventItem.age)}">
    </label>
    <label>
      <span>金額（年あたり）</span>
      <div class="money-input">
        <input data-event="amount" type="number" min="0" max="30000" inputmode="numeric" value="${escapeAttr(eventItem.amountMan)}">
        <small>万円</small>
      </div>
    </label>
    <label>
      <span>継続年数</span>
      <div class="money-input">
        <input data-event="years" type="number" min="1" max="30" inputmode="numeric" value="${escapeAttr(eventItem.years || 1)}">
        <small>年</small>
      </div>
    </label>
    <label>
      <span>種類</span>
      <select data-event="type">
        <option value="expense" ${eventItem.type === 'expense' ? 'selected' : ''}>支出</option>
        <option value="income" ${eventItem.type === 'income' ? 'selected' : ''}>収入</option>
      </select>
    </label>
    <button class="button button--ghost button--small" type="button" data-remove-event>削除</button>
  `;
  row.querySelector('[data-remove-event]').addEventListener('click', () => {
    row.remove();
    updateAddButton();
    updateEventTally();
  });
  root.appendChild(row);
}

function updateAddButton() {
  const addButton = document.getElementById('add-event');
  if (!addButton) return;
  const count = document.querySelectorAll('#event-list .event-row').length;
  addButton.disabled = count >= MAX_EVENTS;
  addButton.textContent = count >= MAX_EVENTS ? `イベントは最大${MAX_EVENTS}件までです` : '＋ イベントを追加する';
}

function updateEventTally() {
  const tally = document.getElementById('event-tally');
  if (!tally) return;
  const events = collectEvents().filter((e) => e.amountMan > 0);
  if (events.length === 0) {
    tally.textContent = 'いま試算に入っているイベントはありません。';
    return;
  }
  const expense = events.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amountMan * (e.years || 1), 0);
  const income = events.filter((e) => e.type === 'income').reduce((s, e) => s + e.amountMan * (e.years || 1), 0);
  const parts = [];
  if (expense > 0) parts.push(`支出 計${expense.toLocaleString('ja-JP')}万円`);
  if (income > 0) parts.push(`収入 計${income.toLocaleString('ja-JP')}万円`);
  tally.textContent = `📋 イベント${events.length}件（${parts.join('・')}）を試算に織り込み中。不要なら下で削除できます。`;
}

function collectEvents() {
  return [...document.querySelectorAll('#event-list .event-row')].map((row) => {
    const name = row.querySelector('[data-event="name"]').value.trim();
    const age = Number(row.querySelector('[data-event="age"]').value);
    const amountMan = Number(row.querySelector('[data-event="amount"]').value || 0);
    const years = Math.max(1, Math.min(30, Math.round(Number(row.querySelector('[data-event="years"]').value || 1))));
    const type = row.querySelector('[data-event="type"]').value;
    return { name, age, amountMan, years, type };
  }).filter((e) => Number.isFinite(e.age) && Number.isFinite(e.amountMan));
}

/* ---------- 収集・検証 ---------- */

function collectAnswers() {
  clearFieldErrors();
  const form = document.getElementById('life-form');
  const formData = new FormData(form);
  const currentAge = Number(formData.get('currentAge'));
  const endAge = Number(formData.get('endAge'));
  const cashMan = Number(formData.get('cash'));
  const investMan = Number(formData.get('invest') || 0);
  const returnRate = Number(formData.get('returnRate'));
  const monthlyInvestMan = Number(formData.get('monthlyInvest') || 0);
  const monthlyIncomeMan = Number(formData.get('monthlyIncome'));
  const monthlyExpenseMan = Number(formData.get('monthlyExpense'));
  const annualIncomeMan = Number(formData.get('annualIncome') || 0);
  const annualExpenseMan = Number(formData.get('annualExpense') || 0);
  const retirementAge = Number(formData.get('retirementAge'));
  const severanceMan = Number(formData.get('severance') || 0);
  const pensionAge = Number(formData.get('pensionAge'));
  const pensionMan = Number(formData.get('pension'));
  const bridgeIncomeMan = Number(formData.get('bridgeIncome') || 0);
  const retiredExpenseMan = Number(formData.get('retiredExpense'));
  const retiredAnnualExpenseMan = Number(formData.get('retiredAnnualExpense') || 0);
  const inflationRate = Number(formData.get('inflationRate') || 0);
  const raiseRate = Number(formData.get('raiseRate') || 0);

  if (!Number.isFinite(currentAge) || !Number.isFinite(endAge) || endAge <= currentAge) {
    showFieldError('end-age', '「何歳まで見る？」は、今の年齢より先の年齢を入力してください。');
    return null;
  }
  if (endAge - currentAge > 70) {
    showFieldError('end-age', '試算期間は70年以内にしてください。');
    return null;
  }
  if (!Number.isFinite(retirementAge) || retirementAge < currentAge || retirementAge > endAge) {
    showFieldError('retirement-age', '定年・退職予定年齢は、今の年齢から試算終了年齢までの範囲で入力してください。');
    return null;
  }
  if (!Number.isFinite(pensionAge)) {
    showFieldError('pension-age', '年金の開始年齢を入力してください。');
    return null;
  }
  if (monthlyInvestMan > monthlyIncomeMan) {
    showFieldError('monthly-invest', '毎月の積立投資額が手取り収入を超えています。');
    return null;
  }

  // 配偶者
  let spouse = null;
  if (formData.get('spouseEnabled')) {
    const spouseAge = Number(formData.get('spouseAge'));
    const spouseIncome = Number(formData.get('spouseIncome') || 0);
    const spouseRetireAge = Number(formData.get('spouseRetireAge'));
    const spousePension = Number(formData.get('spousePension') || 0);
    if (!Number.isFinite(spouseAge) || !Number.isFinite(spouseRetireAge)) {
      showFieldError('spouse-age', '配偶者の年齢と退職年齢を入力してください。');
      return null;
    }
    spouse = {
      ageDiff: spouseAge - currentAge,
      monthlyIncomeMan: spouseIncome,
      retirementAge: spouseRetireAge,
      pensionAge: 65,
      pensionMan: spousePension,
    };
  }

  // 子ども
  const children = collectChildren(currentAge);
  if (children === null) return null;

  // 住まい
  const housingType = String(formData.get('housingType') || '');
  if (!housingType) {
    showFieldError('housing-type', '住居費のタイプを選んでください。');
    return null;
  }
  let housingMonthlyMan = 0;
  let housingLoanEndAge = 0;
  let housingAfterMan = 0;
  if (housingType === 'rent') {
    housingMonthlyMan = Number(formData.get('housingMonthlyRent') || 0);
  } else if (housingType === 'loan') {
    housingMonthlyMan = Number(formData.get('housingMonthlyLoan') || 0);
    housingLoanEndAge = Number(formData.get('housingLoanEndAge') || 0);
    housingAfterMan = Number(formData.get('housingAfter') || 0);
    if (!Number.isFinite(housingLoanEndAge) || housingLoanEndAge < currentAge) {
      showFieldError('housing-loan-end', 'ローンを完済する年齢は、今の年齢以降で入力してください。');
      return null;
    }
  }

  const numberChecks = [
    [cashMan, 'cash'], [investMan, 'invest'], [returnRate, 'return-rate'], [monthlyInvestMan, 'monthly-invest'],
    [monthlyIncomeMan, 'monthly-income'], [monthlyExpenseMan, 'monthly-expense'],
    [annualIncomeMan, 'annual-income'], [annualExpenseMan, 'annual-expense'],
    [severanceMan, 'severance'], [pensionMan, 'pension'], [bridgeIncomeMan, 'bridge-income'],
    [retiredExpenseMan, 'retired-expense'], [retiredAnnualExpenseMan, 'retired-annual-expense'],
    [inflationRate, 'inflation-rate'], [raiseRate, 'raise-rate'],
    [housingMonthlyMan, housingType === 'rent' ? 'housing-monthly-rent' : 'housing-monthly-loan'],
    [housingAfterMan, 'housing-after'],
  ];
  for (const [value, id] of numberChecks) {
    if (!Number.isFinite(value)) {
      showFieldError(id, 'この欄に数字を入力してください。');
      return null;
    }
  }

  const events = collectEvents()
    .filter((eventItem) => eventItem.name || eventItem.amountMan > 0)
    .filter((eventItem) => eventItem.age >= currentAge && eventItem.age <= endAge);

  return {
    version: 3,
    currentAge,
    endAge,
    cashMan,
    investMan,
    returnRate,
    monthlyInvestMan,
    monthlyIncomeMan,
    monthlyExpenseMan,
    annualIncomeMan,
    annualExpenseMan,
    retirementAge,
    severanceMan,
    pensionAge,
    pensionMan,
    bridgeIncomeMan,
    retiredExpenseMan,
    retiredAnnualExpenseMan,
    inflationRate,
    raiseRate,
    spouse,
    children,
    housingType,
    housingMonthlyMan,
    housingLoanEndAge,
    housingAfterMan,
    events,
    answeredAt: new Date().toISOString(),
  };
}

/* ---------- 復元 ---------- */

function restoreAnswers() {
  const raw = sessionStorage.getItem(ANSWER_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    setValue('current-age', data.currentAge);
    setValue('end-age', data.endAge);
    setValue('cash', data.cashMan ?? data.currentAssetsMan);
    setValue('invest', data.investMan);
    setValue('return-rate', data.returnRate);
    setValue('monthly-invest', data.monthlyInvestMan);
    setValue('monthly-income', data.monthlyIncomeMan);
    setValue('monthly-expense', data.monthlyExpenseMan);
    setValue('annual-income', data.annualIncomeMan);
    setValue('annual-expense', data.annualExpenseMan);
    setValue('retirement-age', data.retirementAge);
    setValue('severance', data.severanceMan);
    setValue('pension-age', data.pensionAge ?? data.retirementAge);
    setValue('pension', data.pensionMan ?? data.retiredIncomeMan);
    setValue('bridge-income', data.bridgeIncomeMan);
    setValue('retired-expense', data.retiredExpenseMan);
    setValue('retired-annual-expense', data.retiredAnnualExpenseMan);
    setValue('inflation-rate', data.inflationRate);
    setValue('raise-rate', data.raiseRate);

    if (data.spouse) {
      const toggle = document.getElementById('spouse-enabled');
      toggle.checked = true;
      document.getElementById('spouse-fields').classList.remove('is-hidden');
      setValue('spouse-age', (data.currentAge || 0) + data.spouse.ageDiff);
      setValue('spouse-income', data.spouse.monthlyIncomeMan);
      setValue('spouse-retire-age', data.spouse.retirementAge);
      setValue('spouse-pension', data.spouse.pensionMan);
    }

    (data.children || []).slice(0, MAX_CHILDREN).forEach((child) => {
      const nowAge = (data.currentAge || 0) - child.bornAtAge;
      appendChildRow({
        nowAge: Math.max(0, nowAge),
        future: nowAge < 0,
        yearsUntil: nowAge < 0 ? -nowAge : 1,
        school: child.school,
        univ: child.univ,
        away: child.away,
      });
    });
    updateChildButton();

    // 家族データがあれば折りたたみを開いた状態で復元
    if (data.spouse || (data.children || []).length > 0) {
      const familyDetails = document.getElementById('family-details');
      if (familyDetails) familyDetails.open = true;
    }

    if (data.housingType) {
      setValue('housing-type', data.housingType);
      if (data.housingType === 'rent') setValue('housing-monthly-rent', data.housingMonthlyMan);
      if (data.housingType === 'loan') {
        setValue('housing-monthly-loan', data.housingMonthlyMan);
        setValue('housing-loan-end', data.housingLoanEndAge);
        setValue('housing-after', data.housingAfterMan);
      }
      setupHousingUI();
    }

    if (Array.isArray(data.events)) {
      renderEvents(data.events);
      if (data.events.some((e) => e.amountMan > 0)) {
        const eventDetails = document.getElementById('event-details');
        if (eventDetails) eventDetails.open = true;
      }
    }
  } catch (error) {
    sessionStorage.removeItem(ANSWER_KEY);
  }
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined && value !== null) el.value = value;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function trackEvent(name, params = {}) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

document.addEventListener('DOMContentLoaded', initAppPage);
