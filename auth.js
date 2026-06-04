// ===== AUTH.JS — авторизация и роли =====
// Импортируй нужное: import { getCurrentUser, requireAuth, getUserRole } from './auth.js';

import { auth } from './firebase-config.js';
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserRole, checkBanStatus } from './api.js';
import { showToast } from './utils.js';

// ─────────────────────────────────────────────
// 👤 ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ
// ─────────────────────────────────────────────

// Получить текущего пользователя из localStorage
export function getCurrentUser() {
    try {
        const data = localStorage.getItem('currentUser');
        return data ? JSON.parse(data) : null;
    } catch { return null; }
}

// Сохранить пользователя БЕЗ пароля
export function saveCurrentUser(user) {
    const safe = { ...user };
    delete safe.password; // никогда не храним пароль в localStorage
    localStorage.setItem('currentUser', JSON.stringify(safe));
}

// Выход из аккаунта
export async function logout() {
    try {
        await signOut(auth);
    } catch (e) {
        console.error('Ошибка выхода:', e);
    } finally {
        localStorage.removeItem('currentUser');
        window.location.href = 'register.html';
    }
}

// ─────────────────────────────────────────────
// 🔐 ПРОВЕРКИ ДОСТУПА
// ─────────────────────────────────────────────

// Редирект если не залогинен
export function requireAuth(redirectTo = 'register.html') {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = redirectTo;
        return null;
    }
    return user;
}

// ─────────────────────────────────────────────
// 🛡️ РОЛИ — читаем с Firestore
// ─────────────────────────────────────────────

const ROLE_LEVELS = { moder: 1, admin: 2, owner: 3 };

let _cachedRole = null;
let _roleLoaded = false;

// Загрузить роль текущего пользователя с Firestore
export async function loadMyRole() {
    const user = getCurrentUser();
    if (!user) { _roleLoaded = true; return null; }

    try {
        _cachedRole = await getUserRole(user.nickname);
        _roleLoaded = true;
        return _cachedRole;
    } catch (e) {
        console.error('Ошибка загрузки роли:', e);
        _roleLoaded = true;
        return null;
    }
}

// Получить роль (из кэша)
export function getMyRole() {
    return _cachedRole;
}

// Проверить что роль >= minRole
export function hasRole(minRole) {
    const myLevel = ROLE_LEVELS[_cachedRole] || 0;
    const required = ROLE_LEVELS[minRole] || 99;
    return myLevel >= required;
}

// Проверить доступ к действию
const ACTION_LEVELS = {
    delete_ad:     1,
    warn:          1,
    resolve:       1,
    ban:           2,
    unban:         2,
    logs:          2,
    pin_ad:        2,
    platform_stats:3,
    manage_roles:  3
};

export function canDo(action) {
    const myLevel = ROLE_LEVELS[_cachedRole] || 0;
    const required = ACTION_LEVELS[action] || 99;
    return myLevel >= required;
}

// Показать UI элементы по роли
export function applyRoleUI() {
    if (_cachedRole) {
        // Показываем кнопку админки
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.removeProperty('display');
        });
    }

    // Скрываем элементы для которых нет прав
    document.querySelectorAll('[data-require-role]').forEach(el => {
        const required = el.dataset.requireRole;
        if (!hasRole(required)) {
            el.style.display = 'none';
        }
    });
}

// ─────────────────────────────────────────────
// 🔨 ПРОВЕРКА БАНА ПРИ ЗАГРУЗКЕ
// ─────────────────────────────────────────────
export async function checkCurrentUserBan() {
    const user = getCurrentUser();
    if (!user) return false;

    const banStatus = await checkBanStatus(user.nickname);
    if (banStatus.banned) {
        localStorage.removeItem('currentUser');
        try { await signOut(auth); } catch {}

        if (banStatus.level === 'ban_perm') {
            showToast('Ваш аккаунт заблокирован навсегда. Причина: ' + banStatus.reason, 'error');
        } else {
            const hours = Math.ceil(banStatus.remaining / (1000 * 60 * 60));
            showToast(`Ваш аккаунт заблокирован на ${hours} ч.`, 'error');
        }
        setTimeout(() => window.location.href = 'register.html', 2000);
        return true;
    }
    return false;
}
