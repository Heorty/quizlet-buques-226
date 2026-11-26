import { formatTime } from './data.js';
import { getLeaderboard } from './firebase.js';

export function createLeaderboardView(container, { getUser }) {
  let mode = 'match';

  container.innerHTML = `
    <div class="bar">
      <div class="segmented" role="group" aria-label="Classement">
        <button type="button" class="seg-btn is-active" data-lb="match">Match</button>
        <button type="button" class="seg-btn" data-lb="quiz">Quiz</button>
      </div>
      <button type="button" class="icon-btn" id="lb-refresh" title="Actualiser" aria-label="Actualiser">↻</button>
    </div>
    <div class="lb-card" id="lb-body"></div>
  `;

  const bodyEl = container.querySelector('#lb-body');
  const modeBtns = container.querySelectorAll('[data-lb]');

  async function render() {
    bodyEl.innerHTML = `<div class="empty-box" style="border:none;max-width:none;">Chargement...</div>`;
    let rows = [];
    try {
      rows = await getLeaderboard(mode);
    } catch (err) {
      bodyEl.innerHTML = `<div class="empty-box" style="border:none;max-width:none;">Erreur de chargement.</div>`;
      return;
    }

    if (rows.length === 0) {
      bodyEl.innerHTML = `<div class="empty-box" style="border:none;max-width:none;">Aucun score enregistré.</div>`;
      return;
    }

    const me = getUser();
    const scoreHeader = mode === 'quiz' ? 'Score' : 'Temps';

    bodyEl.innerHTML = `
      <table class="lb-table">
        <thead>
          <tr>
            <th class="lb-rank">#</th>
            <th>Buque</th>
            <th>Fam'ss</th>
            <th class="lb-score-cell">${scoreHeader}</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r, i) => {
              const isMe = me && me.key === r.key;
              const rankClass = i < 3 ? 'lb-rank lb-rank-top' : 'lb-rank';
              const val =
                mode === 'quiz'
                  ? `${r.score}/${r.total || 10} · ${formatTime(r.timeMs)}`
                  : formatTime(r.timeMs);
              return `
                <tr class="${isMe ? 'is-me' : ''}">
                  <td class="${rankClass}">${i + 1}</td>
                  <td>${escapeHtml(r.buque)}</td>
                  <td>${escapeHtml(r.famss)}</td>
                  <td class="lb-score-cell">${val}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;
  }

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.lb;
      modeBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
      render();
    });
  });

  container.querySelector('#lb-refresh').addEventListener('click', render);

  return {
    refresh: render,
    setMode(nextMode) {
      mode = nextMode;
      modeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.lb === mode));
      render();
    },
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
