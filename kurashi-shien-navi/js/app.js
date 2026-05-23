const ANSWER_KEY = 'kurashi_shien_answers';
const DATA_URL = 'data/programs.json';

const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
];

const FAMILY_OPTIONS = [
  { id: 'single', label: 'ひとり暮らし', help: '単身で暮らしている' },
  { id: 'couple', label: '夫婦・パートナー', help: '大人2人以上の世帯' },
  { id: 'children', label: '子どもあり', help: '子育て・教育費がある' },
  { id: 'single-parent', label: 'ひとり親', help: 'ひとりで子どもを育てている' },
  { id: 'care', label: '介護あり', help: '親や家族の介護がある' },
  { id: 'student', label: '学生', help: '本人または家族が学生' },
  { id: 'senior', label: '高齢者世帯', help: '高齢者のみ、または近い状況' },
];

const SCENE_OPTIONS = [
  { id: 'housing', label: '家賃・住まい', help: '家賃、退去、住む場所が不安' },
  { id: 'living', label: '生活費', help: '毎月の支払いが苦しい' },
  { id: 'income-down', label: '収入減・離職', help: '仕事が減った、辞めた' },
  { id: 'children', label: '子育て・教育費', help: '子どもの費用が不安' },
  { id: 'medical', label: '医療費・通院', help: '病院代や通院費が重い' },
  { id: 'care', label: '介護', help: '介護費用や相談先を探したい' },
  { id: 'debt', label: '借金・支払い', help: '返済や滞納がつらい' },
  { id: 'disaster', label: '災害・急な出費', help: '急な支出や被害がある' },
  { id: 'education', label: '学び直し・転職', help: '資格、訓練、再就職' },
];

const DETAIL_OPTIONS = [
  { id: 'rent-hard', label: '家賃の支払いがきつい' },
  { id: 'housing-risk', label: '住む場所を失いそう・退去が不安' },
  { id: 'income-down', label: '収入が減った' },
  { id: 'job-left', label: '仕事を辞めた・失業中' },
  { id: 'debt-hard', label: '借金や支払いの整理を相談したい' },
  { id: 'sudden-expense', label: '急な出費で生活費が足りない' },
  { id: 'medical-cost', label: '医療費・通院費が高い' },
  { id: 'long-treatment', label: '治療や通院が続いている' },
  { id: 'mental-health', label: 'メンタル不調で通院している' },
  { id: 'child-cost', label: '子育て費用が不安' },
  { id: 'school-cost', label: '学校・教材・給食などの費用が不安' },
  { id: 'single-parent', label: 'ひとり親として使える支援を知りたい' },
  { id: 'pregnancy', label: '妊娠中・出産予定がある' },
  { id: 'care-started', label: '介護が始まった・介護費用が不安' },
  { id: 'want-training', label: '職業訓練や学び直しをしたい' },
  { id: 'career-change', label: '転職・キャリア変更を考えている' },
  { id: 'student', label: '学生で保険料や生活費が不安' },
  { id: 'disaster-damage', label: '災害や事故の被害がある' },
];

function initAppPage() {
  const form = document.getElementById('navigator-form');
  if (!form) return;

  renderPrefectures();
  renderChoices('family-options', FAMILY_OPTIONS, 'family', 'radio');
  renderChoices('scene-options', SCENE_OPTIONS, 'scene', 'radio');
  renderChecks();
  restoreAnswers();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = collectAnswers();
    if (!data) return;
    sessionStorage.setItem(ANSWER_KEY, JSON.stringify(data));
    window.location.href = 'result.html';
  });
}

function renderPrefectures() {
  const select = document.getElementById('prefecture');
  if (!select) return;
  select.insertAdjacentHTML('beforeend', PREFECTURES.map((pref) => `<option value="${pref}">${pref}</option>`).join(''));
}

function renderChoices(rootId, options, name, type) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = options.map((option) => `
    <label class="choice">
      <input type="${type}" name="${name}" value="${option.id}" required>
      <span>
        <strong>${escapeHtml(option.label)}</strong>
        <small>${escapeHtml(option.help)}</small>
      </span>
    </label>
  `).join('');
}

function renderChecks() {
  const root = document.getElementById('detail-options');
  if (!root) return;
  root.innerHTML = DETAIL_OPTIONS.map((option) => `
    <label class="check-row">
      <input type="checkbox" name="details" value="${option.id}">
      <span>${escapeHtml(option.label)}</span>
    </label>
  `).join('');
}

function collectAnswers() {
  const form = document.getElementById('navigator-form');
  const formData = new FormData(form);
  const prefecture = String(formData.get('prefecture') || '').trim();
  const city = String(formData.get('city') || '').trim();
  const family = String(formData.get('family') || '').trim();
  const scene = String(formData.get('scene') || '').trim();
  const details = formData.getAll('details').map(String);
  const showLocalLinks = document.getElementById('show-local-links')?.checked !== false;

  if (!prefecture || !city || !family || !scene) {
    alert('お住まい・家族構成・困りごとを選んでください。');
    return null;
  }

  return {
    prefecture,
    city,
    family,
    scene,
    details,
    showLocalLinks,
    answeredAt: new Date().toISOString(),
  };
}

function restoreAnswers() {
  const raw = sessionStorage.getItem(ANSWER_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    setValue('prefecture', data.prefecture);
    setValue('city', data.city);
    checkValue('family', data.family);
    checkValue('scene', data.scene);
    for (const detail of data.details || []) checkValue('details', detail);
    const showLocal = document.getElementById('show-local-links');
    if (showLocal) showLocal.checked = data.showLocalLinks !== false;
  } catch (e) {
    sessionStorage.removeItem(ANSWER_KEY);
  }
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el && value) el.value = value;
}

function checkValue(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
  if (el) el.checked = true;
}

async function loadPrograms() {
  const res = await fetch(DATA_URL);
  if (!res.ok) throw new Error('制度データを読み込めませんでした');
  return res.json();
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

document.addEventListener('DOMContentLoaded', initAppPage);
