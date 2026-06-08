// ===== FIREBASE CONFIG =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCYrWPXWGV0oPuupZsJxeBgw7yW-mDlPrI",
    authDomain: "black-market-f89de.firebaseapp.com",
    projectId: "black-market-f89de",
    storageBucket: "black-market-f89de.firebasestorage.app",
    messagingSenderId: "908641278023",
    appId: "1:908641278023:web:bce6d0bb7c358af7fcb962"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };

// ─────────────────────────────────────────────
// 🚀 ЗБТ-режим
// true  — включён: 1 сервер, баннер, лимиты
// false — выключен: обычный режим, все сервера
// ─────────────────────────────────────────────
export const ZBT_MODE = false;
export const ZBT_SERVER = 'ZBT'; // название единственного сервера
