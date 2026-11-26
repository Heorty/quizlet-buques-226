import { shuffle } from './data.js';

const SWIPE_THRESHOLD_PX = 80;
const SWIPE_ANIM_MS = 220;

export function createFlashcardsView(container, { getItems, getMastered, setMastered, isActive }) {
  let filter = 'all'; // 'all' | 'review' | 'mastered'
  let phase = 'overview'; // 'overview' | 'study' | 'summary'
  let deck = [];
  let index = 0;
  let flipped = false;
  let animating = false;
  let suppressClick = false;
  let sessionResults = new Map();

  container.innerHTML = `
    <div class="bar">
      <div class="segmented" role="group" aria-label="Filtre">
        <button type="button" class="seg-btn is-active" data-filter="all">Tous</button>
        <button type="button" class="seg-btn" data-filter="review">À revoir</button>
        <button type="button" class="seg-btn" data-filter="mastered">Acquis</button>
      </div>
      <div class="bar-right" id="fc-bar-right" hidden>
        <button type="button" class="icon-btn" id="fc-shuffle" title="Mélanger" aria-label="Mélanger">⇄</button>
        <span class="counter" id="fc-counter">0 / 0</span>
      </div>
    </div>
    <div class="progress-track fc-session-bar" id="fc-session-bar" hidden>
      <div class="progress-fill" id="fc-session-fill"></div>
    </div>
    <div class="fc-stage" id="fc-stage"></div>
    <div class="fc-actions" id="fc-actions" hidden>
      <button type="button" class="btn" id="fc-prev" aria-label="Précédent">←</button>
      <button type="button" class="btn btn-warn" id="fc-review" title="À revoir (←)">À revoir</button>
      <button type="button" class="btn btn-success" id="fc-master" title="Acquis (→)">Acquis</button>
      <button type="button" class="btn" id="fc-next" aria-label="Suivant">→</button>
    </div>
  `;

  const stage = container.querySelector('#fc-stage');
  const actions = container.querySelector('#fc-actions');
  const barRight = container.querySelector('#fc-bar-right');
  const sessionBar = container.querySelector('#fc-session-bar');
  const sessionFill = container.querySelector('#fc-session-fill');
  const counterEl = container.querySelector('#fc-counter');
  const filterBtns = container.querySelectorAll('[data-filter]');

  function getGlobalStats() {
    const all = getItems().filter((x) => x.photo && (x.buque || x.famss));
    const mastered = getMastered();
    const total = all.length;
    const masteredCount = all.filter((x) => mastered.has(x.id)).length;
    const reviewCount = total - masteredCount;
    const pct = total ? Math.round((masteredCount / total) * 100) : 0;

    let filtered = all;
    if (filter === 'review') filtered = all.filter((x) => !mastered.has(x.id));
    if (filter === 'mastered') filtered = all.filter((x) => mastered.has(x.id));

    return { all, filtered, total, masteredCount, reviewCount, pct };
  }

  function startSession(list, doShuffle) {
    if (!list.length) {
      phase = 'overview';
      render();
      return;
    }
    deck = doShuffle ? shuffle(list) : list.slice();
    index = 0;
    flipped = false;
    animating = false;
    sessionResults = new Map();
    phase = 'study';
    render();
  }

  function resetAllProgress() {
    setMastered(new Set());
    phase = 'overview';
    render();
  }

  function render() {
    if (phase === 'overview') {
      renderOverview();
    } else if (phase === 'summary') {
      renderSummary();
    } else {
      renderStudy(false);
    }
  }

  function renderOverview() {
    barRight.hidden = true;
    sessionBar.hidden = true;
    actions.hidden = true;

    const { filtered, total, masteredCount, reviewCount, pct } = getGlobalStats();

    let actionsHtml = '';
    if (filtered.length > 0) {
      actionsHtml = `
        <button type="button" class="btn btn-primary" id="fc-start">Commencer (${filtered.length})</button>
        <button type="button" class="btn" id="fc-start-shuffle">Mélanger</button>
      `;
    } else {
      const resetBtn =
        filter === 'review' && masteredCount > 0
          ? `<button type="button" class="btn" id="fc-reset-all">Réinitialiser</button>`
          : '';
      actionsHtml = `
        <div class="fc-empty-msg">Aucune carte dans cette sélection.</div>
        ${resetBtn}
      `;
    }

    stage.innerHTML = `
      <div class="fc-panel">
        <div class="fc-pct">${pct}%</div>
        <div class="progress-track">
          <div class="progress-fill${pct === 100 ? ' is-complete' : ''}" style="width: ${pct}%"></div>
        </div>
        <div class="fc-stats">
          <div class="fc-stat is-success">
            <div class="fc-stat-val">${masteredCount}</div>
            <div class="fc-stat-label">Acquis</div>
          </div>
          <div class="fc-stat is-warn">
            <div class="fc-stat-val">${reviewCount}</div>
            <div class="fc-stat-label">À revoir</div>
          </div>
          <div class="fc-stat">
            <div class="fc-stat-val">${total}</div>
            <div class="fc-stat-label">Total</div>
          </div>
        </div>
        <div class="fc-panel-actions">
          ${actionsHtml}
        </div>
      </div>
    `;

    const startBtn = stage.querySelector('#fc-start');
    if (startBtn) startBtn.addEventListener('click', () => startSession(filtered, false));
    const shuffleStartBtn = stage.querySelector('#fc-start-shuffle');
    if (shuffleStartBtn) shuffleStartBtn.addEventListener('click', () => startSession(filtered, true));
    const resetBtn = stage.querySelector('#fc-reset-all');
    if (resetBtn) resetBtn.addEventListener('click', resetAllProgress);
  }

  function renderStudy(animateEnter = false) {
    if (deck.length === 0) {
      phase = 'overview';
      renderOverview();
      return;
    }

    barRight.hidden = false;
    sessionBar.hidden = false;
    actions.hidden = false;

    const item = deck[index];
    counterEl.textContent = `${index + 1} / ${deck.length}`;
    const sessionPct = Math.round(((index + 1) / deck.length) * 100);
    sessionFill.style.width = `${sessionPct}%`;

    const famssHtml = item.famss ? `<div class="fc-famss">${escapeHtml(item.famss)}</div>` : '';
    const buqueText = item.buque || '—';

    stage.innerHTML = `
      <div class="fc-swipe${animateEnter ? ' is-enter' : ''}" id="fc-swipe">
        <div class="fc-swipe-stamp is-master">Acquis</div>
        <div class="fc-swipe-stamp is-review">À revoir</div>
        <div class="fc-card${flipped ? ' is-flipped' : ''}" id="fc-card" tabindex="0">
          <div class="fc-face fc-front">
            <img src="./${escapeHtml(item.photo)}" alt="" loading="eager" draggable="false">
          </div>
          <div class="fc-face fc-back">
            <div class="fc-buque">${escapeHtml(buqueText)}</div>
            ${famssHtml}
            <div class="fc-nom">${escapeHtml(item.nom)}</div>
          </div>
        </div>
      </div>
    `;

    const swipeEl = stage.querySelector('#fc-swipe');
    const cardEl = stage.querySelector('#fc-card');
    const masterStamp = swipeEl.querySelector('.fc-swipe-stamp.is-master');
    const reviewStamp = swipeEl.querySelector('.fc-swipe-stamp.is-review');

    cardEl.addEventListener('click', () => {
      if (suppressClick || animating) return;
      toggleFlip();
    });

    attachSwipeGesture(swipeEl, masterStamp, reviewStamp);

    if (index + 1 < deck.length) {
      const nextItem = deck[index + 1];
      if (nextItem && nextItem.photo) {
        const preload = new Image();
        preload.src = `./${nextItem.photo}`;
      }
    }
  }

  function attachSwipeGesture(swipeEl, masterStamp, reviewStamp) {
    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let isHorizontal = false;

    swipeEl.addEventListener('pointerdown', (e) => {
      if (animating || e.button !== 0) return;
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      isHorizontal = false;
    });

    swipeEl.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activePointerId || animating) return;
      const curDx = e.clientX - startX;
      const curDy = e.clientY - startY;

      if (!isHorizontal) {
        if (Math.abs(curDx) > 10 && Math.abs(curDx) > Math.abs(curDy)) {
          isHorizontal = true;
          swipeEl.classList.add('is-dragging');
          try {
            swipeEl.setPointerCapture(e.pointerId);
          } catch {
            // ignore if pointer capture is unsupported
          }
        } else {
          return;
        }
      }

      dx = curDx;
      swipeEl.style.transform = `translate3d(${dx}px, ${Math.abs(dx) * 0.05}px, 0) rotate(${dx * 0.045}deg)`;
      const progress = Math.min(1, Math.abs(dx) / 90);
      masterStamp.style.opacity = dx > 0 ? String(progress) : '0';
      reviewStamp.style.opacity = dx < 0 ? String(progress) : '0';
    });

    function endDrag(e) {
      if (e.pointerId !== activePointerId) return;
      activePointerId = null;
      swipeEl.classList.remove('is-dragging');

      if (!isHorizontal) return;
      isHorizontal = false;

      suppressClick = true;
      setTimeout(() => {
        suppressClick = false;
      }, 50);

      if (e.type === 'pointerup' && Math.abs(dx) >= SWIPE_THRESHOLD_PX) {
        markCurrent(dx > 0);
      } else {
        swipeEl.style.transform = '';
        masterStamp.style.opacity = '';
        reviewStamp.style.opacity = '';
      }
    }

    swipeEl.addEventListener('pointerup', endDrag);
    swipeEl.addEventListener('pointercancel', endDrag);
  }

  function renderSummary() {
    barRight.hidden = true;
    sessionBar.hidden = true;
    actions.hidden = true;

    const { filtered, total, masteredCount, reviewCount, pct } = getGlobalStats();
    let sessionOk = 0;
    let sessionReview = 0;
    sessionResults.forEach((ok) => {
      if (ok) sessionOk += 1;
      else sessionReview += 1;
    });
    const missedCards = deck.filter((x) => sessionResults.get(x.id) === false);

    const missedBtn =
      missedCards.length > 0
        ? `<button type="button" class="btn btn-primary" id="fc-retry-missed">Revoir les ${missedCards.length} à revoir</button>`
        : '';
    const restartClass = missedCards.length === 0 ? 'btn btn-primary' : 'btn';
    const resetBtn =
      reviewCount === 0 && masteredCount > 0
        ? `<button type="button" class="btn btn-ghost" id="fc-reset-all">Réinitialiser</button>`
        : '';

    stage.innerHTML = `
      <div class="fc-panel">
        <div class="fc-pct">${pct}%</div>
        <div class="progress-track">
          <div class="progress-fill${pct === 100 ? ' is-complete' : ''}" style="width: ${pct}%"></div>
        </div>
        <div class="fc-stats">
          <div class="fc-stat is-success">
            <div class="fc-stat-val">${sessionOk}</div>
            <div class="fc-stat-label">Acquis</div>
          </div>
          <div class="fc-stat is-warn">
            <div class="fc-stat-val">${sessionReview}</div>
            <div class="fc-stat-label">À revoir</div>
          </div>
          <div class="fc-stat">
            <div class="fc-stat-val">${masteredCount}/${total}</div>
            <div class="fc-stat-label">Complétion</div>
          </div>
        </div>
        <div class="fc-panel-actions">
          ${missedBtn}
          <button type="button" class="${restartClass}" id="fc-restart">Recommencer</button>
          <button type="button" class="btn" id="fc-restart-shuffle">Mélanger</button>
          ${resetBtn}
        </div>
      </div>
    `;

    const missedEl = stage.querySelector('#fc-retry-missed');
    if (missedEl) missedEl.addEventListener('click', () => startSession(missedCards, true));
    stage.querySelector('#fc-restart').addEventListener('click', () => startSession(filtered, false));
    stage.querySelector('#fc-restart-shuffle').addEventListener('click', () => startSession(filtered, true));
    const resetEl = stage.querySelector('#fc-reset-all');
    if (resetEl) resetEl.addEventListener('click', resetAllProgress);
  }

  function toggleFlip() {
    if (phase !== 'study' || deck.length === 0 || animating) return;
    flipped = !flipped;
    const cardEl = stage.querySelector('#fc-card');
    if (cardEl) cardEl.classList.toggle('is-flipped', flipped);
  }

  function step(delta) {
    if (phase !== 'study' || deck.length === 0 || animating) return;
    if (delta < 0) {
      index = Math.max(0, index + delta);
      flipped = false;
      renderStudy(false);
      return;
    }
    if (index + 1 >= deck.length) {
      phase = 'summary';
      renderSummary();
      return;
    }
    index += 1;
    flipped = false;
    renderStudy(false);
  }

  function markCurrent(isMastered) {
    if (phase !== 'study' || deck.length === 0 || animating) return;
    animating = true;

    const item = deck[index];
    const swipeEl = stage.querySelector('#fc-swipe');
    if (swipeEl) {
      swipeEl.classList.remove('is-enter', 'is-dragging');
      swipeEl.style.transform = '';
      swipeEl.classList.add(isMastered ? 'is-swiping-right' : 'is-swiping-left');
    }

    setTimeout(() => {
      const mastered = new Set(getMastered());
      if (isMastered) {
        mastered.add(item.id);
      } else {
        mastered.delete(item.id);
      }
      setMastered(mastered);
      sessionResults.set(item.id, isMastered);
      animating = false;

      if (index + 1 >= deck.length) {
        phase = 'summary';
        renderSummary();
        return;
      }
      index += 1;
      flipped = false;
      renderStudy(true);
    }, SWIPE_ANIM_MS);
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      filterBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
      animating = false;
      phase = 'overview';
      renderOverview();
    });
  });

  container.querySelector('#fc-shuffle').addEventListener('click', () => startSession(deck, true));
  container.querySelector('#fc-prev').addEventListener('click', () => step(-1));
  container.querySelector('#fc-next').addEventListener('click', () => step(1));
  container.querySelector('#fc-review').addEventListener('click', () => markCurrent(false));
  container.querySelector('#fc-master').addEventListener('click', () => markCurrent(true));

  document.addEventListener('keydown', (e) => {
    if (!isActive() || phase !== 'study' || animating) return;
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
      toggleFlip();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      markCurrent(true);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      markCurrent(false);
    } else if (e.key === '1') {
      markCurrent(false);
    } else if (e.key === '2') {
      markCurrent(true);
    }
  });

  return {
    refresh(reset = false) {
      animating = false;
      if (reset || phase !== 'study') {
        phase = 'overview';
      }
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
