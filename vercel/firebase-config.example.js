// Copy to firebase-config.js and paste your Firebase web app config
// (Firebase console → Project settings → Your apps → Web app → SDK setup and configuration → Config).
// Use window.KT_FIREBASE_CONFIG exactly as below (the app does not read a `const firebaseConfig`).
// These values identify your project; they are not secrets. Access is enforced by firestore.rules.
window.KT_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
};
