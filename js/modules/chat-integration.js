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

async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
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

export async function initChat() {
    try {
        // Запрашиваем разрешение на уведомления
        await requestNotificationPermission();

        const { subscribeToUnreadCount } = await import('../chat.js');
        unreadCountUnsubscribe = subscribeToUnreadCount((count) => {
            const badge = document.getElementById('chatCount');
            if (badge) {
                badge.textContent = count;
                badge.classList.toggle('hidden', count === 0);
            }

            // Показываем уведомление только если счётчик вырос
            if (count > _prevUnreadCount && _prevUnreadCount !== null) {
                showChatNotification(count);

                // Меняем title вкладки
                if (count > 0) {
                    document.title = `(${count}) Black Market`;
                } else {
                    document.title = 'Black Market';
                }
            }
            _prevUnreadCount = count;
        });
    } catch (e) {
        console.log('Chat not loaded:', e);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (_prevUnreadCount > 0) {
            document.title = `(${_prevUnreadCount}) Black Market`;
        } else {
            document.title = 'Black Market';
        }
    }
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