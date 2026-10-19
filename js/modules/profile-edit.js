// ===== PROFILE-EDIT — редактирование профиля из шторки (ник, пароль) =====
import { auth } from '../firebase-config.js';
import {
    EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { showToast } from '../utils.js';
import { getAllAds, updateAd, findUser, saveUser, deleteUserDoc } from '../api.js';
import { isProcessing } from './main.js';
import { closeProfileMenu } from './sidebar.js';
import { renderAds } from './feed.js';

// Должно совпадать с nicknameToEmail() в register.js — ник у нас не
// настоящий email, а способ завести Firebase Auth аккаунт по нику.
function nicknameToEmail(nickname) {
    return `${nickname.toLowerCase()}@blackmarket.game`;
}

export function openProfileEdit() {
    const modal = document.getElementById('editProfileModal');
    const user = JSON.parse(localStorage.getItem('currentUser'));
    
    if (!user) return;
    
    const nicknameInput = document.getElementById('editNickname');
    if (nicknameInput) {
        nicknameInput.value = user.nickname;
    }
    
    const currentPass = document.getElementById('currentPassword');
    const newPass = document.getElementById('newPassword');
    const confirmPass = document.getElementById('confirmNewPassword');
    const confirmGroup = document.getElementById('confirmPasswordGroup');
    
    if (currentPass) currentPass.value = '';
    if (newPass) newPass.value = '';
    if (confirmPass) confirmPass.value = '';
    if (confirmGroup) confirmGroup.style.display = 'none';
    
    if (modal) {
        modal.classList.remove('hidden');
        requestAnimationFrame(function() {
            modal.classList.add('active');
        });
    }
    
    closeProfileMenu();
}

export function closeProfileEdit() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(function() {
            modal.classList.add('hidden');
        }, 300);
    }
}

export async function saveProfileChanges() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) {
        showToast('Ошибка: не авторизован', 'error');
        return;
    }
    // Защита от двойного клика
    if (isProcessing('saveProfile')) {
        return;
    }
    const currentPasswordInput = document.getElementById('currentPassword');
    const newNicknameInput = document.getElementById('editNickname');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmNewPassword');
    
    const currentPassword = currentPasswordInput ? currentPasswordInput.value : '';
    const newNickname = newNicknameInput ? newNicknameInput.value.trim() : '';
    const newPassword = newPasswordInput ? newPasswordInput.value : '';
    const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';

    const nicknameChanged = !!newNickname && newNickname !== user.nickname;
    const passwordChanged = !!newPassword;

    if (!nicknameChanged && !passwordChanged) {
        closeProfileEdit();
        return; // нечего сохранять
    }

    if (!currentPassword) {
        showToast('Введите текущий пароль для подтверждения', 'error');
        return;
    }

    if (passwordChanged) {
        if (newPassword.length < 6) {
            showToast('Пароль слишком короткий (минимум 6 символов)', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast('Пароли не совпадают!', 'error');
            return;
        }
    }

    // Проверка ника — читаем ТОЛЬКО документ этого ника, не всех пользователей
    if (nicknameChanged) {
        const existing = await findUser(newNickname);
        if (existing) {
            showToast('Этот никнейм уже занят!', 'error');
            return;
        }
    }

    // ===== Переаутентификация — единственный правильный способ
    // проверить "текущий пароль". Раньше это сравнивалось с
    // user.password из localStorage, которого там никогда не было
    // (auth.js всегда вычищает пароль перед записью) — проверка была
    // сломана для всех и всегда проваливалась. А если бы сработала —
    // новый пароль дальше писался бы в Firestore ОТКРЫТЫМ ТЕКСТОМ.
    // Пароли не должны попадать в Firestore ни в каком виде — только
    // через сам Firebase Auth.
    try {
        const cred = EmailAuthProvider.credential(nicknameToEmail(user.nickname), currentPassword);
        await reauthenticateWithCredential(auth.currentUser, cred);
    } catch (e) {
        console.error('Ошибка переаутентификации:', e.code);
        if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
            showToast('Неверный текущий пароль!', 'error');
        } else if (e.code === 'auth/too-many-requests') {
            showToast('Слишком много попыток. Подождите немного', 'error');
        } else {
            showToast('Ошибка проверки пароля. Попробуйте снова', 'error');
        }
        return;
    }

    const oldNickname = user.nickname;

    try {
        // Смена пароля — целиком через Firebase Auth, в Firestore
        // ничего не пишем.
        if (passwordChanged) {
            await updatePassword(auth.currentUser, newPassword);
        }

        if (nicknameChanged) {
            // ВАЖНО: порядок операций. Правила Firestore разрешают менять
            // объявление/документ пользователя, только пока имя в текущем
            // ID-токене Firebase Auth совпадает с полем author/id
            // документа. Поэтому сначала переносим ads и удаляем старый
            // users/{oldNickname}, используя ЕЩЁ старый токен, и только
            // потом меняем displayName и обновляем токен — иначе одна из
            // двух операций (перенос объявлений ИЛИ создание нового
            // документа пользователя) получит permission-denied.

            // 1. Переносим авторство объявлений (старый токен ещё активен)
            const allAds = await getAllAds();
            const myAds = allAds.filter(ad => ad.author === oldNickname);
            await Promise.all(myAds.map(ad => updateAd(ad.id, { author: newNickname })));

            // 2. Берём СВЕЖИЙ профиль из Firestore (локальная копия может быть
            //    устаревшей — без аватара/Telegram/бейджей) и удаляем старый
            //    документ (тоже под старым токеном)
            const remoteUser = await findUser(oldNickname);
            await deleteUserDoc(oldNickname);

            // 3. Меняем displayName в Firebase Auth и форсируем обновление
            //    ID-токена — дальше myNickname() в правилах уже видит новый ник
            await updateProfile(auth.currentUser, { displayName: newNickname });
            await auth.currentUser.getIdToken(true);

            // 4. Создаём новый документ пользователя под новым ником
            const { password, ...safeUser } = user; // на всякий случай не переносим пароль, если он где-то завалялся
            await saveUser({ ...safeUser, ...(remoteUser || {}), nickname: newNickname });
        }
    } catch (e) {
        console.error('Ошибка сохранения профиля:', e);
        if (e.code === 'auth/requires-recent-login') {
            showToast('Сессия устарела, войдите заново и повторите', 'error');
        } else if (e.code === 'auth/weak-password') {
            showToast('Пароль слишком простой (минимум 6 символов)', 'error');
        } else {
            showToast('Ошибка сохранения. Попробуйте снова', 'error');
        }
        return;
    }

    // Обновляем локальное состояние (без пароля — он туда и не должен попадать)
    user.nickname = newNickname || user.nickname;
    localStorage.setItem('currentUser', JSON.stringify(user));
    
    const profileNickname = document.getElementById('profileNickname');
    const sidebarNickname = document.getElementById('sidebarNickname');
    
    if (profileNickname) {
        profileNickname.textContent = user.nickname + ' • ' + user.server;
    }
    if (sidebarNickname) {
        sidebarNickname.textContent = user.nickname;
    }
    
    // Переносим избранное
    if (nicknameChanged) {
        const oldFavs = localStorage.getItem('favorites_' + oldNickname);
        if (oldFavs) {
            localStorage.setItem('favorites_' + newNickname, oldFavs);
            localStorage.removeItem('favorites_' + oldNickname);
        }
    }
    
    showToast('Профиль обновлён!', 'success');
    closeProfileEdit();
    
    // Перезагружаем страницу если менялся ник (обновит все ссылки/чаты в UI)
    if (nicknameChanged) {
        setTimeout(() => window.location.reload(), 500);
    } else {
        renderAds();
    }
}

window.openProfileEdit = openProfileEdit;

window.closeProfileEdit = closeProfileEdit;

window.saveProfileChanges = saveProfileChanges;
