import { FIREBASE_CONFIG, isFirebaseConfigured } from './firebase-config.js';

const SDK_BASE = 'https://www.gstatic.com/firebasejs/11.0.2';
const LS_MATCH = 'q226_scores_match';
const LS_QUIZ = 'q226_scores_quiz';
const LS_PROGRESS_PREFIX = 'q226_progress_';

let firestorePromise = null;

async function getDb() {
  if (!isFirebaseConfigured()) return null;
  if (!firestorePromise) {
    firestorePromise = (async () => {
      try {
        const [{ initializeApp }, fs] = await Promise.all([
          import(`${SDK_BASE}/firebase-app.js`),
          import(`${SDK_BASE}/firebase-firestore.js`),
        ]);
        const app = initializeApp(FIREBASE_CONFIG);
        const db = fs.getFirestore(app);
        return { db, fs };
      } catch (err) {
        console.warn('Firebase indisponible, repli localStorage :', err);
        return null;
      }
    })();
  }
  return firestorePromise;
}

function readLocalMap(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

function writeLocalMap(key, map) {
  localStorage.setItem(key, JSON.stringify(map));
}

export async function saveMatchScore(user, timeMs) {
  const entry = {
    key: user.key,
    buque: user.buque,
    famss: user.famss,
    timeMs,
    updatedAt: Date.now(),
  };

  const ctx = await getDb();
  if (ctx) {
    const { db, fs } = ctx;
    const ref = fs.doc(db, 'scores_match', user.key);
    const snap = await fs.getDoc(ref);
    const prev = snap.exists() ? snap.data() : null;
    if (!prev || timeMs < prev.timeMs) {
      await fs.setDoc(ref, entry);
      return { saved: true, isNewBest: true, bestTimeMs: timeMs };
    }
    return { saved: false, isNewBest: false, bestTimeMs: prev.timeMs };
  }

  const map = readLocalMap(LS_MATCH);
  const prev = map[user.key];
  if (!prev || timeMs < prev.timeMs) {
    map[user.key] = entry;
    writeLocalMap(LS_MATCH, map);
    return { saved: true, isNewBest: true, bestTimeMs: timeMs };
  }
  return { saved: false, isNewBest: false, bestTimeMs: prev.timeMs };
}

function isBetterQuiz(next, prev) {
  if (!prev) return true;
  if (next.score !== prev.score) return next.score > prev.score;
  return next.timeMs < prev.timeMs;
}

export async function saveQuizScore(user, score, total, timeMs) {
  const entry = {
    key: user.key,
    buque: user.buque,
    famss: user.famss,
    score,
    total,
    timeMs,
    updatedAt: Date.now(),
  };

  const ctx = await getDb();
  if (ctx) {
    const { db, fs } = ctx;
    const ref = fs.doc(db, 'scores_quiz', user.key);
    const snap = await fs.getDoc(ref);
    const prev = snap.exists() ? snap.data() : null;
    if (isBetterQuiz(entry, prev)) {
      await fs.setDoc(ref, entry);
      return { saved: true, isNewBest: true };
    }
    return { saved: false, isNewBest: false };
  }

  const map = readLocalMap(LS_QUIZ);
  const prev = map[user.key];
  if (isBetterQuiz(entry, prev)) {
    map[user.key] = entry;
    writeLocalMap(LS_QUIZ, map);
    return { saved: true, isNewBest: true };
  }
  return { saved: false, isNewBest: false };
}

export async function getLeaderboard(mode) {
  const col = mode === 'quiz' ? 'scores_quiz' : 'scores_match';
  const lsKey = mode === 'quiz' ? LS_QUIZ : LS_MATCH;
  let rows = [];

  const ctx = await getDb();
  if (ctx) {
    const { db, fs } = ctx;
    const snap = await fs.getDocs(fs.collection(db, col));
    rows = snap.docs.map((d) => ({ key: d.id, ...d.data() }));
  } else {
    rows = Object.values(readLocalMap(lsKey));
  }

  if (mode === 'quiz') {
    rows.sort((a, b) => (b.score - a.score) || (a.timeMs - b.timeMs));
  } else {
    rows.sort((a, b) => a.timeMs - b.timeMs);
  }
  return rows.slice(0, 50);
}

export async function loadProgress(user) {
  const lsKey = `${LS_PROGRESS_PREFIX}${user.key}`;
  let local = [];
  try {
    local = JSON.parse(localStorage.getItem(lsKey) || '[]');
  } catch {
    local = [];
  }

  const ctx = await getDb();
  if (!ctx) return local;

  try {
    const { db, fs } = ctx;
    const ref = fs.doc(db, 'progress', user.key);
    const snap = await fs.getDoc(ref);
    if (snap.exists() && Array.isArray(snap.data().mastered)) {
      const merged = Array.from(new Set([...local, ...snap.data().mastered]));
      localStorage.setItem(lsKey, JSON.stringify(merged));
      return merged;
    }
  } catch {
    // Fallback to local silently
  }
  return local;
}

export async function saveProgress(user, masteredIds) {
  const lsKey = `${LS_PROGRESS_PREFIX}${user.key}`;
  const clean = Array.from(new Set(masteredIds));
  localStorage.setItem(lsKey, JSON.stringify(clean));

  if (!user || !user.key) return;
  const ctx = await getDb();
  if (!ctx) return;

  try {
    const { db, fs } = ctx;
    await fs.setDoc(fs.doc(db, 'progress', user.key), {
      mastered: clean,
      updatedAt: Date.now(),
    });
  } catch {
    // Ignore transient network errors
  }
}
