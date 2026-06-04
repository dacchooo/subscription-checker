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
    return JSON.parse(raw);
  } catch (error) {
    sessionStorage.removeItem(ANSWER_KEY);
    return null;
  }
}

function buildPlanRows(answers) {
  const rows = [];
  let balance = answers.currentAssetsMan;
  const annualReturn = answers.returnRate / 100;

  for (let age = answers.currentAge; age <= answers.endAge; age += 1) {
    const yearIndex = age - answers.currentAge;
    const phase = age < answers.retirementAge ? '現役期' : '定年後';
    const annualBaseCashflow = calcAnnualCashflow(answers, age);
    const eventTotal = calcEventTotal(answers.events || [], age);
    const eventNames = (answers.events || [])
      .filter((eventItem) => eventItem.age === age && eventItem.amountMan > 0)
      .map((eventItem) => eventItem.name || (eventItem.type === 'income' ? '臨時収入' : 'イベント支出'));

    if (yearIndex > 0) {
      balance = balance * (1 + annualReturn) + annualBaseCashflow + eventTotal;
    }

    rows.push({
      age,
      yearIndex,
      phase,
      annualCashflow: annualBaseCashflow,
      eventTotal,
      eventNames,
      balance,
    });
  }

  return rows;
}

function calcAnnualCashflow(answers, age) {
  if (age < answers.retirementAge) {
    return ((answers.monthlyIncomeMan - answers.monthlyExpenseMan) * 12) + answers.annualIncomeMan - answers.annualExpenseMan;
  }

  return ((answers.retiredIncomeMan - answers.retiredExpenseMan) * 12) - (answers.retiredAnnualExpenseMan || 0);
}

function calcEventTotal(events, age) {
  return events
    .filter((eventItem) => eventItem.age === age && eventItem.amountMan > 0)
    .reduce((sum, eventItem) => {
      const sign = eventItem.type === 'income' ? 1 : -1;
      return sum + (sign * eventItem.amountMan);
    }, 0);
}

function renderResults(root, answers, rows, data) {
  const finalRow = rows[rows.length - 1];
  const minRow = rows.reduce((min, row) => row.balance < min.balance ? row : min, rows[0]);
  const negativeRows = rows.filter((row) => row.balance < 0);
  const annualSurplus = calcAnnualCashflow(answers, Math.min(answers.currentAge, answers.retirementAge - 1));
  const retiredAnnualSurplus = calcAnnualCashflow(answers, answers.retirementAge);
  const sampledRows = sampleRows(rows);

  root.innerHTML = `
    <section class="card result-hero">
      <p class="eyebrow">試算結果</p>
      <h1>${answers.endAge}歳時点の見込み</h1>
      <span class="big-number ${finalRow.balance < 0 ? 'big-number--danger' : ''}">${formatMan(finalRow.balance)}</span>
      <p class="note">入力内容をもとにしたざっくり試算です。将来の収入・支出・運用成果を保証するものではありません。</p>
    </section>

    <section class="card">
      <div class="speech">
        <img src="images/characters/dacchooo.png" alt="だっちょ">
        <div class="speech__bubble">${renderSpeech(finalRow, negativeRows)}</div>
      </div>
    </section>

    <section class="card">
      <h2>サマリー</h2>
      <div class="summary-grid">
        <div class="summary-item"><span>年間収支</span><strong>${formatMan(annualSurplus)}</strong></div>
        <div class="summary-item"><span>定年後の年間収支</span><strong>${formatMan(retiredAnnualSurplus)}</strong></div>
        <div class="summary-item"><span>一番少ない年齢</span><strong>${minRow.age}歳</strong></div>
        <div class="summary-item"><span>最低残高</span><strong>${formatMan(minRow.balance)}</strong></div>
        <div class="summary-item"><span>不足年数</span><strong>${negativeRows.length}年</strong></div>
      </div>
    </section>

    <section class="card">
      <h2>折れ線グラフ</h2>
      ${renderLineChart(rows, answers.retirementAge)}
      <p class="note">点線は定年・退職予定年齢です。残高がマイナスの区間は赤で表示します。</p>
    </section>

    <section class="card">
      <h2>資産推移の目安</h2>
      <div class="chart">
        ${sampledRows.map((row) => renderBar(row, rows)).join('')}
      </div>
    </section>

    <section class="card">
      <h2>ライフプラン表</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>年齢</th>
              <th>区分</th>
              <th>イベント</th>
              <th>年間収支</th>
              <th>イベント収支</th>
              <th>年末残高</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(renderTableRow).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card alert">
      <h2>確認しておきたいこと</h2>
      <p>${renderAdvice(negativeRows, annualSurplus)}</p>
    </section>

    <section class="card">
      <h2>参考リンク</h2>
      <div class="link-list">
        ${(data.sources || []).map(renderSourceLink).join('')}
      </div>
      <p class="note">参考リンク確認日：${escapeHtml(data.lastVerified || '2026-06-04')}</p>
    </section>

    <section class="card">
      <h2>条件を変えてみる</h2>
      <p class="note">イベント金額、毎月の支出、見る年齢を少し変えるだけでも結果は大きく変わります。まずは現実に近い数字へ調整してみてください。</p>
      <div class="actions">
        <a class="button button--ghost" href="app.html">入力に戻る</a>
      </div>
    </section>

    <footer class="footer">
      <a href="about.html">運営者情報</a>
      <a href="privacy.html">プライバシーポリシー</a>
      <a href="terms.html">利用規約</a>
    </footer>
  `;

  trackEvent('life_plan_result_view', {
    current_age: answers.currentAge,
    end_age: answers.endAge,
    final_balance_man: Math.round(finalRow.balance),
    min_balance_man: Math.round(minRow.balance),
    retirement_age: answers.retirementAge,
    negative_years: negativeRows.length,
  });
}

function renderLineChart(rows, retirementAge) {
  const width = 820;
  const height = 260;
  const padX = 48;
  const padY = 28;
  const balances = rows.map((row) => row.balance);
  const minBalance = Math.min(...balances, 0);
  const maxBalance = Math.max(...balances, 100);
  const span = Math.max(1, maxBalance - minBalance);
  const plotWidth = width - (padX * 2);
  const plotHeight = height - (padY * 2);
  const xFor = (index) => padX + (rows.length === 1 ? 0 : (index / (rows.length - 1)) * plotWidth);
  const yFor = (value) => padY + ((maxBalance - value) / span) * plotHeight;
  const points = rows.map((row, index) => `${xFor(index).toFixed(1)},${yFor(row.balance).toFixed(1)}`).join(' ');
  const zeroY = yFor(0);
  const retirementIndex = rows.findIndex((row) => row.age >= retirementAge);
  const retirementX = retirementIndex >= 0 ? xFor(retirementIndex) : null;
  const negativeAreas = rows
    .filter((row) => row.balance < 0)
    .map((row, index, negativeRows) => renderNegativePoint(row, rows, xFor, yFor, index === 0 || negativeRows[index - 1].age !== row.age - 1))
    .join('');

  return `
    <div class="line-chart-wrap" aria-label="資産推移の折れ線グラフ">
      <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img">
        <line class="chart-grid" x1="${padX}" y1="${padY}" x2="${padX}" y2="${height - padY}"></line>
        <line class="chart-grid" x1="${padX}" y1="${zeroY.toFixed(1)}" x2="${width - padX}" y2="${zeroY.toFixed(1)}"></line>
        ${retirementX !== null ? `<line class="chart-retirement" x1="${retirementX.toFixed(1)}" y1="${padY}" x2="${retirementX.toFixed(1)}" y2="${height - padY}"></line>` : ''}
        <polyline class="chart-line" points="${points}"></polyline>
        ${negativeAreas}
        <text class="chart-label" x="${padX}" y="18">${formatMan(maxBalance)}</text>
        <text class="chart-label" x="${padX}" y="${height - 8}">${formatMan(minBalance)}</text>
        <text class="chart-label chart-label--end" x="${width - padX}" y="${height - 8}">${rows[rows.length - 1].age}歳</text>
        ${retirementX !== null ? `<text class="chart-label chart-label--retirement" x="${retirementX + 6}" y="${padY + 14}">定年 ${retirementAge}歳</text>` : ''}
      </svg>
    </div>
  `;
}

function renderNegativePoint(row, rows, xFor, yFor) {
  const index = rows.findIndex((item) => item.age === row.age);
  return `<circle class="chart-point-negative" cx="${xFor(index).toFixed(1)}" cy="${yFor(row.balance).toFixed(1)}" r="3"></circle>`;
}

function sampleRows(rows) {
  const sampled = rows.filter((row) => row.yearIndex === 0 || row.yearIndex % 5 === 0 || row.age === rows[rows.length - 1].age);
  return [...new Map(sampled.map((row) => [row.age, row])).values()];
}

function renderBar(row, rows) {
  const maxAbs = Math.max(...rows.map((item) => Math.abs(item.balance)), 1);
  const width = Math.max(2, Math.round((Math.abs(row.balance) / maxAbs) * 100));
  return `
    <div class="bar-row">
      <span>${row.age}歳</span>
      <div class="bar"><span class="${row.balance < 0 ? 'is-negative' : ''}" style="width:${width}%"></span></div>
      <strong>${formatMan(row.balance)}</strong>
    </div>
  `;
}

function renderTableRow(row) {
  return `
    <tr class="${row.balance < 0 ? 'is-negative' : ''}">
      <td>${row.age}歳</td>
      <td>${escapeHtml(row.phase)}</td>
      <td>${row.eventNames.length > 0 ? escapeHtml(row.eventNames.join(' / ')) : '-'}</td>
      <td>${formatMan(row.annualCashflow)}</td>
      <td>${formatMan(row.eventTotal)}</td>
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

function renderSpeech(finalRow, negativeRows) {
  if (negativeRows.length > 0) {
    const first = negativeRows[0];
    return `${first.age}歳ごろから残高がマイナスになる試算です。まずはイベント支出と毎月の固定費を少し見直すと、改善ポイントが見つかりやすいです。`;
  }
  if (finalRow.balance < 300) {
    return '最後までプラスですが、余裕はやや薄めの試算です。生活防衛資金を残せるか、イベント支出が重なる年を見ておきましょう。';
  }
  return 'この条件だと、最後までプラスで推移する試算です。イベント支出が増えた場合も試しておくと安心です。';
}

function renderAdvice(negativeRows, annualSurplus) {
  if (negativeRows.length > 0) {
    return 'この表は「どこで苦しくなりそうか」を見つけるためのものです。収入アップ、固定費の見直し、イベント時期の調整、公的制度の確認など、できる順に整理していきましょう。';
  }
  if (annualSurplus < 0) {
    return '年間収支はマイナスですが、今ある資産で補えている試算です。毎年の赤字が続く前提なので、早めに固定費や大きな支出を見直すと安心です。';
  }
  return '大きな不足は出ていません。次は教育費、住宅、老後、車など、金額がブレやすいイベントを少し多めに見積もって試してみましょう。';
}

function formatMan(value) {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded).toLocaleString('ja-JP')}万円`;
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a.link-card');
  if (!link) return;
  trackEvent('life_plan_source_click', { url: link.getAttribute('href') || '' });
});

document.addEventListener('DOMContentLoaded', initResultPage);
