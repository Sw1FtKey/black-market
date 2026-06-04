// ===== REGISTER.JS =====
import { db, auth } from './firebase-config.js';
import { ZBT_MODE, ZBT_SERVER } from './firebase-config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Импортируем из наших модулей
import { showToast } from './utils.js';
import { findUser, getUsers, saveUsers, checkBanStatus } from './api.js';
import { saveCurrentUser } from './auth.js';

// ─────────────────────────────────────────────
// Никнейм → фейковый email для Firebase Auth
// ─────────────────────────────────────────────
function nicknameToEmail(nickname) {
    return `${nickname.toLowerCase()}@blackmarket.game`;
}

// ─────────────────────────────────────────────
// DOM READY
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
});

function initAuth() {
    const loginToggle    = document.getElementById('loginToggle');
    const registerToggle = document.getElementById('registerToggle');
    const loginForm      = document.getElementById('loginForm');
    const registerForm   = document.getElementById('registerForm');

    if (!loginToggle || !registerToggle || !loginForm || !registerForm) {
        console.error('Не найдены элементы форм!');
        return;
    }

    loginToggle.addEventListener('click', () => {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        loginToggle.classList.add('active');
        registerToggle.classList.remove('active');
    });

    registerToggle.addEventListener('click', () => {
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        registerToggle.classList.add('active');
        loginToggle.classList.remove('active');
    });

    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);

    checkExistingAuth();
}

// ─────────────────────────────────────────────
// ВХОД
// ─────────────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();

    const nickname = document.getElementById('loginNickname').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!nickname || !password) {
        showToast('Введите никнейм и пароль', 'error');
        return;
    }

    try {
        // Сначала входим через Firebase Auth
        await signInWithEmailAndPassword(auth, nicknameToEmail(nickname), password);

        // После успешного входа — грузим данные пользователя (уже авторизованы)
        const user = await findUser(nickname);

        // Проверяем бан
        const banStatus = await checkBanStatus(nickname);
        if (banStatus.banned) {
            await signOut(auth);
            if (banStatus.level === 'ban_perm') {
                showToast('Вы заблокированы навсегда. Причина: ' + banStatus.reason, 'error');
            } else {
                const hours = Math.ceil(banStatus.remaining / (1000 * 60 * 60));
                showToast(`Вы заблокированы на ${hours} ч. Причина: ${banStatus.reason}`, 'error');
            }
            return;
        }

        // Сохраняем пользователя — берём данные из Firestore или создаём минимальный объект
        const userData = user || { nickname, server: null };
        saveCurrentUser(userData);
        showToast('Вход выполнен!', 'success');
        setTimeout(() => window.location.href = userData.server ? 'index.html' : 'servers.html', 1200);

    } catch (err) {
        console.error('Ошибка входа:', err.code);
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            showToast('Неверный пароль', 'error');
        } else if (err.code === 'auth/user-not-found') {
            showToast('Аккаунт не найден. Проверьте никнейм', 'error');
        } else if (err.code === 'auth/too-many-requests') {
            showToast('Слишком много попыток. Подождите немного', 'error');
        } else {
            showToast('Ошибка входа. Попробуйте снова', 'error');
        }
    }
}

// ─────────────────────────────────────────────
// РЕГИСТРАЦИЯ
// ─────────────────────────────────────────────
async function handleRegister(e) {
    e.preventDefault();

    const nickname        = document.getElementById('regNickname').value.trim();
    const password        = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;

    if (nickname.length < 3)  { showToast('Никнейм слишком короткий (минимум 3 символа)', 'error'); return; }
    if (nickname.length > 20) { showToast('Никнейм слишком длинный (максимум 20 символов)', 'error'); return; }
    if (!/^[a-zA-Z0-9_а-яА-Я]+$/.test(nickname)) { showToast('Никнейм: только буквы, цифры и _', 'error'); return; }
    if (password.length < 6)  { showToast('Пароль слишком короткий (минимум 6 символов)', 'error'); return; }
    if (password.length > 50) { showToast('Пароль слишком длинный', 'error'); return; }
    if (password !== confirmPassword) { showToast('Пароли не совпадают', 'error'); return; }

    const existingUser = await findUser(nickname);
    if (existingUser) { showToast('Этот никнейм уже занят', 'error'); return; }

    try {
        const userCredential = await createUserWithEmailAndPassword(
            auth, nicknameToEmail(nickname), password
        );
        await updateProfile(userCredential.user, { displayName: nickname });

        const newUser = {
            nickname,
            uid: userCredential.user.uid,
            server: ZBT_MODE ? ZBT_SERVER : null,
            createdAt: new Date().toISOString()
        };

        const users = await getUsers();
        users.push(newUser);
        await saveUsers(users);

        saveCurrentUser(newUser);
        showToast('Аккаунт создан!', 'success');
        // В ЗБТ-режиме сервер уже назначен — сразу на главную
        setTimeout(() => window.location.href = ZBT_MODE ? 'index.html' : 'servers.html', 1200);

    } catch (err) {
        console.error('Ошибка регистрации:', err.code);
        if (err.code === 'auth/email-already-in-use') {
            showToast('Этот никнейм уже занят', 'error');
        } else if (err.code === 'auth/weak-password') {
            showToast('Пароль слишком простой (минимум 6 символов)', 'error');
        } else {
            showToast('Ошибка создания аккаунта. Попробуйте позже', 'error');
        }
    }
}

// ─────────────────────────────────────────────
// ПРОВЕРКА ПРИ ЗАГРУЗКЕ
// ─────────────────────────────────────────────
async function checkExistingAuth() {
    const stored = localStorage.getItem('currentUser');
    if (!stored) return;

    const user = JSON.parse(stored);
    const banStatus = await checkBanStatus(user.nickname);

    if (banStatus.banned) {
        localStorage.removeItem('currentUser');
        try { await signOut(auth); } catch {}
        showToast('Ваш аккаунт заблокирован. Причина: ' + banStatus.reason, 'error');
        return;
    }

    window.location.href = user.server ? 'index.html' : 'servers.html';
}
