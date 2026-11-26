/**
 * Configuration Firebase (Firestore) pour le classement et la progression.
 * Remplacez les valeurs ci-dessous par celles de votre projet Firebase
 * (voir SETUP.md). Sans configuration, l'appli fonctionne avec localStorage.
 */
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCfgJHwsIRjF_ZHvBVzn5pfX7HXamFGJoQ",

  authDomain: "quizlet-buque-226.firebaseapp.com",

  projectId: "quizlet-buque-226",

  storageBucket: "quizlet-buque-226.firebasestorage.app",

  messagingSenderId: "532902252318",

  appId: "1:532902252318:web:91ff60981d8f459c6a830f",

  measurementId: "G-930KF9J1XP",
};

export function isFirebaseConfigured() {
  return (
    Boolean(FIREBASE_CONFIG.apiKey) &&
    Boolean(FIREBASE_CONFIG.projectId) &&
    !FIREBASE_CONFIG.apiKey.startsWith("YOUR_") &&
    !FIREBASE_CONFIG.projectId.startsWith("YOUR_")
  );
}
