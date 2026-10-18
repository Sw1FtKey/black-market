// ===== MAIN — точка входа: инициализация главной страницы =====
import { db, auth } from '../firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { showToast, compressImage } from '../utils.js';
import { getAllAds, invalidateCache, checkBanStatus, saveBugReport } from '../api.js';

import { getFavorites, saveFavorites, updateFavCount, cleanupFavorites } from './favorites.js';
import { updateMyAdsCount, showMyAds, showFavorites } from './my-ads.js';
import { initSidebarHeader, initSidebarModule, closeProfileMenu } from './sidebar.js';
import { renderAds, initAdvancedSearch } from './feed.js';
import { openModal } from './ad-modal.js';
import { checkUserRole, initChat } from './chat-integration.js';
import './reports.js'; // самостоятельный модуль, регистрирует window.* напрямую

export const processingActions = new Set();

export function isProcessing(key) {
    if (processingActions.has(key)) return true;
    processingActions.add(key);
    setTimeout(() => processingActions.delete(key), 3000);
    return false;
}

export async function safeFirebaseCall(call, fallback = null) {
    try {
        return await call();
    } catch (error) {
        console.error('Firebase error:', error);
        if (error.code === 'permission-denied') {
            showToast('Нет доступа!', 'error');
        } else if (error.code === 'unavailable' || error.code === 'network-request-failed') {
            showToast('Проблема с соединением', 'error');
        } else {
            showToast('Ошибка загрузки данных', 'error');
        }
        return fallback;
    }
}

export const currentUser = JSON.parse(localStorage.getItem('currentUser'));

if (!currentUser) {
    window.location.href = 'register.html';
}

export function showConfirm(message, onConfirm, onCancel) {
    const existing = document.getElementById('bm-confirm');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'bm-confirm';
    overlay.style.cssText = `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);
        display:flex;align-items:center;justify-content:center;padding:20px;
        opacity:0;transition:opacity 0.2s ease;`;

    overlay.innerHTML = `
        <div style="background:#1a1a1a;border:1px solid rgba(255,30,30,0.25);border-radius:16px;
            padding:28px 24px;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.6);
            transform:scale(0.92);transition:transform 0.2s ease;">
            <p style="color:white;font-size:16px;font-weight:500;margin:0 0 24px;line-height:1.5;text-align:center;">${message}</p>
            <div style="display:flex;gap:10px;">
                <button id="bm-confirm-cancel" style="flex:1;padding:12px;border-radius:10px;
                    border:1.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);
                    color:#aaa;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;">
                    Отмена
                </button>
                <button id="bm-confirm-ok" style="flex:1;padding:12px;border-radius:10px;
                    border:none;background:linear-gradient(135deg,#ff1e1e,#cc0000);
                    color:white;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;">
                    Подтвердить
                </button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.querySelector('div').style.transform = 'scale(1)';
    });

    function close() {
        overlay.style.opacity = '0';
        overlay.querySelector('div').style.transform = 'scale(0.92)';
        setTimeout(() => overlay.remove(), 200);
    }

    document.getElementById('bm-confirm-ok').onclick = () => { close(); onConfirm && onConfirm(); };
    document.getElementById('bm-confirm-cancel').onclick = () => { close(); onCancel && onCancel(); };
    overlay.addEventListener('click', e => { if (e.target === overlay) { close(); onCancel && onCancel(); } });
    document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { close(); onCancel && onCancel(); document.removeEventListener('keydown', esc); }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // Редирект на выбор сервера + заполнение шапки ником — должно произойти
    // раньше остальной инициализации (как было в исходном script.js)
    initSidebarModule();

    // Проверка бана при загрузке страницы
    if (currentUser) {
        const banStatus = await checkBanStatus(currentUser.nickname);
        if (banStatus.banned) {
            localStorage.removeItem('currentUser');
            if (banStatus.level === 'ban_perm') {
                showToast('Ваш аккаунт заблокирован навсегда. Причина: ' + banStatus.reason, 'error');
            } else {
                const hours = Math.ceil(banStatus.remaining / (1000 * 60 * 60));
                showToast(`Ваш аккаунт заблокирован на ${hours} ч. Причина: ${banStatus.reason}`, 'error');
            }
            setTimeout(() => window.location.href = 'register.html', 2000);
            return;
        }
    }

    // Сбрасываем кэш если только что опубликовали объявление
    if (document.referrer.includes('create-ad') || sessionStorage.getItem('adJustCreated')) {
        invalidateCache('ads');
        sessionStorage.removeItem('adJustCreated');
    }

    // ── Инициализация шторки профиля ──
    initSidebarHeader();

    // Открываем объявление если пришли с profile.html
    if (window.location.hash === '#openAd') {
        const adData = sessionStorage.getItem('openAd');
        if (adData) {
            sessionStorage.removeItem('openAd');
            window.history.replaceState({}, document.title, 'index.html');
            try { setTimeout(() => window.openModal(JSON.parse(adData)), 800); } catch {}
        }
    }

    // renderAds() сразу показывает скелетон, потом грузит данные — один вызов
    renderAds();
    updateFavCount();
    updateMyAdsCount();
    cleanupFavorites();

    // Открываем объявление если пришли с profile.html (через sessionStorage)
    const _ssAdId = sessionStorage.getItem('openAdId');
    if (_ssAdId) {
        sessionStorage.removeItem('openAdId');
        window.history.replaceState({}, document.title, 'index.html');
        setTimeout(async () => {
            const ads2 = await getAllAds();
            const ad2 = ads2.find(a => String(a.id) === _ssAdId || a._docId === _ssAdId);
            if (ad2) openModal(ad2);
        }, 600);
    }

    // Открываем объявление если пришли с profile.html (?openAd=123)
    const _openAdId = new URLSearchParams(window.location.search).get('openAd');
    if (_openAdId) {
        window.history.replaceState({}, '', 'index.html');
        getAllAds().then(ads => {
            const ad = ads.find(a => String(a.id) === String(_openAdId));
            if (ad) setTimeout(() => openModal(ad), 400);
        });
    }
    // Запускаем чат только после подтверждения Firebase Auth сессии
    onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
            initChat();
        }
    });
    initAdvancedSearch();
    initBugReport();
    
    document.getElementById('favoritesMenuItem')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeProfileMenu();
        showFavorites();
    });
    
    document.getElementById('myAdsMenuItem')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeProfileMenu();
        showMyAds();
    });

    // Проверяем роль с Firestore — не из localStorage!
    // Это защищает от подмены роли через DevTools
    checkUserRole();

    const newPasswordInput = document.getElementById('newPassword');
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', function() {
            const group = document.getElementById('confirmPasswordGroup');
            if (group) {
                group.style.display = this.value ? 'flex' : 'none';
            }
        });
    }
});

window.copyToClipboard = async function(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('<i data-lucide="check" width="14" height="14"></i> Ник скопирован: ' + text);
    } catch (err) {
        // Fallback для старых браузеров
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('<i data-lucide="check" width="14" height="14"></i> Ник скопирован: ' + text);
    }
};

function initBugReport() {
    const btn    = document.getElementById('bugReportBtn');
    const modal  = document.getElementById('bugReportModal');
    const close  = document.getElementById('bugModalClose');
    const cancel = document.getElementById('bugCancelBtn');
    const submit = document.getElementById('bugSubmitBtn');

    if (!btn || !modal) return;

    // Авто-выбор страницы в дропдауне по текущему URL
    const PAGE_MAP = {
        'index.html':      'Главная',
        'create-ad.html':  'Создание объявления',
        'profile.html':    'Профиль',
        'chat.html':       'Чат',
        'register.html':   'Регистрация / Вход',
        'servers.html':    'Выбор сервера',
        'stats.html':      'Статистика',
    };

    // Открытие
    btn.addEventListener('click', () => {
        // Авто-выбираем страницу
        const fileName = window.location.pathname.split('/').pop() || 'index.html';
        const humanPage = PAGE_MAP[fileName] || 'Главная';
        const pageSelect = document.getElementById('bugPage');
        if (pageSelect) {
            for (const opt of pageSelect.options) {
                if (opt.value === humanPage) { opt.selected = true; break; }
            }
        }
        modal.classList.remove('hidden');
        closeProfileMenu();
        document.getElementById('bugDescription')?.focus();
    });

    // Прикрепление фото
    const photoInput = document.getElementById('bugPhotoInput');
    const photoZone  = document.getElementById('bugPhotoZone');
    let bugPhotoBase64 = null;

    photoInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showToast('Файл слишком большой (максимум 5MB)', 'warning');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            bugPhotoBase64 = ev.target.result;
            document.getElementById('bugPhotoPlaceholder').style.display = 'none';
            document.getElementById('bugPhotoPreview').style.display = 'block';
            document.getElementById('bugPhotoImg').src = bugPhotoBase64;
            document.getElementById('bugPhotoName').textContent = file.name;
            photoZone.style.borderColor = 'rgba(255,30,30,0.4)';
        };
        reader.readAsDataURL(file);
    });

    window.removeBugPhoto = function() {
        bugPhotoBase64 = null;
        photoInput.value = '';
        document.getElementById('bugPhotoPlaceholder').style.display = 'block';
        document.getElementById('bugPhotoPreview').style.display = 'none';
        photoZone.style.borderColor = 'rgba(255,255,255,0.12)';
    };

    // Drag & drop на зону
    photoZone?.addEventListener('dragover', e => { e.preventDefault(); photoZone.style.borderColor = 'rgba(255,30,30,0.5)'; });
    photoZone?.addEventListener('dragleave', () => { if (!bugPhotoBase64) photoZone.style.borderColor = 'rgba(255,255,255,0.12)'; });
    photoZone?.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const dt = new DataTransfer();
            dt.items.add(file);
            photoInput.files = dt.files;
            photoInput.dispatchEvent(new Event('change'));
        }
    });

    // Закрытие
    const closeFn = () => {
        modal.classList.add('hidden');
        window.removeBugPhoto?.();
        document.getElementById('bugDescription').value = '';
    };
    close?.addEventListener('click', closeFn);
    cancel?.addEventListener('click', closeFn);
    modal.addEventListener('click', e => { if (e.target === modal) closeFn(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFn(); });

    // Отправка
    submit?.addEventListener('click', async () => {
        const type = document.getElementById('bugType')?.value;
        const desc = document.getElementById('bugDescription')?.value.trim();
        const page = document.getElementById('bugPage')?.value;

        if (!desc) {
            showToast('Опишите проблему', 'warning');
            return;
        }

        submit.disabled = true;
        submit.innerHTML = '<i data-lucide="loader" width="14" height="14"></i> Отправляем...';

        try {
            // Сжимаем скриншот перед отправкой — баг-репорт теперь свой
            // отдельный документ (bugReports/{id}), но всё равно нет
            // смысла таскать по сети и хранить фото в исходном виде до 5MB
            const compressedPhoto = bugPhotoBase64
                ? await compressImage(bugPhotoBase64, 480, 0.5)
                : null;

            const success = await saveBugReport({
                id: Date.now(),
                type,
                description: desc,
                page,
                photo: compressedPhoto,
                author: currentUser?.nickname || 'anonymous',
                server: currentUser?.server || null,
                ua: navigator.userAgent.substring(0, 150),
                createdAt: new Date().toISOString(),
                status: 'new'
            });

            if (!success) {
                showToast('Ошибка отправки. Попробуй снова', 'error');
                return;
            }

            showToast('Спасибо! Баг-репорт отправлен', 'success');
            closeFn();

        } catch (e) {
            console.error('Ошибка отправки баг-репорта:', e);
            showToast('Ошибка отправки. Попробуй снова', 'error');
        } finally {
            submit.disabled = false;
            submit.innerHTML = '<i data-lucide="send" width="14" height="14"></i> Отправить';
            if (window.lucide) lucide.createIcons();
        }
    });
}