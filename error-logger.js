// ===== ERROR LOGGER — Black Market =====
// Логирует ошибки в Firestore для анализа во время ЗБТ
// Подключать на всех страницах ПЕРВЫМ скриптом

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyCYrWPXWGV0oPuupZsJxeBgw7yW-mDlPrI",
    authDomain: "black-market-f89de.firebaseapp.com",
    projectId: "black-market-f89de",
    storageBucket: "black-market-f89de.firebasestorage.app",
    messagingSenderId: "908641278023",
    appId: "1:908641278023:web:bce6d0bb7c358af7fcb962"
};

// Переиспользуем существующий app если уже инициализирован
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);
const _auth = getAuth(app);

// ─────────────────────────────────────────────
// Вспомогательные функции
// ─────────────────────────────────────────────

function getCurrentUser() {
    try {
        const u = JSON.parse(localStorage.getItem('currentUser'));
        return u?.nickname || 'anonymous';
    } catch { return 'anonymous'; }
}

function getPageName() {
    return window.location.pathname.split('/').pop() || 'index.html';
}

// Дедупликация — не спамим одинаковыми ошибками
const recentErrors = new Set();
function isDuplicate(key) {
    if (recentErrors.has(key)) return true;
    recentErrors.add(key);
    setTimeout(() => recentErrors.delete(key), 30000); // сброс через 30 сек
    return false;
}

// ─────────────────────────────────────────────
// Основная функция логирования
// ─────────────────────────────────────────────

export async function logError(message, details = {}, level = 'error') {
    try {
        const user = getCurrentUser();
        const page = getPageName();
        const key = `${level}:${page}:${message}`.substring(0, 100);

        if (isDuplicate(key)) return; // не спамим

        const entry = {
            level,           // 'error' | 'warn' | 'info'
            message: String(message).substring(0, 300),
            page,
            user,
            details: JSON.stringify(details).substring(0, 500),
            ua: navigator.userAgent.substring(0, 150), // браузер/устройство
            timestamp: new Date().toISOString()
        };

        // Читаем текущие логи
        const ref = doc(db, 'errorLogs', 'logs');
        const snap = await getDoc(ref);
        const items = snap.exists() ? snap.data().items || [] : [];

        // Добавляем новый лог в начало
        items.unshift(entry);

        // Храним максимум 500 записей
        if (items.length > 500) items.splice(500);

        await setDoc(ref, { items, lastUpdated: new Date().toISOString() });

    } catch (e) {
        // Логгер не должен ломать приложение
        console.warn('[Logger] Не удалось сохранить лог:', e.message);
    }
}

// Удобные обёртки
export const logWarn = (msg, details) => logError(msg, details, 'warn');
export const logInfo = (msg, details) => logError(msg, details, 'info');

// ─────────────────────────────────────────────
// Глобальные перехватчики
// ─────────────────────────────────────────────

// JS ошибки
window.onerror = function(message, source, lineno, colno, error) {
    logError(message, {
        source: source?.split('/').pop(), // только имя файла
        line: lineno,
        col: colno,
        stack: error?.stack?.substring(0, 300)
    }, 'error');
    return false; // не подавляем ошибку
};

// Promise ошибки (async/await)
window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason) || 'Unhandled promise rejection';
    logError(message, {
        stack: event.reason?.stack?.substring(0, 300)
    }, 'error');
});

// ─────────────────────────────────────────────
// Логируем факт загрузки страницы (для аналитики ЗБТ)
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    logInfo('page_load', {
        page: getPageName(),
        referrer: document.referrer ? document.referrer.split('/').pop() : 'direct'
    });
});

// Делаем доступным глобально для использования в catch блоках без импорта
window.logError = logError;
window.logWarn  = logWarn;
window.logInfo  = logInfo;
