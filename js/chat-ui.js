import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase-config.js';
import { showToast } from './utils.js';

import { 
    createChat, sendMessage, markAsRead, 
    subscribeToMessages, subscribeToChats 
} from './chat.js';

const currentUser = JSON.parse(localStorage.getItem('currentUser'));
let currentChatId = null;
let messagesUnsubscribe = null;
let chatsUnsubscribe = null;

// ===== UNSUBSCRIBE при уходе со страницы =====
window.addEventListener('beforeunload', () => {
    if (messagesUnsubscribe) messagesUnsubscribe();
    if (chatsUnsubscribe) chatsUnsubscribe();
});

// id входящих сообщений, для которых «прочитано» уже запрошено (чтобы не слать повторно)
const requestedRead = new Set();

// Вернулся на вкладку с открытым чатом — отмечаем накопившееся прочитанным
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentChatId) {
        markAsRead(currentChatId).catch(e => console.warn('markAsRead:', e?.code || e?.message));
    }
});

document.addEventListener('DOMContentLoaded', () => {
    loadChatList();
    
    const urlParams = new URLSearchParams(window.location.search);
    const withUser = urlParams.get('with');
    const adId = urlParams.get('adId');
    const adTitle = urlParams.get('adTitle'); // ← БЫЛО: не декодировано
    
    if (withUser) {
        const parsedAdId = adId ? parseInt(adId) : null;
        openChatWithUser(
            decodeURIComponent(withUser), 
            parsedAdId && !isNaN(parsedAdId) ? parsedAdId : null, 
            adTitle ? decodeURIComponent(adTitle) : null
        );
    }
});

function loadChatList() {
    const chatListEl = document.getElementById('chatList');
    chatsUnsubscribe = subscribeToChats((chats) => {
        if (chats.length === 0) {
            chatListEl.innerHTML = `
                <div class="empty-chat-list">
                    <div style="margin-bottom: 15px; color:#666; display:flex; justify-content:center;"><i data-lucide="message-circle" width="48" height="48"></i></div>
                    <p>У вас пока нет сообщений</p>
                    <p style="font-size: 13px; margin-top: 10px;">Напишите продавцу из объявления</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }
        
        // Фильтруем невалидные записи (например тестовые документы без otherUser)
        const validChats = chats.filter(chat => chat.otherUser && chat.chatId);
        chatListEl.innerHTML = validChats.map(chat => `
            <div class="chat-item ${chat.chatId === currentChatId ? 'active' : ''}" 
                data-chat-id="${escapeHtml(chat.chatId)}" onclick="selectChat(this.dataset.chatId, this)"
                 style="display: flex; align-items: center; gap: 12px; padding: 15px; border-radius: 12px; cursor: pointer; margin-bottom: 8px; ${chat.chatId === currentChatId ? 'background: rgba(255,30,30,0.2); border: 1px solid rgba(255,30,30,0.3);' : 'background: rgba(255,255,255,0.03);'}">
                <div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, #ff1e1e 0%, #cc0000 100%); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; color: white; flex-shrink: 0;">
                    ${escapeHtml(chat.otherUser.charAt(0).toUpperCase())}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(chat.otherUser)}</div>
                    <div style="font-size: 12px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(chat.adTitle || 'Объявление')}</div>
                    <div style="font-size: 13px; color: #aaa; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(chat.lastMessage || 'Нет сообщений')}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 11px; color: #666;">${formatTime(chat.lastMessageAt)}</div>
                    ${chat.unreadCount > 0 ? `<div style="background: #ff1e1e; color: white; font-size: 11px; font-weight: bold; min-width: 20px; height: 20px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-top: 5px;">${chat.unreadCount}</div>` : ''}
                </div>
            </div>
        `).join('');
        if (window.lucide) lucide.createIcons();
    });
}

window.selectChat = async function(chatId, clickedElement) {
    currentChatId = chatId;
    
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
        item.style.background = 'rgba(255,255,255,0.03)';
        item.style.border = 'none';
    });
    
    if (clickedElement) {
        clickedElement.classList.add('active');
        clickedElement.style.background = 'rgba(255,30,30,0.2)';
        clickedElement.style.border = '1px solid rgba(255,30,30,0.3)';
    }
    
    await markAsRead(chatId);
    loadMessages(chatId);
};

async function openChatWithUser(otherUser, adId, adTitle) {
    const chatId = await createChat(otherUser, adId, adTitle);
    if (chatId) {
        window.history.replaceState({}, document.title, 'chat.html');
        setTimeout(() => selectChat(chatId), 100);
    }
}

let currentChatData = null;

async function loadMessages(chatId) {
    if (messagesUnsubscribe) messagesUnsubscribe();
    
    const chatWindow = document.getElementById('chatWindow');
    chatWindow.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #666;"><p>Загрузка...</p></div>';
    chatWindow.classList.remove('empty');

    try {
        const chatRef = doc(db, 'userChats', currentUser.nickname, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);
        currentChatData = chatSnap.exists() ? chatSnap.data() : null;
    } catch (e) {
        console.error('Ошибка загрузки данных чата:', e);
        currentChatData = null;
    }
    
    let loadMoreFn = null;
    window._chatLoadMore = null;
    requestedRead.clear();

    const subscription = subscribeToMessages(chatId, (messages, hasMore) => {
        renderMessages(chatId, messages, hasMore, () => loadMoreFn && loadMoreFn());

        // Сообщения, пришедшие пока чат открыт, сразу помечаем прочитанными.
        // Раньше «прочитано» ставилось только при открытии диалога — счётчик в
        // списке чатов висел, а у отправителя не появлялась вторая галочка.
        const newUnread = messages
            .filter(m => m.sender !== currentUser.nickname && !m.read && !requestedRead.has(m.id))
            .map(m => m.id);
        if (newUnread.length && chatId === currentChatId && document.visibilityState === 'visible') {
            newUnread.forEach(id => requestedRead.add(id));
            markAsRead(chatId).catch(e => console.warn('markAsRead:', e?.code || e?.message));
        }
    });
    messagesUnsubscribe = () => subscription.unsubscribe();
    loadMoreFn = subscription.loadMore;
    window._chatLoadMore = subscription.loadMore;
}

async function renderMessages(chatId, messages, hasMore, onLoadMore) {
    const chatData = currentChatData;
    if (!chatData) return;

    // Перерисовка полная: запоминаем набранный текст и положение прокрутки,
    // иначе каждое новое сообщение или «прочитано» стирало бы черновик и
    // дёргало прокрутку вниз.
    const prevInput = document.getElementById('messageInput');
    const draft = prevInput ? prevInput.value : '';
    const hadFocus = !!prevInput && document.activeElement === prevInput;
    const prevContainer = document.getElementById('messagesContainer');
    const distFromBottom = prevContainer ? prevContainer.scrollHeight - prevContainer.scrollTop : null;
    
    const chatWindow = document.getElementById('chatWindow');
    chatWindow.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid rgba(255,255,255,0.1); background: rgba(17,17,17,0.9);">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #ff1e1e 0%, #cc0000 100%); display: flex; align-items: center; justify-content: center; font-weight: bold; color: white;">${escapeHtml(chatData.otherUser.charAt(0).toUpperCase())}</div>
                    <div>
                        <div style="color: white; font-weight: 600;">${escapeHtml(chatData.otherUser)}</div>
                        <div style="color: #888; font-size: 13px;">${escapeHtml(chatData.adTitle || '')}</div>
                    </div>
                </div>
            </div>
            
            <div id="messagesContainer" style="flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 12px; align-items: stretch;">
            ${hasMore ? `
                <div id="loadMoreBtn" style="text-align:center; padding: 8px 0 4px;">
                    <button onclick="window._chatLoadMore && window._chatLoadMore()" style="
                        padding: 8px 20px; background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.12); border-radius: 20px;
                        color: #888; font-size: 13px; cursor: pointer;
                        transition: all 0.2s;"
                        onmouseover="this.style.background='rgba(255,255,255,0.1)'"
                        onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                        ↑ Загрузить ещё сообщения
                    </button>
                </div>` : ''}
            ${messages.length === 0 ? '<div style="text-align: center; padding: 40px; color: #666;"><p>Начните общение первым 👋</p></div>' : messages.map(msg => {
    const isMyMessage = msg.sender === currentUser.nickname;
    return `
    <div style="max-width: 70%; min-width: 60px; width: fit-content; padding: 12px 16px; border-radius: 16px; ${isMyMessage ? 'margin-left: auto; background: linear-gradient(135deg, #ff1e1e 0%, #cc0000 100%); color: white; border-bottom-right-radius: 4px;' : 'margin-right: auto; background: rgba(255,255,255,0.1); color: white; border-bottom-left-radius: 4px;'}">
        <div style="line-height: 1.5; word-break: break-word;">${escapeHtml(msg.text)}</div>
        <div style="font-size: 11px; opacity: 0.9; margin-top: 5px; text-align: right; color: ${isMyMessage ? 'rgba(255,255,255,0.8)' : '#888'};">${formatTime(msg.timestamp)}</div>
        ${isMyMessage ? `<div style="margin-top: 3px; text-align: right; color: ${msg.read ? '#4caf50' : 'rgba(255,255,255,0.5)'}; display:flex; justify-content:flex-end;">${msg.read ? '<i data-lucide="check-check" width="14" height="14"></i>' : '<i data-lucide="check" width="14" height="14"></i>'}</div>` : ''}
    </div>
    `;
}).join('')}
            </div>
            
            <div style="padding: 15px 20px; border-top: 1px solid rgba(255,255,255,0.1); background: rgba(17,17,17,0.9);">
                <div style="display: flex; gap: 10px; align-items: flex-end;">
                    <textarea id="messageInput" placeholder="Напишите сообщение..." rows="1" maxlength="2000" style="flex: 1; padding: 12px 16px; border-radius: 12px; border: 2px solid rgba(255,255,255,0.1); background: rgba(34,34,34,0.8); color: white; font-size: 15px; resize: none; min-height: 44px; max-height: 120px; font-family: inherit;" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChatMessage();}"></textarea>
                    <button onclick="sendChatMessage()" id="sendBtn" style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #ff1e1e 0%, #cc0000 100%); border: none; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i data-lucide="send" width="18" height="18"></i></button>
                </div>
            </div>
        </div>
    `;
    
    const container = document.getElementById('messagesContainer');
    if (container) {
        // Первая отрисовка или человек у самого низа — вниз; иначе сохраняем
        // положение относительно низа (подгрузка старых сообщений не «прыгает»)
        const nearBottom = distFromBottom === null || (distFromBottom - container.clientHeight) < 80;
        container.scrollTop = nearBottom ? container.scrollHeight : container.scrollHeight - distFromBottom;
    }
    
    const textarea = document.getElementById('messageInput');
    if (textarea) {
        textarea.addEventListener('input', function() {
            this.style.height = '44px';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
        if (draft) {
            textarea.value = draft;
            textarea.style.height = '44px';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        }
        if (!prevInput || hadFocus) textarea.focus();
    }

    if (window.lucide) lucide.createIcons();
}

window.sendChatMessage = async function() {
    const input = document.getElementById('messageInput');
    const btn = document.getElementById('sendBtn');
    const text = input.value.trim();
    if (!text || !currentChatId) return;
    
    btn.disabled = true;
    let success = false;
    try {
        success = await sendMessage(currentChatId, text);
    } catch (e) {
        console.error('Ошибка отправки сообщения:', e);
        showToast('Не удалось отправить сообщение', 'error');
    }
    if (success) {
        input.value = '';
        input.style.height = '44px';
    }
    btn.disabled = false;
    input.focus();
};

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}