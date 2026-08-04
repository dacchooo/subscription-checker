async function initResultPage() {
  const root = document.getElementById('result-root');
  const answers = readAnswers();
  if (!answers) {
    root.innerHTML = `
      <section class="card">
        <h1>ライフプラン表がありません</h1>
        <p class="note">先に条件を入力してください。</p>
        <div class="actions"><a class="button button--primary" href="app.html">入力する</a></div>
      </section>
    `;
    return;
  }

  const data = await loadDataWithFallback();
  const rows = buildPlanRows(answers);
  renderResults(root, answers, rows, data);
}

function readAnswers() {
  const raw = sessionStorage.getItem(ANSWER_KEY);
  if (!raw) return null;
  try {
    return normalizeAnswers(JSON.parse(raw));
  } catch (error) {
    sessionStorage.removeItem(ANSWER_KEY);
    return null;
  }
}

function normalizeAnswers(data) {
  const normalized = { ...data };
  if (normalized.cashMan === undefined) normalized.cashMan = normalized.currentAssetsMan ?? 0;
  normalized.investMan = normalized.investMan ?? 0;
  normalized.monthlyInvestMan = normalized.monthlyInvestMan ?? 0;
  normalized.severanceMan = normalized.severanceMan ?? 0;
  normalized.pensionAge = normalized.pensionAge ?? normalized.retirementAge;
  normalized.pensionMan = normalized.pensionMan ?? normalized.retiredIncomeMan ?? 0;
  normalized.bridgeIncomeMan = normalized.bridgeIncomeMan ?? 0;
  normalized.inflationRate = normalized.inflationRate ?? 0;
  normalized.raiseRate = normalized.raiseRate ?? 0;
  normalized.spouse = normalized.spouse ?? null;
  normalized.children = normalized.children ?? [];
  normalized.housingType = normalized.housingType ?? 'none';
  normalized.housingMonthlyMan = normalized.housingMonthlyMan ?? 0;
  normalized.housingLoanEndAge = normalized.housingLoanEndAge ?? 0;
  normalized.housingAfterMan = normalized.housingAfterMan ?? 0;
  normalized.events = (normalized.events || []).map((eventItem) => ({ years: 1, ...eventItem }));
  return normalized;
}

function buildPlanRows(answers) {
  const rows = [];
  const baseYear = new Date().getFullYear();
  let cash = answers.cashMan;
  let invest = answers.investMan;
  const annualReturn = answers.returnRate / 100;
  const inflation = answers.inflationRate / 100;
  const raise = answers.raiseRate / 100;

  for (let age = answers.currentAge; age <= answers.endAge; age += 1) {
    const yearIndex = age - answers.currentAge;
    const phase = age < answers.retirementAge
      ? '現役期'
      : (age < answers.pensionAge ? '年金待ち' : '年金期');

    let myIncome = 0;
    let spouseIncome = 0;
    let pensionIncome = 0;
    let living = 0;
    let housing = 0;
    let education = 0;
    let contribution = 0;
    let severance = 0;
    let eventTotal = 0;
    let eventNames = [];

    if (yearIndex > 0) {
      const inflator = Math.pow(1 + inflation, yearIndex);

      // 本人の収入
      if (age < answers.retirementAge) {
        myIncome = answers.monthlyIncomeMan * 12 * Math.pow(1 + raise, yearIndex) + answers.annualIncomeMan;
        contribution = answers.monthlyInvestMan * 12;
      } else if (age < answers.pensionAge) {
        myIncome = answers.bridgeIncomeMan * 12;
      }
      if (age >= answers.pensionAge) pensionIncome += answers.pensionMan * 12;

      // 配偶者の収入
      if (answers.spouse) {
        const spouseAge = age + answers.spouse.ageDiff;
        if (spouseAge < answers.spouse.retirementAge) {
          spouseIncome = answers.spouse.monthlyIncomeMan * 12 * Math.pow(1 + raise, yearIndex);
        }
        if (spouseAge >= answers.spouse.pensionAge) {
          pensionIncome += answers.spouse.pensionMan * 12;
        }
      }

      // 生活費（住居費のぞく）
      const baseLiving = age < answers.retirementAge
        ? answers.monthlyExpenseMan * 12 + answers.annualExpenseMan
        : answers.retiredExpenseMan * 12 + answers.retiredAnnualExpenseMan;
      living = baseLiving * inflator;

      // 住居費
      if (answers.housingType === 'rent') {
        housing = answers.housingMonthlyMan * 12 * inflator;
      } else if (answers.housingType === 'loan') {
        housing = age <= answers.housingLoanEndAge
          ? answers.housingMonthlyMan * 12
          : answers.housingAfterMan * 12 * inflator;
      }

      // 教育費（統計目安・自動計算）
      for (const child of answers.children) {
        education += childEduCostAt(child, age - child.bornAtAge);
      }

      // 退職金
      if (age === answers.retirementAge && answers.severanceMan > 0) {
        severance = answers.severanceMan;
        eventNames.push('退職金');
      }

      // イベント
      const activeEvents = (answers.events || []).filter((eventItem) =>
        eventItem.amountMan > 0 && age >= eventItem.age && age < eventItem.age + (eventItem.years || 1));
      eventTotal = activeEvents.reduce((sum, eventItem) =>
        sum + (eventItem.type === 'income' ? 1 : -1) * eventItem.amountMan, 0);
      eventNames = eventNames.concat(activeEvents.map((eventItem) =>
        eventItem.name || (eventItem.type === 'income' ? '臨時収入' : 'イベント支出')));

      // 資産の更新（投資→年利、現金不足は投資から取り崩し）
      invest = invest * (1 + annualReturn) + contribution;
      const totalIncome = myIncome + spouseIncome + pensionIncome;
      const totalExpense = living + housing + education;
      cash += totalIncome - totalExpense + eventTotal + severance - contribution;
      if (cash < 0 && invest > 0) {
        const cover = Math.min(invest, -cash);
        invest -= cover;
        cash += cover;
      }
    }

    rows.push({
      age,
      year: baseYear + yearIndex,
      yearIndex,
      phase,
      myIncome,
      spouseIncome,
      pensionIncome,
      living,
      housing,
      education,
      annualCashflow: myIncome + spouseIncome + pensionIncome - living - housing - education,
      eventTotal: eventTotal + severance,
      eventNames,
      cash,
      invest,
      balance: cash + invest,
    });
  }

  return rows;
}

function readCompare() {
  try {
    return JSON.parse(sessionStorage.getItem(COMPARE_KEY) || 'null');
  } catch (error) {
    return null;
  }
}

function renderResults(root, answers, rows, data) {
  const finalRow = rows[rows.length - 1];
  const minRow = rows.reduce((min, row) => row.balance < min.balance ? row : min, rows[0]);
  const negativeRows = rows.filter((row) => row.balance < 0);
  const firstYearRow = rows.length > 1 ? rows[1] : rows[0];
  const pensionRow = rows.find((row) => row.age > answers.pensionAge) || finalRow;
  const totalYears = answers.endAge - answers.currentAge;
  const realFinalBalance = finalRow.balance / Math.pow(1 + answers.inflationRate / 100, totalYears);
  const hasBridgeGap = answers.pensionAge > answers.retirementAge && answers.bridgeIncomeMan <= 0;
  const educationTotal = rows.reduce((sum, row) => sum + row.education, 0);
  const hasSpouse = !!answers.spouse;
  const hasChildren = (answers.children || []).length > 0;
  const hasHousing = answers.housingType !== 'none';
  const compare = readCompare();

  const headlineTile = negativeRows.length > 0
    ? `<div class="summary-item summary-item--full summary-item--danger">⚠️ ${minRow.age}歳で残高が最低（<strong class="is-worse">${formatMan(minRow.balance)}</strong>）。マイナスは${negativeRows.length}年間あります。</div>`
    : `<div class="summary-item summary-item--full summary-item--ok">✅ 最後まで残高プラス（一番少ないのは${minRow.age}歳の<strong class="is-better">${formatMan(minRow.balance)}</strong>）。</div>`;

  root.innerHTML = `
    <section class="card result-hero">
      <p class="eyebrow">試算結果</p>
      <h1>${answers.endAge}歳時点の見込み</h1>
      <span class="big-number ${finalRow.balance < 0 ? 'big-number--danger' : ''}">${formatMan(finalRow.balance)}</span>
      ${answers.inflationRate > 0 ? `<p class="note">物価上昇率${answers.inflationRate}%を織り込むと、今のお金の感覚で約${formatMan(realFinalBalance)}の価値です。</p>` : ''}
      <p class="note">入力内容をもとにしたざっくり試算です。将来の収入・支出・運用成果を保証するものではありません。</p>
    </section>

    <section class="card">
      <div class="speech">
        <img src="images/characters/dacchooo.png" alt="だっちょ">
        <div class="speech__bubble">${renderSpeech(finalRow, negativeRows, hasBridgeGap, answers, educationTotal)}</div>
      </div>
    </section>

    <section class="card">
      <h2>サマリー</h2>
      <div class="summary-grid">
        ${headlineTile}
        <div class="summary-item"><span>直近の年間収支</span><strong class="${firstYearRow.annualCashflow < 0 ? 'is-worse' : ''}">${formatMan(firstYearRow.annualCashflow)}</strong></div>
        <div class="summary-item"><span>年金期の年間収支</span><strong class="${pensionRow.annualCashflow < 0 ? 'is-worse' : ''}">${formatMan(pensionRow.annualCashflow)}</strong></div>
        ${hasChildren ? `<div class="summary-item"><span>教育費の合計（目安）</span><strong>${formatMan(educationTotal)}</strong></div>` : ''}
      </div>
      <p class="note">年間収支は収入−支出（イベント・退職金をのぞく）。物価上昇・昇給を織り込んでいます。年金期の値は年金開始の翌年時点です。</p>
    </section>

    <section class="card">
      <h2>資産推移グラフ</h2>
      ${renderStackedChart(rows, answers.retirementAge, compare)}
      <div class="legend">
        <span class="legend-item"><i class="legend-swatch legend-swatch--cash"></i>現金・預金</span>
        <span class="legend-item"><i class="legend-swatch legend-swatch--invest"></i>投資資産</span>
        <span class="legend-item"><i class="legend-swatch legend-swatch--negative"></i>不足</span>
        ${compare ? '<span class="legend-item"><i class="legend-swatch legend-swatch--compare"></i>保存したプラン</span>' : ''}
      </div>
      <p class="note">点線（縦）は定年・退職予定年齢です。</p>
    </section>

    <section class="card alert">
      <h2>確認しておきたいこと</h2>
      <p>${renderAdvice(negativeRows, firstYearRow.annualCashflow, hasBridgeGap, answers)}</p>
    </section>

    <section class="card no-print">
      <h2>次にやること</h2>
      <div class="actions">
        <a class="button button--primary" href="app.html">✏️ 条件を変えて再計算する</a>
        <button class="button button--ghost" type="button" id="save-compare">📌 このプランを比較用に保存する</button>
        <button class="button button--ghost" type="button" id="print-report">🖨 レポートとして印刷・PDF保存</button>
      </div>
      <p class="note">保存したあと条件を変えると、グラフに前のプランが重なって表示され、改善効果を比べられます（保存はこのブラウザを閉じるまで）。</p>
    </section>

    <section class="card">
      <h2>毎年の黒字・赤字</h2>
      ${renderCashflowChart(rows)}
      <div class="legend">
        <span class="legend-item"><i class="legend-swatch" style="background:#34d399"></i>黒字（増えた年）</span>
        <span class="legend-item"><i class="legend-swatch" style="background:#f87171"></i>赤字（減った年）</span>
      </div>
      <p class="note">退職金・イベントも含めた、その年の実際の増減です。</p>
    </section>

    ${renderCompareSection(compare, finalRow, minRow, answers)}

    <section class="card">
      <h2>キャッシュフロー表</h2>
      <details class="advanced">
        <summary>年ごとの詳細表を見る（${rows.length}年分）</summary>
        <p class="note">→ 表は横にスワイプできます。左端の年齢は固定表示です。</p>
        <div class="scroll-outer">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>年齢</th>
                  <th>区分</th>
                  <th>イベント</th>
                  <th>本人収入</th>
                  ${hasSpouse ? '<th>配偶者収入</th>' : ''}
                  <th>年金</th>
                  <th>生活費</th>
                  ${hasHousing ? '<th>住居費</th>' : ''}
                  ${hasChildren ? '<th>教育費</th>' : ''}
                  <th>イベント収支</th>
                  <th>年間収支</th>
                  <th>現金・預金</th>
                  <th>投資資産</th>
                  <th>年末残高</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map((row) => renderTableRow(row, hasSpouse, hasHousing, hasChildren)).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </details>
      <p class="note">現金が足りない年は投資資産を取り崩す前提です。イベント収支には退職金を含みます。${hasChildren ? '教育費は文部科学省「子供の学習費調査」・日本政策金融公庫「教育費負担の実態調査」の平均値をもとにした目安です。' : ''}</p>
    </section>

    <section class="card">
      <h2>参考リンク</h2>
      <div class="link-list">
        ${(data.sources || []).map(renderSourceLink).join('')}
      </div>
      <p class="note">参考リンク確認日：${escapeHtml(data.lastVerified || '2026-08-03')}</p>
    </section>

    <footer class="footer">
      <a href="about.html">運営者情報</a>
      <a href="privacy.html">プライバシーポリシー</a>
      <a href="terms.html">利用規約</a>
    </footer>
  `;

  const saveButton = document.getElementById('save-compare');
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      sessionStorage.setItem(COMPARE_KEY, JSON.stringify({
        savedAt: new Date().toISOString(),
        finalBalance: finalRow.balance,
        minBalance: minRow.balance,
        balances: rows.map((row) => ({ age: row.age, balance: Math.round(row.balance) })),
      }));
      saveButton.textContent = '✅ 保存しました';
      saveButton.insertAdjacentHTML('afterend', '<a class="button button--primary" href="app.html">条件を変えて比べる →</a>');
      trackEvent('life_plan_compare_save', { final_balance_man: Math.round(finalRow.balance) });
    });
  }
  const printButton = document.getElementById('print-report');
  if (printButton) {
    printButton.addEventListener('click', () => {
      document.querySelectorAll('details').forEach((d) => { d.open = true; });
      trackEvent('life_plan_print', {});
      window.print();
    });
  }
  const clearButton = document.getElementById('clear-compare');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      sessionStorage.removeItem(COMPARE_KEY);
      window.location.reload();
    });
  }

  trackEvent('life_plan_result_view', {
    current_age: answers.currentAge,
    end_age: answers.endAge,
    final_balance_man: Math.round(finalRow.balance),
    min_balance_man: Math.round(minRow.balance),
    retirement_age: answers.retirementAge,
    pension_age: answers.pensionAge,
    inflation_rate: answers.inflationRate,
    has_spouse: hasSpouse ? 1 : 0,
    child_count: (answers.children || []).length,
    negative_years: negativeRows.length,
  });
}

function renderCompareSection(compare, finalRow, minRow, answers) {
  if (!compare) return '';
  const diff = finalRow.balance - compare.finalBalance;
  const better = diff >= 0;
  return `
    <section class="card">
      <h2>保存したプランとの比較</h2>
      <div class="summary-grid summary-grid--compare">
        <div class="summary-item"><span>保存プランの${answers.endAge}歳時点</span><strong>${formatMan(compare.finalBalance)}</strong></div>
        <div class="summary-item"><span>今回のプラン</span><strong>${formatMan(finalRow.balance)}</strong></div>
        <div class="summary-item"><span>差額</span><strong class="${better ? 'is-better' : 'is-worse'}">${better ? '+' : ''}${formatMan(diff)}</strong></div>
      </div>
      <div class="actions no-print">
        <button class="button button--ghost button--small" type="button" id="clear-compare">保存したプランを消す</button>
      </div>
    </section>
  `;
}

/* ---------- グラフ ---------- */

function niceStep(span) {
  const steps = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000];
  for (const step of steps) {
    if (span / step <= 6) return step;
  }
  return 50000;
}

function renderYGrid(minValue, maxValue, yFor, padX, width) {
  const step = niceStep(Math.max(1, maxValue - minValue));
  const lines = [];
  const start = Math.ceil(minValue / step) * step;
  for (let value = start; value <= maxValue; value += step) {
    if (value === 0) continue;
    const y = yFor(value).toFixed(1);
    lines.push(`<line class="chart-grid chart-grid--soft" x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}"></line>`);
    lines.push(`<text class="chart-label chart-label--grid" x="${padX + 4}" y="${Number(y) - 4}">${formatManShort(value)}</text>`);
  }
  return lines.join('');
}

function renderXAgeLabels(rows, xFor, height) {
  return rows
    .filter((row) => row.age % 10 === 0 && row.yearIndex > 0 && row.yearIndex < rows.length - 1)
    .map((row) => `<text class="chart-label chart-label--x" x="${xFor(row.yearIndex).toFixed(1)}" y="${height - 8}">${row.age}歳</text>`)
    .join('');
}

function renderStackedChart(rows, retirementAge, compare) {
  const width = 820;
  const height = 320;
  const padX = 48;
  const padY = 30;
  const balances = rows.map((row) => row.balance);
  const compareBalances = compare ? compare.balances.map((b) => b.balance) : [];
  const minBalance = Math.min(...balances, ...compareBalances, 0);
  const maxBalance = Math.max(...balances, ...compareBalances, 100);
  const span = Math.max(1, maxBalance - minBalance);
  const plotWidth = width - (padX * 2);
  const plotHeight = height - (padY * 2);
  const xFor = (index) => padX + (rows.length === 1 ? 0 : (index / (rows.length - 1)) * plotWidth);
  const yFor = (value) => padY + ((maxBalance - value) / span) * plotHeight;
  const zeroY = yFor(0);
  const barWidth = Math.max(2, (plotWidth / rows.length) * 0.72);

  const bars = rows.map((row, index) => {
    const x = (xFor(index) - barWidth / 2).toFixed(1);
    if (row.balance < 0) {
      const h = Math.max(1, yFor(row.balance) - zeroY);
      return `<rect class="bar-negative" x="${x}" y="${zeroY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}"></rect>`;
    }
    const cashSafe = Math.max(0, row.cash);
    const investSafe = Math.max(0, row.invest);
    const cashY = yFor(cashSafe);
    const cashH = Math.max(0, zeroY - cashY);
    const investY = yFor(cashSafe + investSafe);
    const investH = Math.max(0, cashY - investY);
    return `
      <rect class="bar-cash" x="${x}" y="${cashY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${cashH.toFixed(1)}"></rect>
      <rect class="bar-invest" x="${x}" y="${investY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${investH.toFixed(1)}"></rect>
    `;
  }).join('');

  const retirementIndex = rows.findIndex((row) => row.age >= retirementAge);
  const retirementX = retirementIndex >= 0 ? xFor(retirementIndex) : null;

  let compareLine = '';
  if (compare) {
    const byAge = new Map(compare.balances.map((b) => [b.age, b.balance]));
    const points = rows
      .filter((row) => byAge.has(row.age))
      .map((row) => `${xFor(row.yearIndex).toFixed(1)},${yFor(byAge.get(row.age)).toFixed(1)}`)
      .join(' ');
    if (points) compareLine = `<polyline class="chart-compare" points="${points}"></polyline>`;
  }

  return `
    <div class="line-chart-wrap" aria-label="資産推移の積み上げグラフ">
      <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img">
        ${renderYGrid(minBalance, maxBalance, yFor, padX, width)}
        <line class="chart-grid chart-grid--zero" x1="${padX}" y1="${zeroY.toFixed(1)}" x2="${width - padX}" y2="${zeroY.toFixed(1)}"></line>
        ${bars}
        ${retirementX !== null ? `<line class="chart-retirement" x1="${retirementX.toFixed(1)}" y1="${padY}" x2="${retirementX.toFixed(1)}" y2="${height - padY}"></line>` : ''}
        ${compareLine}
        ${renderXAgeLabels(rows, xFor, height)}
        <text class="chart-label" x="${padX}" y="20">${formatMan(maxBalance)}</text>
        ${minBalance < 0 ? `<text class="chart-label" x="${padX}" y="${height - 26}">${formatMan(minBalance)}</text>` : ''}
        <text class="chart-label chart-label--end" x="${width - padX}" y="${height - 8}">${rows[rows.length - 1].age}歳</text>
        ${retirementX !== null ? `<text class="chart-label chart-label--retirement" x="${retirementX + 6}" y="${padY + 16}">定年 ${retirementAge}歳</text>` : ''}
      </svg>
    </div>
  `;
}

function renderCashflowChart(rows) {
  const width = 820;
  const height = 240;
  const padX = 48;
  const padY = 24;
  const flows = rows.map((row) => row.annualCashflow + row.eventTotal);
  const minFlow = Math.min(...flows, 0);
  const maxFlow = Math.max(...flows, 50);
  const span = Math.max(1, maxFlow - minFlow);
  const plotWidth = width - (padX * 2);
  const plotHeight = height - (padY * 2);
  const xFor = (index) => padX + (rows.length === 1 ? 0 : (index / (rows.length - 1)) * plotWidth);
  const yFor = (value) => padY + ((maxFlow - value) / span) * plotHeight;
  const zeroY = yFor(0);
  const barWidth = Math.max(2, (plotWidth / rows.length) * 0.72);

  const bars = rows.map((row, index) => {
    if (row.yearIndex === 0) return '';
    const flow = row.annualCashflow + row.eventTotal;
    const x = (xFor(index) - barWidth / 2).toFixed(1);
    if (flow >= 0) {
      const y = yFor(flow);
      return `<rect class="bar-flow-plus" x="${x}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0.5, zeroY - y).toFixed(1)}"></rect>`;
    }
    return `<rect class="bar-flow-minus" x="${x}" y="${zeroY.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0.5, yFor(flow) - zeroY).toFixed(1)}"></rect>`;
  }).join('');

  return `
    <div class="line-chart-wrap" aria-label="毎年の黒字・赤字グラフ">
      <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img">
        ${renderYGrid(minFlow, maxFlow, yFor, padX, width)}
        <line class="chart-grid chart-grid--zero" x1="${padX}" y1="${zeroY.toFixed(1)}" x2="${width - padX}" y2="${zeroY.toFixed(1)}"></line>
        ${bars}
        ${renderXAgeLabels(rows, xFor, height)}
        <text class="chart-label" x="${padX}" y="16">${formatMan(maxFlow)}</text>
        ${minFlow < 0 ? `<text class="chart-label" x="${padX}" y="${height - 24}">${formatMan(minFlow)}</text>` : ''}
        <text class="chart-label chart-label--end" x="${width - padX}" y="${height - 8}">${rows[rows.length - 1].age}歳</text>
      </svg>
    </div>
  `;
}

function renderTableRow(row, hasSpouse, hasHousing, hasChildren) {
  return `
    <tr class="${row.balance < 0 ? 'is-negative' : ''}">
      <td>${row.year}年<br>${row.age}歳</td>
      <td>${escapeHtml(row.phase)}</td>
      <td>${row.eventNames.length > 0 ? escapeHtml(row.eventNames.join(' / ')) : '-'}</td>
      <td>${formatMan(row.myIncome)}</td>
      ${hasSpouse ? `<td>${formatMan(row.spouseIncome)}</td>` : ''}
      <td>${formatMan(row.pensionIncome)}</td>
      <td>${formatMan(row.living)}</td>
      ${hasHousing ? `<td>${formatMan(row.housing)}</td>` : ''}
      ${hasChildren ? `<td>${formatMan(row.education)}</td>` : ''}
      <td>${formatMan(row.eventTotal)}</td>
      <td>${formatMan(row.annualCashflow)}</td>
      <td>${formatMan(row.cash)}</td>
      <td>${formatMan(row.invest)}</td>
      <td>${formatMan(row.balance)}</td>
    </tr>
  `;
}

function renderSourceLink(source) {
  return `
    <a class="link-card" href="${escapeAttr(source.url)}" target="_blank" rel="noopener">
      <span>${escapeHtml(source.name)}</span>
      <span>開く</span>
    </a>
  `;
}

function renderSpeech(finalRow, negativeRows, hasBridgeGap, answers, educationTotal) {
  if (negativeRows.length > 0) {
    const first = negativeRows[0];
    return `${first.age}歳ごろから残高がマイナスになる試算です。まずはイベント支出と毎月の固定費を少し見直すと、改善ポイントが見つかりやすいです。`;
  }
  if (hasBridgeGap) {
    return `${answers.retirementAge}歳の定年から${answers.pensionAge}歳の年金開始まで、収入ゼロで貯金を取り崩す期間があります。最後までプラスの試算ですが、この期間の過ごし方（再雇用・パートなど）も考えておくと安心です。`;
  }
  if ((answers.children || []).length > 0 && educationTotal > 0) {
    return `最後までプラスで推移する試算です。教育費は合計およそ${formatMan(educationTotal)}を見込んでいます。進路パターンを変えると数百万円単位で変わるので、いくつか試してみてください。`;
  }
  if (finalRow.balance < 300) {
    return '最後までプラスですが、余裕はやや薄めの試算です。生活防衛資金を残せるか、イベント支出が重なる年を見ておきましょう。';
  }
  return 'この条件だと、最後までプラスで推移する試算です。物価上昇率やイベント支出を少し多めにしても大丈夫か、試しておくと安心です。';
}

function renderAdvice(negativeRows, annualSurplus, hasBridgeGap, answers) {
  if (negativeRows.length > 0) {
    return 'この表は「どこで苦しくなりそうか」を見つけるためのものです。収入アップ、固定費の見直し、イベント時期の調整、公的制度の確認など、できる順に整理していきましょう。プランを比較用に保存してから条件を変えると、改善効果がグラフで見えます。';
  }
  if (hasBridgeGap) {
    return `定年（${answers.retirementAge}歳）から年金開始（${answers.pensionAge}歳）までの空白期間は、再雇用・パート収入を「定年後〜年金までの月収」に入れると、より現実に近い表になります。`;
  }
  if (annualSurplus < 0) {
    return '年間収支はマイナスですが、今ある資産で補えている試算です。毎年の赤字が続く前提なので、早めに固定費や大きな支出を見直すと安心です。';
  }
  return '大きな不足は出ていません。次は教育費の進路パターン、住宅、老後、車など、金額がブレやすい項目を少し多めに見積もって試してみましょう。';
}

function formatMan(value) {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded).toLocaleString('ja-JP')}万円`;
}

function formatManShort(value) {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 10000) return `${(rounded / 10000).toLocaleString('ja-JP')}億円`;
  return `${rounded.toLocaleString('ja-JP')}万`;
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a.link-card');
  if (!link) return;
  trackEvent('life_plan_source_click', { url: link.getAttribute('href') || '' });
});

document.addEventListener('DOMContentLoaded', initResultPage);
