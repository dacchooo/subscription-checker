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

  const addButton = document.getElementById('add-event');
  if (addButton) {
    addButton.addEventListener('click', () => {
      const count = document.querySelectorAll('#event-list .event-row').length;
      if (count >= MAX_EVENTS) return;
      appendEventRow({ name: '', age: 50, amountMan: 0, years: 1, type: 'expense' }, count);
      updateAddButton();
    });
  }

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
      appendChildRow({ bornAtAge: 30, school: 'allPublic', univ: 'national', away: false });
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
      <span>親が何歳のときの子？</span>
      <div class="money-input">
        <input data-child="bornAtAge" type="number" min="15" max="60" inputmode="numeric" value="${escapeAttr(child.bornAtAge)}">
        <small>歳</small>
      </div>
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
  root.appendChild(row);
}

function updateChildButton() {
  const btn = document.getElementById('add-child');
  if (!btn) return;
  const count = document.querySelectorAll('#child-list .child-row').length;
  btn.disabled = count >= MAX_CHILDREN;
  btn.textContent = count >= MAX_CHILDREN ? `子どもは最大${MAX_CHILDREN}人までです` : '＋ 子どもを追加する（最大4人）';
}

function collectChildren() {
  return [...document.querySelectorAll('#child-list .child-row')].map((row) => {
    const bornAtAge = Number(row.querySelector('[data-child="bornAtAge"]').value);
    const school = row.querySelector('[data-child="school"]').value;
    const univ = row.querySelector('[data-child="univ"]').value;
    const away = row.querySelector('[data-child="away"]').checked;
    return { bornAtAge, school, univ, away };
  }).filter((child) => Number.isFinite(child.bornAtAge));
}

/* ---------- 住まい UI ---------- */

function setupHousingUI() {
  const select = document.getElementById('housing-type');
  if (!select) return;
  const sync = () => {
    document.getElementById('housing-rent-fields').classList.toggle('is-hidden', select.value !== 'rent');
    document.getElementById('housing-loan-fields').classList.toggle('is-hidden', select.value !== 'loan');
  };
  select.addEventListener('change', sync);
  sync();
}

/* ---------- イベント UI ---------- */

function renderEvents(events) {
  const root = document.getElementById('event-list');
  if (!root) return;
  root.innerHTML = '';
  events.forEach((eventItem, index) => appendEventRow(eventItem, index));
  updateAddButton();
}

function appendEventRow(eventItem, index) {
  const root = document.getElementById('event-list');
  if (!root) return;
  const row = document.createElement('div');
  row.className = 'event-row';
  row.innerHTML = `
    <label>
      <span>イベント名</span>
      <input name="eventName${index}" type="text" value="${escapeAttr(eventItem.name)}">
    </label>
    <label>
      <span>年齢</span>
      <input name="eventAge${index}" type="number" min="18" max="100" inputmode="numeric" value="${escapeAttr(eventItem.age)}">
    </label>
    <label>
      <span>金額（年あたり）</span>
      <div class="money-input">
        <input name="eventAmount${index}" type="number" min="0" max="30000" inputmode="numeric" value="${escapeAttr(eventItem.amountMan)}">
        <small>万円</small>
      </div>
    </label>
    <label>
      <span>継続年数</span>
      <div class="money-input">
        <input name="eventYears${index}" type="number" min="1" max="30" inputmode="numeric" value="${escapeAttr(eventItem.years || 1)}">
        <small>年</small>
      </div>
    </label>
    <label>
      <span>種類</span>
      <select name="eventType${index}">
        <option value="expense" ${eventItem.type === 'expense' ? 'selected' : ''}>支出</option>
        <option value="income" ${eventItem.type === 'income' ? 'selected' : ''}>収入</option>
      </select>
    </label>
  `;
  root.appendChild(row);
}

function updateAddButton() {
  const addButton = document.getElementById('add-event');
  if (!addButton) return;
  const count = document.querySelectorAll('#event-list .event-row').length;
  addButton.disabled = count >= MAX_EVENTS;
  addButton.textContent = count >= MAX_EVENTS ? `イベントは最大${MAX_EVENTS}件までです` : '＋ イベントを追加する';
}

/* ---------- 収集・検証 ---------- */

function collectAnswers() {
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
    alert('「何歳まで見る？」は、今の年齢より先の年齢を入力してください。');
    return null;
  }
  if (endAge - currentAge > 70) {
    alert('試算期間は70年以内にしてください。');
    return null;
  }
  if (!Number.isFinite(retirementAge) || retirementAge < currentAge || retirementAge > endAge) {
    alert('定年・退職予定年齢は、今の年齢から試算終了年齢までの範囲で入力してください。');
    return null;
  }
  if (!Number.isFinite(pensionAge)) {
    alert('年金の開始年齢を入力してください。');
    return null;
  }
  if (monthlyInvestMan > monthlyIncomeMan) {
    alert('毎月の積立投資額が手取り収入を超えています。');
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
      alert('配偶者の年齢と退職年齢を入力してください。');
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
  const children = collectChildren();
  for (const child of children) {
    if (child.bornAtAge < 15 || child.bornAtAge > 80) {
      alert('「親が何歳のときの子？」は15〜80歳の範囲で入力してください。');
      return null;
    }
  }

  // 住まい
  const housingType = String(formData.get('housingType') || 'none');
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
      alert('ローンを完済する年齢は、今の年齢以降で入力してください。');
      return null;
    }
  }

  const numbers = [
    cashMan, investMan, returnRate, monthlyInvestMan,
    monthlyIncomeMan, monthlyExpenseMan, annualIncomeMan, annualExpenseMan,
    severanceMan, pensionMan, bridgeIncomeMan,
    retiredExpenseMan, retiredAnnualExpenseMan,
    inflationRate, raiseRate, housingMonthlyMan, housingAfterMan,
  ];
  if (numbers.some((value) => !Number.isFinite(value))) {
    alert('金額と利回りを入力してください。');
    return null;
  }

  const events = collectEvents(formData)
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

function collectEvents(formData) {
  const events = [];
  for (let index = 0; index < MAX_EVENTS; index += 1) {
    if (formData.get(`eventName${index}`) === null && formData.get(`eventAge${index}`) === null) continue;
    const name = String(formData.get(`eventName${index}`) || '').trim();
    const age = Number(formData.get(`eventAge${index}`));
    const amountMan = Number(formData.get(`eventAmount${index}`) || 0);
    const years = Math.max(1, Math.min(30, Math.round(Number(formData.get(`eventYears${index}`) || 1))));
    const type = String(formData.get(`eventType${index}`) || 'expense');
    if (!Number.isFinite(age) || !Number.isFinite(amountMan)) continue;
    events.push({ name, age, amountMan, years, type });
  }
  return events;
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

    (data.children || []).slice(0, MAX_CHILDREN).forEach((child) => appendChildRow(child));
    updateChildButton();

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

    restoreEvents(data.events || []);
  } catch (error) {
    sessionStorage.removeItem(ANSWER_KEY);
  }
}

function restoreEvents(events) {
  const root = document.getElementById('event-list');
  if (!root) return;
  const existing = root.querySelectorAll('.event-row:not(.child-row)').length;
  events.slice(0, MAX_EVENTS).forEach((eventItem, index) => {
    if (index >= existing) appendEventRow(eventItem, index);
    setNamedValue(`eventName${index}`, eventItem.name);
    setNamedValue(`eventAge${index}`, eventItem.age);
    setNamedValue(`eventAmount${index}`, eventItem.amountMan);
    setNamedValue(`eventYears${index}`, eventItem.years || 1);
    setNamedValue(`eventType${index}`, eventItem.type);
  });
  updateAddButton();
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined && value !== null) el.value = value;
}

function setNamedValue(name, value) {
  const el = document.querySelector(`[name="${CSS.escape(name)}"]`);
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
