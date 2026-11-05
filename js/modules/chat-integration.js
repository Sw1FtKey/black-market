// ===== CHAT-INTEGRATION — роль пользователя, бейдж непрочитанных сообщений, уведомления =====
import { db } from '../firebase-config.js';
import { showToast } from '../utils.js';
import { currentUser } from './main.js';
import { applySidebarRole } from './sidebar.js';

let _userRole = null;

let _roleLoaded = false;

export async function checkUserRole() {
    if (!currentUser) return;
    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const snap = await getDoc(doc(db, 'data', 'roles'));
        const roles = snap.exists() ? snap.data().items || {} : {};
        // Проверяем по нижнему регистру для надёжности
        _userRole = roles[currentUser.nickname] || roles[currentUser.nickname?.toLowerCase()] || null;
        _roleLoaded = true;

        // Показываем кнопку админки только если есть роль
        if (_userRole) {
            document.querySelectorAll('.admin-only').forEach(el => el.style.removeProperty('display'));
        }
        // Элементы только для владельца (например, логи ошибок)
        if (_userRole === 'owner') {
            document.querySelectorAll('.owner-only').forEach(el => el.style.removeProperty('display'));
        }
        // Ролевая плашка в шторке
        applySidebarRole(_userRole);
    } catch (e) {
        console.error('Ошибка загрузки роли:', e);
        _roleLoaded = true;
    }
}

export function hasRole(minRole) {
    const levels = { moder: 1, admin: 2, owner: 3 };
    const myLevel = levels[_userRole] || 0;
    const required = levels[minRole] || 99;
    return myLevel >= required;
}

let unreadCountUnsubscribe = null;

// Браузеры разрешают запрашивать доступ к уведомлениям ТОЛЬКО из обработчика
// действия пользователя (клик, нажатие клавиши, касание). Раньше запрос
// отправлялся прямо при загрузке страницы — Firefox его отклонял с ошибкой
// «разрешение может быть предоставлено только для пользовательского
// короткоживущего обработчика события», и разрешение не запрашивалось
// никогда. Теперь ждём первого действия пользователя на странице и
// спрашиваем один раз. Если уведомления не поддерживаются (например, обычная
// вкладка iPhone) или решение уже принято — ничего не делаем.
function armNotificationPrompt() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    const events = ['click', 'keydown', 'touchend'];
    const ask = () => {
        events.forEach(e => document.removeEventListener(e, ask, true));
        try {
            const result = Notification.requestPermission();
            if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch (e) { /* старый браузер или запрет — уведомления просто не будут показаны */ }
    };
    events.forEach(e => document.addEventListener(e, ask, true));
}

function showChatNotification(count) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // не показываем если вкладка активна

    new Notification('Black Market', {
        body: `У вас ${count} непрочитанных сообщений`,
        icon: 'logo.svg',
        badge: 'logo.svg',
        tag: 'chat-notification', // заменяет предыдущее вместо стека
        silent: false
    });
}

let _prevUnreadCount = 0;

const BASE_TITLE = 'Black Market';
function updateTabTitle(count) {
    document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
}

export async function initChat() {
    try {
        // Разрешение на уведомления спрашиваем на первом действии пользователя
        // и НЕ ждём ответа: значок непрочитанных сообщений должен работать
        // независимо от того, разрешил ли человек уведомления.
        armNotificationPrompt();

        const { subscribeToUnreadCount } = await import('../chat.js');
        unreadCountUnsubscribe = subscribeToUnreadCount((count) => {
            const badge = document.getElementById('chatCount');
            if (badge) {
                badge.textContent = count;
                badge.classList.toggle('hidden', count === 0);
            }

            // Всплывающее уведомление — только если счётчик вырос
            if (count > _prevUnreadCount) showChatNotification(count);

            // Заголовок вкладки показывает актуальное число (и сбрасывается,
            // когда сообщений не осталось — раньше "(3) Black Market" висел
            // до следующей смены вкладки)
            updateTabTitle(count);
            _prevUnreadCount = count;
        });
    } catch (e) {
        console.log('Chat not loaded:', e);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateTabTitle(_prevUnreadCount);
});

window.addEventListener('beforeunload', () => {
    if (unreadCountUnsubscribe) unreadCountUnsubscribe();
});

window.startChat = async function(author, adId, adTitle) {
    try {
        const { createChat } = await import('../chat.js');
        const chatId = await createChat(author, adId, adTitle);
        if (chatId) {
            window.location.href = `chat.html?with=${encodeURIComponent(author)}&adId=${adId}&adTitle=${encodeURIComponent(adTitle)}`;
        }
    } catch (e) {
        console.error('Chat error:', e);
        showToast('Ошибка открытия чата', 'error');
    }
};