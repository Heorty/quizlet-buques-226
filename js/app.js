import { loadOnscrits, slugify } from './data.js';
import { getLeaderboardAround, loadProgress, saveMatchScore, saveProgress, saveQuizScore } from './firebase.js';
import { createFlashcardsView } from './flashcards.js';
import { createLeaderboardView } from './leaderboard.js';
import { createMatchView } from './match.js';
import { createQuizView } from './quiz.js';

const LS_USER = 'q226_user';

let items = [];
let user = readStoredUser();
let mastered = new Set();
let activeTab = 'flashcards';
let pendingSubmission = null;
let viewInitialized = false;

const authBtn = document.querySelector('#auth-btn');
const authModal = document.querySelector('#auth-modal');
const authGateLogo = document.querySelector('#auth-gate-logo');
const authForm = document.querySelector('#auth-form');
const authBuque = document.querySelector('#auth-buque');
const authFamss = document.querySelector('#auth-famss');
const authError = document.querySelector('#auth-error');
const authLogout = document.querySelector('#auth-logout');
const authClose = document.querySelector('#auth-close');
const buquesList = document.querySelector('#buques-list');

const navTabs = document.querySelectorAll('.nav-tab');
const views = {
  flashcards: document.querySelector('#view-flashcards'),
  match: document.querySelector('#view-match'),
  quiz: document.querySelector('#view-quiz'),
  leaderboard: document.querySelector('#view-leaderboard'),
};

function readStoredUser() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_USER) || 'null');
    if (parsed && parsed.buque && parsed.famss && parsed.key) return parsed;
  } catch {
    // ignore
  }
  return null;
}

function makeUserKey(buque, famss) {
  return `${slugify(buque)}__${slugify(famss)}`;
}

function renderAuthButton() {
  if (user) {
    authBtn.textContent = `${user.buque} · ${user.famss}`;
    authBtn.classList.add('is-logged');
  } else {
    authBtn.textContent = 'Connexion';
    authBtn.classList.remove('is-logged');
  }
}

function openAuthModal() {
  const isGate = !user;
  if (isGate) {
    matchView.stop();
    quizView.stop();
  }
  authError.hidden = true;
  authBuque.value = user ? user.buque : '';
  authFamss.value = user ? user.famss : '';
  authModal.classList.toggle('is-gate', isGate);
  authClose.hidden = isGate;
  authGateLogo.hidden = !isGate;
  authLogout.hidden = !user;
  authModal.hidden = false;
  authBuque.focus();
}

function closeAuthModal() {
  if (!user) return;
  authModal.classList.remove('is-gate');
  authModal.hidden = true;
  pendingSubmission = null;
}

const flashcardsView = createFlashcardsView(views.flashcards, {
  getItems: () => items,
  getMastered: () => mastered,
  setMastered: (next) => {
    mastered = next;
    if (user) {
      saveProgress(user, Array.from(mastered));
    } else {
      localStorage.setItem('q226_progress_anon', JSON.stringify(Array.from(mastered)));
    }
  },
  isActive: () => activeTab === 'flashcards' && authModal.hidden,
});

const matchView = createMatchView(views.match, {
  getItems: () => items,
  onGameFinish: (mode, payload) => submitScore(mode, payload),
});

const quizView = createQuizView(views.quiz, {
  getItems: () => items,
  onGameFinish: (mode, payload) => submitScore(mode, payload),
  isActive: () => activeTab === 'quiz' && authModal.hidden,
});

const leaderboardView = createLeaderboardView(views.leaderboard, {
  getUser: () => user,
});

async function saveAndGetStanding(mode, payload) {
  const res =
    mode === 'match'
      ? await saveMatchScore(user, payload.timeMs)
      : await saveQuizScore(user, payload.score, payload.total, payload.timeMs);

  let standing = null;
  try {
    standing = await getLeaderboardAround(mode, user.key, 2);
  } catch {
    standing = null;
  }
  return { ...res, standing };
}

async function submitScore(mode, payload) {
  if (!user) {
    return new Promise((resolve) => {
      pendingSubmission = { mode, payload, resolve };
      openAuthModal();
    });
  }
  return saveAndGetStanding(mode, payload);
}

function switchTab(nextTab) {
  if (!views[nextTab]) return;
  if (activeTab === 'match' && nextTab !== 'match') matchView.stop();
  if (activeTab === 'quiz' && nextTab !== 'quiz') quizView.stop();

  activeTab = nextTab;
  navTabs.forEach((btn) => {
    const selected = btn.dataset.tab === nextTab;
    btn.classList.toggle('is-active', selected);
    btn.setAttribute('aria-selected', String(selected));
  });

  Object.entries(views).forEach(([key, el]) => {
    const show = key === nextTab;
    el.hidden = !show;
    el.classList.toggle('is-active', show);
  });

  if (nextTab === 'flashcards') flashcardsView.refresh();
  if (nextTab === 'match') matchView.start();
  if (nextTab === 'quiz') quizView.start();
  if (nextTab === 'leaderboard') leaderboardView.refresh();

  if (window.location.hash !== `#${nextTab}`) {
    history.replaceState(null, '', `#${nextTab}`);
  }
}

navTabs.forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

authBtn.addEventListener('click', openAuthModal);
authClose.addEventListener('click', closeAuthModal);
authModal.addEventListener('click', (e) => {
  if (e.target === authModal && user) closeAuthModal();
});

authLogout.addEventListener('click', () => {
  user = null;
  localStorage.removeItem(LS_USER);
  mastered = loadAnonProgress();
  renderAuthButton();
  openAuthModal();
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const buque = authBuque.value.trim();
  const famss = authFamss.value.trim();
  if (!buque || !famss) {
    authError.textContent = "Renseigne ta buque et ta fam'ss.";
    authError.hidden = false;
    return;
  }

  const key = makeUserKey(buque, famss);
  if (!key || key === '__') {
    authError.textContent = 'Identifiants invalides.';
    authError.hidden = false;
    return;
  }

  user = { buque, famss, key };
  localStorage.setItem(LS_USER, JSON.stringify(user));
  renderAuthButton();

  const savedIds = await loadProgress(user);
  mastered = new Set([...mastered, ...savedIds]);
  saveProgress(user, Array.from(mastered));

  const pending = pendingSubmission;
  pendingSubmission = null;
  authModal.classList.remove('is-gate');
  authModal.hidden = true;

  if (pending) {
    const res = await saveAndGetStanding(pending.mode, pending.payload);
    pending.resolve(res);
  }

  if (!viewInitialized) {
    const hashTab = window.location.hash.replace('#', '');
    switchTab(views[hashTab] ? hashTab : 'flashcards');
    viewInitialized = true;
  } else {
    if (activeTab === 'flashcards') flashcardsView.refresh(true);
    if (activeTab === 'leaderboard') leaderboardView.refresh();
  }
});

function loadAnonProgress() {
  try {
    return new Set(JSON.parse(localStorage.getItem('q226_progress_anon') || '[]'));
  } catch {
    return new Set();
  }
}

async function init() {
  renderAuthButton();
  mastered = loadAnonProgress();

  try {
    items = await loadOnscrits();
  } catch (err) {
    views.flashcards.innerHTML = `<div class="empty-box">Erreur de chargement des données.</div>`;
    console.error(err);
    return;
  }

  const uniqueBuques = Array.from(new Set(items.map((x) => x.buque).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'fr')
  );
  buquesList.innerHTML = uniqueBuques.map((b) => `<option value="${b.replace(/"/g, '&quot;')}"></option>`).join('');

  if (user) {
    const savedIds = await loadProgress(user);
    mastered = new Set([...mastered, ...savedIds]);
    const hashTab = window.location.hash.replace('#', '');
    switchTab(views[hashTab] ? hashTab : 'flashcards');
    viewInitialized = true;
  } else {
    openAuthModal();
  }
}

init();
