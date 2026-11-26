import { formatTime, shuffle } from './data.js';
import { renderMiniLeaderboard } from './leaderboard.js';

const PAIR_COUNT = 6;
const PENALTY_MS = 1000;

export function createMatchView(container, { getItems, onGameFinish }) {
  let tiles = [];
  let selectedIdx = null;
  let matchedCount = 0;
  let penaltyMs = 0;
  let startTs = null;
  let timerId = null;
  let locked = false;

  container.innerHTML = `
    <div class="bar">
      <div class="bar-right">
        <span class="timer" id="match-timer">0.00s</span>
        <span class="penalty-flash" id="match-penalty">+1s</span>
      </div>
      <button type="button" class="btn" id="match-restart" hidden>Relancer</button>
    </div>
    <div class="match-grid" id="match-grid"></div>
  `;

  const gridEl = container.querySelector('#match-grid');
  const timerEl = container.querySelector('#match-timer');
  const penaltyEl = container.querySelector('#match-penalty');
  const restartBtn = container.querySelector('#match-restart');

  function stopTimer() {
    if (timerId) {
      cancelAnimationFrame(timerId);
      timerId = null;
    }
  }

  function currentElapsedMs() {
    if (startTs === null) return penaltyMs;
    return performance.now() - startTs + penaltyMs;
  }

  function tick() {
    timerEl.textContent = formatTime(currentElapsedMs());
    timerId = requestAnimationFrame(tick);
  }

  function showReady() {
    stopTimer();
    selectedIdx = null;
    matchedCount = 0;
    penaltyMs = 0;
    startTs = null;
    locked = false;
    timerEl.textContent = '0.00s';
    penaltyEl.classList.remove('is-visible');
    restartBtn.hidden = true;

    gridEl.className = '';
    gridEl.innerHTML = `
      <div class="result-card">
        <button type="button" class="btn btn-primary" id="match-launch">Lancer</button>
      </div>
    `;
    gridEl.querySelector('#match-launch').addEventListener('click', startNewGame);
  }

  function startNewGame() {
    stopTimer();
    selectedIdx = null;
    matchedCount = 0;
    penaltyMs = 0;
    locked = false;
    timerEl.textContent = '0.00s';
    penaltyEl.classList.remove('is-visible');
    restartBtn.hidden = false;

    const pool = getItems().filter((x) => x.photo && x.buque);
    const chosen = shuffle(pool).slice(0, PAIR_COUNT);

    const rawTiles = [];
    chosen.forEach((item) => {
      rawTiles.push({ id: item.id, kind: 'photo', item, matched: false });
      rawTiles.push({ id: item.id, kind: 'text', item, matched: false });
    });
    tiles = shuffle(rawTiles);

    gridEl.className = 'match-grid';
    gridEl.innerHTML = tiles
      .map((t, idx) => {
        if (t.kind === 'photo') {
          return `<button type="button" class="match-tile match-tile--photo" data-idx="${idx}"><img src="./${escapeHtml(t.item.photo)}" alt=""></button>`;
        }
        const famss = t.item.famss ? `<span class="match-tile-famss">${escapeHtml(t.item.famss)}</span>` : '';
        return `<button type="button" class="match-tile" data-idx="${idx}"><span class="match-tile-buque">${escapeHtml(t.item.buque)}</span>${famss}</button>`;
      })
      .join('');

    gridEl.querySelectorAll('.match-tile').forEach((btn) => {
      btn.addEventListener('click', () => onTileClick(Number(btn.dataset.idx)));
    });

    startTs = performance.now();
    timerId = requestAnimationFrame(tick);
  }

  function onTileClick(idx) {
    if (locked) return;
    const tile = tiles[idx];
    if (!tile || tile.matched) return;

    const btn = gridEl.querySelector(`[data-idx="${idx}"]`);

    if (selectedIdx === null) {
      selectedIdx = idx;
      btn.classList.add('is-selected');
      return;
    }

    if (selectedIdx === idx) {
      selectedIdx = null;
      btn.classList.remove('is-selected');
      return;
    }

    const first = tiles[selectedIdx];
    const firstBtn = gridEl.querySelector(`[data-idx="${selectedIdx}"]`);

    // Clicking another tile of the same type just moves selection without penalty
    if (first.kind === tile.kind) {
      firstBtn.classList.remove('is-selected');
      selectedIdx = idx;
      btn.classList.add('is-selected');
      return;
    }

    if (first.id === tile.id) {
      first.matched = true;
      tile.matched = true;
      firstBtn.classList.remove('is-selected');
      firstBtn.classList.add('is-ok');
      btn.classList.add('is-ok');
      selectedIdx = null;
      matchedCount += 1;

      setTimeout(() => {
        firstBtn.classList.add('is-matched');
        btn.classList.add('is-matched');
      }, 160);

      if (matchedCount === PAIR_COUNT) {
        const finalMs = Math.round(currentElapsedMs());
        stopTimer();
        timerEl.textContent = formatTime(finalMs);
        setTimeout(() => finishGame(finalMs), 220);
      }
    } else {
      locked = true;
      penaltyMs += PENALTY_MS;
      firstBtn.classList.remove('is-selected');
      firstBtn.classList.add('is-bad');
      btn.classList.add('is-bad');
      penaltyEl.classList.add('is-visible');
      selectedIdx = null;

      setTimeout(() => {
        firstBtn.classList.remove('is-bad');
        btn.classList.remove('is-bad');
        penaltyEl.classList.remove('is-visible');
        locked = false;
      }, 360);
    }
  }

  async function finishGame(finalMs) {
    restartBtn.hidden = true;
    gridEl.className = '';
    gridEl.innerHTML = `
      <div class="result-card">
        <div class="result-score">${formatTime(finalMs)}</div>
        <div class="result-badge" id="match-badge" hidden>Record !</div>
        <div class="result-standing" id="match-standing" hidden></div>
        <button type="button" class="btn btn-primary" id="match-again">Relancer</button>
      </div>
    `;
    gridEl.querySelector('#match-again').addEventListener('click', startNewGame);

    const res = await onGameFinish('match', { timeMs: finalMs });
    if (res && res.isNewBest) {
      const badge = gridEl.querySelector('#match-badge');
      if (badge) badge.hidden = false;
    }
    if (res && res.standing) {
      const standingEl = gridEl.querySelector('#match-standing');
      const html = renderMiniLeaderboard(res.standing, 'match');
      if (standingEl && html) {
        standingEl.innerHTML = html;
        standingEl.hidden = false;
      }
    }
  }

  restartBtn.addEventListener('click', startNewGame);

  return {
    start() {
      showReady();
    },
    stop() {
      stopTimer();
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
