import { formatTime, shuffle } from './data.js';

const TOTAL_QUESTIONS = 10;

export function createQuizView(container, { getItems, onGameFinish, isActive }) {
  let questions = [];
  let qIndex = 0;
  let score = 0;
  let startTs = null;
  let timerId = null;
  let locked = false;

  container.innerHTML = `
    <div class="bar">
      <div class="bar-right">
        <span class="counter" id="quiz-progress">1 / ${TOTAL_QUESTIONS}</span>
        <span class="timer" id="quiz-timer">0.00s</span>
      </div>
      <button type="button" class="btn" id="quiz-restart" hidden>Relancer</button>
    </div>
    <div id="quiz-stage" class="quiz-wrap"></div>
  `;

  const stage = container.querySelector('#quiz-stage');
  const progressEl = container.querySelector('#quiz-progress');
  const timerEl = container.querySelector('#quiz-timer');
  const restartBtn = container.querySelector('#quiz-restart');

  function stopTimer() {
    if (timerId) {
      cancelAnimationFrame(timerId);
      timerId = null;
    }
  }

  function tick() {
    if (startTs !== null) {
      timerEl.textContent = formatTime(performance.now() - startTs);
    }
    timerId = requestAnimationFrame(tick);
  }

  function showReady() {
    stopTimer();
    questions = [];
    qIndex = 0;
    score = 0;
    startTs = null;
    locked = false;
    progressEl.textContent = `0 / ${TOTAL_QUESTIONS}`;
    timerEl.textContent = '0.00s';
    restartBtn.hidden = true;

    stage.innerHTML = `
      <div class="result-card">
        <button type="button" class="btn btn-primary" id="quiz-launch">Lancer</button>
      </div>
    `;
    stage.querySelector('#quiz-launch').addEventListener('click', startNewQuiz);
  }

  function startNewQuiz() {
    stopTimer();
    const pool = getItems().filter((x) => x.photo && x.buque);
    const chosen = shuffle(pool).slice(0, TOTAL_QUESTIONS);
    questions = chosen.map((target) => {
      const distractors = shuffle(pool.filter((x) => x.id !== target.id)).slice(0, 3);
      return {
        target,
        options: shuffle([target, ...distractors]),
      };
    });

    qIndex = 0;
    score = 0;
    locked = false;
    restartBtn.hidden = false;
    startTs = performance.now();
    timerEl.textContent = '0.00s';
    timerId = requestAnimationFrame(tick);
    renderQuestion();
  }

  function renderQuestion() {
    if (qIndex >= questions.length) {
      finishQuiz();
      return;
    }

    const q = questions[qIndex];
    progressEl.textContent = `${qIndex + 1} / ${questions.length}`;

    stage.innerHTML = `
      <div class="quiz-photo-box">
        <img src="./${escapeHtml(q.target.photo)}" alt="">
      </div>
      <div class="quiz-options">
        ${q.options
          .map((opt, idx) => {
            const fam = opt.famss ? `<span class="quiz-opt-famss">${escapeHtml(opt.famss)}</span>` : '';
            return `
              <button type="button" class="quiz-opt" data-opt="${idx}">
                <span class="quiz-opt-buque">${escapeHtml(opt.buque)}</span>
                ${fam}
              </button>
            `;
          })
          .join('')}
      </div>
    `;

    stage.querySelectorAll('.quiz-opt').forEach((btn) => {
      btn.addEventListener('click', () => chooseOption(Number(btn.dataset.opt)));
    });
  }

  function chooseOption(optIdx) {
    if (locked || qIndex >= questions.length) return;
    locked = true;

    const q = questions[qIndex];
    const buttons = stage.querySelectorAll('.quiz-opt');
    buttons.forEach((b) => {
      b.disabled = true;
    });

    const chosen = q.options[optIdx];
    const isCorrect = chosen.id === q.target.id;
    if (isCorrect) {
      score += 1;
      buttons[optIdx].classList.add('is-correct');
    } else {
      buttons[optIdx].classList.add('is-wrong');
      const correctIdx = q.options.findIndex((o) => o.id === q.target.id);
      if (correctIdx >= 0) buttons[correctIdx].classList.add('is-correct');
    }

    setTimeout(() => {
      qIndex += 1;
      locked = false;
      renderQuestion();
    }, 450);
  }

  async function finishQuiz() {
    const finalMs = Math.round(performance.now() - startTs);
    stopTimer();
    timerEl.textContent = formatTime(finalMs);
    progressEl.textContent = `${questions.length} / ${questions.length}`;
    restartBtn.hidden = true;

    stage.innerHTML = `
      <div class="result-card">
        <div class="result-score">${score} / ${questions.length} · ${formatTime(finalMs)}</div>
        <div class="result-badge" id="quiz-badge" hidden>Record !</div>
        <button type="button" class="btn btn-primary" id="quiz-again">Relancer</button>
      </div>
    `;
    stage.querySelector('#quiz-again').addEventListener('click', startNewQuiz);

    const res = await onGameFinish('quiz', { score, total: questions.length, timeMs: finalMs });
    if (res && res.isNewBest) {
      const badge = stage.querySelector('#quiz-badge');
      if (badge) badge.hidden = false;
    }
  }

  restartBtn.addEventListener('click', startNewQuiz);

  document.addEventListener('keydown', (e) => {
    if (!isActive()) return;
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (['1', '2', '3', '4'].includes(e.key)) {
      chooseOption(Number(e.key) - 1);
    }
  });

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
