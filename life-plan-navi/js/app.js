const ANSWER_KEY = 'life_plan_answers';
const DATA_URL = 'data/sources.json';

async function initAppPage() {
  const form = document.getElementById('life-form');
  if (!form) return;

  trackEvent('life_plan_open');

  const data = await loadDataWithFallback();
  renderEvents(data.defaultEvents || []);
  restoreAnswers();

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
      assets_man: answers.currentAssetsMan,
      monthly_surplus_man: answers.monthlyIncomeMan - answers.monthlyExpenseMan,
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
      lastVerified: '2026-06-04',
      sources: [],
      defaultEvents: [
        { name: '教育費', age: 45, amountMan: 100, type: 'expense' },
        { name: '車・家電', age: 50, amountMan: 150, type: 'expense' },
        { name: '住宅修繕', age: 55, amountMan: 200, type: 'expense' },
        { name: '旅行・帰省', age: 60, amountMan: 80, type: 'expense' },
        { name: '退職金・臨時収入', age: 65, amountMan: 0, type: 'income' },
      ],
    };
  }
}

function renderEvents(events) {
  const root = document.getElementById('event-list');
  if (!root) return;
  root.innerHTML = events.map((eventItem, index) => `
    <div class="event-row">
      <label>
        <span>イベント名</span>
        <input name="eventName${index}" type="text" value="${escapeAttr(eventItem.name)}">
      </label>
      <label>
        <span>年齢</span>
        <input name="eventAge${index}" type="number" min="18" max="100" inputmode="numeric" value="${escapeAttr(eventItem.age)}">
      </label>
      <label>
        <span>金額</span>
        <div class="money-input">
          <input name="eventAmount${index}" type="number" min="0" max="30000" inputmode="numeric" value="${escapeAttr(eventItem.amountMan)}">
          <small>万円</small>
        </div>
      </label>
      <label>
        <span>種類</span>
        <select name="eventType${index}">
          <option value="expense" ${eventItem.type === 'expense' ? 'selected' : ''}>支出</option>
          <option value="income" ${eventItem.type === 'income' ? 'selected' : ''}>収入</option>
        </select>
      </label>
    </div>
  `).join('');
}

function collectAnswers() {
  const form = document.getElementById('life-form');
  const formData = new FormData(form);
  const currentAge = Number(formData.get('currentAge'));
  const endAge = Number(formData.get('endAge'));
  const currentAssetsMan = Number(formData.get('currentAssets'));
  const returnRate = Number(formData.get('returnRate'));
  const monthlyIncomeMan = Number(formData.get('monthlyIncome'));
  const monthlyExpenseMan = Number(formData.get('monthlyExpense'));
  const annualIncomeMan = Number(formData.get('annualIncome') || 0);
  const annualExpenseMan = Number(formData.get('annualExpense') || 0);
  const retirementAge = Number(formData.get('retirementAge'));
  const retiredIncomeMan = Number(formData.get('retiredIncome'));
  const retiredExpenseMan = Number(formData.get('retiredExpense'));
  const retiredAnnualExpenseMan = Number(formData.get('retiredAnnualExpense') || 0);

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

  const numbers = [
    currentAssetsMan,
    returnRate,
    monthlyIncomeMan,
    monthlyExpenseMan,
    annualIncomeMan,
    annualExpenseMan,
    retiredIncomeMan,
    retiredExpenseMan,
    retiredAnnualExpenseMan,
  ];
  if (numbers.some((value) => !Number.isFinite(value))) {
    alert('金額と利回りを入力してください。');
    return null;
  }

  const events = collectEvents(formData)
    .filter((eventItem) => eventItem.name || eventItem.amountMan > 0)
    .filter((eventItem) => eventItem.age >= currentAge && eventItem.age <= endAge);

  return {
    currentAge,
    endAge,
    currentAssetsMan,
    returnRate,
    monthlyIncomeMan,
    monthlyExpenseMan,
    annualIncomeMan,
    annualExpenseMan,
    retirementAge,
    retiredIncomeMan,
    retiredExpenseMan,
    retiredAnnualExpenseMan,
    events,
    answeredAt: new Date().toISOString(),
  };
}

function collectEvents(formData) {
  const events = [];
  for (let index = 0; index < 5; index += 1) {
    const name = String(formData.get(`eventName${index}`) || '').trim();
    const age = Number(formData.get(`eventAge${index}`));
    const amountMan = Number(formData.get(`eventAmount${index}`) || 0);
    const type = String(formData.get(`eventType${index}`) || 'expense');
    if (!Number.isFinite(age) || !Number.isFinite(amountMan)) continue;
    events.push({ name, age, amountMan, type });
  }
  return events;
}

function restoreAnswers() {
  const raw = sessionStorage.getItem(ANSWER_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    setValue('current-age', data.currentAge);
    setValue('end-age', data.endAge);
    setValue('current-assets', data.currentAssetsMan);
    setValue('return-rate', data.returnRate);
    setValue('monthly-income', data.monthlyIncomeMan);
    setValue('monthly-expense', data.monthlyExpenseMan);
    setValue('annual-income', data.annualIncomeMan);
    setValue('annual-expense', data.annualExpenseMan);
    setValue('retirement-age', data.retirementAge);
    setValue('retired-income', data.retiredIncomeMan);
    setValue('retired-expense', data.retiredExpenseMan);
    setValue('retired-annual-expense', data.retiredAnnualExpenseMan);
    restoreEvents(data.events || []);
  } catch (error) {
    sessionStorage.removeItem(ANSWER_KEY);
  }
}

function restoreEvents(events) {
  events.slice(0, 5).forEach((eventItem, index) => {
    setNamedValue(`eventName${index}`, eventItem.name);
    setNamedValue(`eventAge${index}`, eventItem.age);
    setNamedValue(`eventAmount${index}`, eventItem.amountMan);
    setNamedValue(`eventType${index}`, eventItem.type);
  });
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
