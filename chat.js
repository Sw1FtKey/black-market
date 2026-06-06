// ===== CHAT MODULE =====
import { db } from './firebase-config.js';
import { 
    doc, getDoc, setDoc, updateDoc, onSnapshot,
    collection, query, orderBy, addDoc, writeBatch, where, getDocs,
    limit, limitToLast, startAfter, endBefore, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const currentUser = JSON.parse(localStorage.getItem('currentUser'));
if (!currentUser) window.location.href = 'register.html';

// ===== ГЕНЕРАЦИЯ ID ЧАТА =====
function getChatId(user1, user2) {
    const sorted = [user1, user2].sort();
    return `${sorted[0]}_${sorted[1]}`;
}

// ===== СОЗДАНИЕ ЧАТА =====
export async function createChat(otherUserNickname, adId, adTitle) {
    if (otherUserNickname === currentUser.nickname) {
        showToast('Нельзя написать самому себе!', 'error');
        return null;
    }
    
    const chatId = getChatId(currentUser.nickname, otherUserNickname);
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    
    if (!chatSnap.exists()) {
        await setDoc(chatRef, {
            participants: [currentUser.nickname, otherUserNickname],
            adId: adId,
            adTitle: adTitle,
            createdAt: new Date().toISOString(),
            lastMessage: null,
            lastMessageAt: null
        });
        
        const batch = writeBatch(db);
        const userChatData = {
            chatId: chatId,
            otherUser: otherUserNickname,
            adId: adId,
            adTitle: adTitle,
            lastMessage: 'Начните общение...',
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0
        };
        
        batch.set(doc(db, 'userChats', currentUser.nickname, 'chats', chatId), userChatData);
        batch.set(doc(db, 'userChats', otherUserNickname, 'chats', chatId), {
            ...userChatData,
            otherUser: currentUser.nickname,
            unreadCount: 1
        });
        
        await batch.commit();
    }
    
    return chatId;
}

// ===== ОТПРАВКА СООБЩЕНИЯ =====
export async function sendMessage(chatId, text) {
    if (!text.trim()) return false;
    
    const message = {
        sender: currentUser.nickname,
        text: text.trim(),
        timestamp: new Date().toISOString(),
        read: false
    };
    
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    await addDoc(messagesRef, message);
    
    // Читаем данные чата и счётчик непрочитанных параллельно
    const chatRef = doc(db, 'chats', chatId);
    const otherUserChatRef = doc(db, 'userChats', currentUser.nickname, 'chats', chatId);
    
    const [chatSnap, myUserChatSnap] = await Promise.all([
        getDoc(chatRef),
        getDoc(otherUserChatRef)
    ]);
    
    const chatData = chatSnap.data();
    const otherUser = chatData.participants.find(p => p !== currentUser.nickname);
    const otherUserChatRefFull = doc(db, 'userChats', otherUser, 'chats', chatId);
    const otherUserChatSnap = await getDoc(otherUserChatRefFull);
    const currentUnread = otherUserChatSnap.exists() ? (otherUserChatSnap.data().unreadCount || 0) : 0;

    const batch = writeBatch(db);
    batch.update(chatRef, {
        lastMessage: text.trim(),
        lastMessageAt: message.timestamp
    });
    batch.update(doc(db, 'userChats', currentUser.nickname, 'chats', chatId), {
        lastMessage: text.trim(),
        lastMessageAt: message.timestamp
    });
    batch.set(otherUserChatRefFull, {
        chatId: chatId,
        otherUser: currentUser.nickname,
        adId: chatData.adId,
        adTitle: chatData.adTitle,
        lastMessage: text.trim(),
        lastMessageAt: message.timestamp,
        unreadCount: currentUnread + 1
    }, { merge: true });
    
    await batch.commit();
    return true;
}

// ===== ПОМЕТИТЬ ПРОЧИТАННЫМ =====
export async function markAsRead(chatId) {
    const userChatRef = doc(db, 'userChats', currentUser.nickname, 'chats', chatId);
    await updateDoc(userChatRef, { unreadCount: 0 });
    
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, where('sender', '!=', currentUser.nickname), where('read', '==', false));
    const snapshot = await getDocs(q);
    
    const batch = writeBatch(db);
    snapshot.docs.forEach(docSnap => {
        batch.update(docSnap.ref, { read: true });
    });
    await batch.commit();
}

// ===== ПОДПИСКИ (реальное время) =====

const MESSAGES_PER_PAGE = 50; // сколько сообщений грузим за раз

// subscribeToMessages — грузит последние MESSAGES_PER_PAGE сообщений
// возвращает { unsubscribe, loadMore }
// loadMore() — подгружает ещё MESSAGES_PER_PAGE сообщений выше
export function subscribeToMessages(chatId, callback) {
    const messagesRef = collection(db, 'chats', chatId, 'messages');

    // Состояние пагинации
    let oldestDoc = null;       // самый старый загруженный документ
    let allMessages = [];       // все загруженные сообщения (накопительно)
    let hasMore = true;         // есть ли ещё старые сообщения
    let unsubscribeFn = null;

    // Подписываемся на последние N сообщений в реальном времени
    const q = query(messagesRef, orderBy('timestamp', 'asc'), limitToLast(MESSAGES_PER_PAGE));
    unsubscribeFn = onSnapshot(q, (snapshot) => {
        const fresh = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        // Запоминаем самый старый документ для подгрузки
        if (snapshot.docs.length > 0 && oldestDoc === null) {
            oldestDoc = snapshot.docs[0];
            // Если вернулось меньше лимита — старых сообщений больше нет
            hasMore = snapshot.docs.length >= MESSAGES_PER_PAGE;
        }

        // Мерджим: старые сообщения (из loadMore) + свежие из подписки
        const oldIds = new Set(allMessages.map(m => m.id));
        const newFresh = fresh.filter(m => !oldIds.has(m.id));
        allMessages = [...allMessages, ...newFresh];

        callback(allMessages, hasMore);
    });

    // Подгрузка старых сообщений (вызывается при скролле вверх)
    async function loadMore() {
        if (!hasMore || !oldestDoc) return;

        const q2 = query(
            messagesRef,
            orderBy('timestamp', 'asc'),
            endBefore(oldestDoc),
            limitToLast(MESSAGES_PER_PAGE)
        );

        const snap = await getDocs(q2);
        if (snap.empty) {
            hasMore = false;
            callback(allMessages, false);
            return;
        }

        const older = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        oldestDoc = snap.docs[0];
        hasMore = snap.docs.length >= MESSAGES_PER_PAGE;

        // Вставляем старые сообщения в начало
        allMessages = [...older, ...allMessages];
        callback(allMessages, hasMore);
    }

    return {
        unsubscribe: () => unsubscribeFn && unsubscribeFn(),
        loadMore
    };
}

export function subscribeToChats(callback) {
    const chatsRef = collection(db, 'userChats', currentUser.nickname, 'chats');
    
    // Простой запрос без сортировки (не требует индекса)
    return onSnapshot(chatsRef, (snapshot) => {
        const chats = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            ...doc.data() 
        }));
        
        // Сортируем вручную в памяти
        chats.sort((a, b) => {
            const timeA = a.lastMessageAt || '1970-01-01T00:00:00.000Z';
            const timeB = b.lastMessageAt || '1970-01-01T00:00:00.000Z';
            return timeB.localeCompare(timeA); // Новые сверху
        });
        
        callback(chats);
    }, (error) => {
        console.error('Ошибка загрузки чатов:', error);
        callback([]); // Пустой массив при ошибке
    });
}

export function subscribeToUnreadCount(callback) {
    const chatsRef = collection(db, 'userChats', currentUser.nickname, 'chats');
    return onSnapshot(chatsRef, (snapshot) => {
        let total = 0;
        snapshot.docs.forEach(doc => {
            total += doc.data().unreadCount || 0;
        });
        callback(total);
    });
}

// ===== TOAST =====
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = message;
    const colors = { success: '#4caf50', error: '#f44336', info: '#2196f3' };
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        background: ${colors[type]}; color: white;
        padding: 15px 25px; border-radius: 10px;
        z-index: 9999; font-weight: 600;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}