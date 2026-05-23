async function initResultPage() {
  const root = document.getElementById('result-root');
  const answers = readAnswers();
  if (!answers) {
    root.innerHTML = `
      <section class="card">
        <h1>診断結果がありません</h1>
        <p class="note">先に質問に回答してください。</p>
        <div class="actions"><a class="button button--primary" href="app.html">診断する</a></div>
      </section>
    `;
    return;
  }

  try {
    const data = await loadPrograms();
    const results = scorePrograms(data.programs, answers).slice(0, 7);
    renderResults(root, answers, results, data.lastVerified);
  } catch (error) {
    root.innerHTML = `
      <section class="card alert">
        <h1>読み込みに失敗しました</h1>
        <p>時間をおいて再度お試しください。</p>
      </section>
    `;
  }
}

function readAnswers() {
  const raw = sessionStorage.getItem(ANSWER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    sessionStorage.removeItem(ANSWER_KEY);
    return null;
  }
}

function scorePrograms(programs, answers) {
  return programs.map((program) => {
    let score = program.priority || 0;
    const reasons = [];

    if (program.scenes.includes(answers.scene)) {
      score += 30;
      reasons.push(sceneLabel(answers.scene));
    }

    if (program.families.includes(answers.family)) {
      score += 18;
      reasons.push(familyLabel(answers.family));
    }

    for (const detail of answers.details || []) {
      if (program.details.includes(detail)) {
        score += 12;
        reasons.push(detailLabel(detail));
      }
    }

    if (program.scenes.includes('living') && ['income-down', 'debt', 'housing'].includes(answers.scene)) score += 5;
    if (answers.family === 'single-parent' && program.category === 'ひとり親') score += 12;
    if (answers.family === 'children' && program.category === '子育て') score += 8;

    return {
      ...program,
      score,
      reasons: [...new Set(reasons)].slice(0, 4),
    };
  }).filter((program) => program.score > 12).sort((a, b) => b.score - a.score);
}

function renderResults(root, answers, results, lastVerified) {
  const topText = results.length > 0
    ? `${results.length}件の候補が見つかりました`
    : '近い候補を見つけられませんでした';

  root.innerHTML = `
    <section class="card result-hero">
      <p class="eyebrow">診断結果</p>
      <h1>${topText}</h1>
      <p class="note">${escapeHtml(answers.prefecture)} ${escapeHtml(answers.city)} / ${familyLabel(answers.family)} / ${sceneLabel(answers.scene)}</p>
    </section>

    <section class="card">
      <div class="speech">
        <img src="images/characters/dacchooo.png" alt="だっちょ">
        <div class="speech__bubble">近そうな制度を上から並べました。申請できるかは、公式ページや窓口で確認してください。</div>
      </div>
    </section>

    <section class="card alert">
      <h2>申請前に公式で確認してください</h2>
      <p>この結果は、入力内容から「対象になる可能性がある制度」を整理したものです。対象条件・期限・必要書類は自治体や窓口によって異なります。</p>
    </section>

    <section class="program-list">
      ${results.map((program, index) => renderProgram(program, answers, index)).join('')}
    </section>

    <section class="card">
      <h2>制度データの確認日</h2>
      <p class="note">国の公式ページを中心に、${escapeHtml(lastVerified)} 時点で確認した情報をもとにしています。</p>
      <div class="actions"><a class="button button--ghost" href="app.html">条件を変えて探す</a></div>
    </section>

    <footer class="footer">
      <a href="about.html">運営者情報</a>
      <a href="privacy.html">プライバシーポリシー</a>
      <a href="terms.html">利用規約</a>
    </footer>
  `;
}

function renderProgram(program, answers, index) {
  const localLinks = answers.showLocalLinks
    ? renderLocalLinks(program, answers)
    : '';

  return `
    <article class="program">
      <div class="program__head">
        <div>
          <div class="program__meta">
            <span class="pill">${escapeHtml(program.category)}</span>
            <span class="pill">${escapeHtml(program.consultation)}</span>
          </div>
          <h2>${escapeHtml(program.name)}</h2>
        </div>
        <span class="program__rank">${index + 1}</span>
      </div>

      <p class="program__body">${escapeHtml(program.summary)}</p>
      <p class="program__source">出典：${escapeHtml(program.sourceName)}</p>

      ${program.reasons.length > 0 ? `
        <div class="tag-list" aria-label="該当理由">
          ${program.reasons.map((reason) => `<span class="pill">${escapeHtml(reason)}</span>`).join('')}
        </div>
      ` : ''}

      <div class="program__actions">
        <a class="link-card link-card--official" href="${escapeAttr(program.officialUrl)}" target="_blank" rel="noopener">
          <span>国の公式ページを見る</span>
          <span>開く</span>
        </a>
        ${localLinks}
      </div>
    </article>
  `;
}

function renderLocalLinks(program, answers) {
  const area = `${answers.prefecture} ${answers.city}`;
  const terms = program.localSearchTerms && program.localSearchTerms.length > 0
    ? program.localSearchTerms
    : [program.name];

  return terms.slice(0, 2).map((term) => {
    const query = `${area} ${term} 公式`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return `
      <a class="link-card" href="${escapeAttr(url)}" target="_blank" rel="noopener">
        <span>${escapeHtml(answers.city)} × ${escapeHtml(term)}</span>
        <span>検索</span>
      </a>
    `;
  }).join('');
}

function familyLabel(id) {
  return (FAMILY_OPTIONS.find((item) => item.id === id) || {}).label || id;
}

function sceneLabel(id) {
  return (SCENE_OPTIONS.find((item) => item.id === id) || {}).label || id;
}

function detailLabel(id) {
  return (DETAIL_OPTIONS.find((item) => item.id === id) || {}).label || id;
}

document.addEventListener('DOMContentLoaded', initResultPage);
