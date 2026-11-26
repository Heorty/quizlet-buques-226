# Déploiement GitHub Pages + Firebase

## 1. Configurer Firebase (Firestore)

1. Créez un projet sur [console.firebase.google.com](https://console.firebase.google.com/).
2. Ajoutez une application Web (`</>`) et copiez l'objet `firebaseConfig` dans `js/firebase-config.js`.
3. Activez **Firestore Database** (mode production ou test), puis mettez les règles suivantes dans **Firestore → Règles** (aucun anti-triche requis) :

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /scores_match/{docId} {
      allow read, write: if true;
    }
    match /scores_quiz/{docId} {
      allow read, write: if true;
    }
    match /progress/{docId} {
      allow read, write: if true;
    }
  }
}
```

## 2. Déployer sur GitHub Pages

1. Poussez les fichiers du site (`index.html`, `css/`, `js/`, `photos/`, `tablal_226.csv`, `Amtradszaloeil.svg`, `clunsois_complet.ttf`) sur un dépôt GitHub (les PDF et `trombinoscope.svg` sont ignorés via `.gitignore`).
2. Dans **Settings → Pages**, sélectionnez la branche `main` et le dossier `/ (root)`.
3. Le site est accessible à `https://<utilisateur>.github.io/<depot>/`.

## 3. Régénérer `tablal_226.csv` et les photos

```bash
python scripts/build_data.py
```
