// ===== ИМПОРТ FIREBASE =====
import { db } from './firebase-config.js';
import { getAllAds } from './api.js';
import { ZBT_MODE, ZBT_SERVER } from './firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// В ЗБТ-режиме доступен только один сервер
const ALL_SERVERS = [
    // === БАЗОВЫЕ ЦВЕТА (RED - SPB) ===
    { name: "RED", color: "#ff2b2b" },
    { name: "GREEN", color: "#2bff4a" },
    { name: "BLUE", color: "#2b6bff" },
    { name: "YELLOW", color: "#ffe600" },
    { name: "ORANGE", color: "#ff8c1a" },
    { name: "PURPLE", color: "#a64dff" },
    { name: "LIME", color: "#9dff00" },
    { name: "PINK", color: "#ff4fd8" },
    { name: "CHERRY", color: "#b3003b" },
    { name: "BLACK", color: "#111111" },
    { name: "INDIGO", color: "#4b0082" },
    { name: "WHITE", color: "#dddddd" },
    { name: "MAGENTA", color: "#ff00ff" },
    { name: "CRIMSON", color: "#dc143c" },
    { name: "GOLD", color: "#ffd700" },
    { name: "AZURE", color: "#007fff" },
    { name: "PLATINUM", color: "#e5e4e2" },
    { name: "AQUA", color: "#00ffff" },
    { name: "GRAY", color: "#808080" },
    { name: "ICE", color: "#b3f0ff" },
    { name: "CHILLI", color: "#ff3c00" },
    { name: "CHOCO", color: "#5a2d0c" },
    { name: "MOSCOW", color: "#c70000" },
    { name: "SPB", color: "#005eff" },
    { name: "UFA", color: "#ffc107" },
    { name: "SOCHI", color: "#00bcd4" },
    { name: "KAZAN", color: "#2196f3" },
    { name: "SAMARA", color: "#9c27b0" },
    { name: "ROSTOV", color: "#ff9800" },
    { name: "ANAPA", color: "#03a9f4" },
    { name: "EKB", color: "#8bc34a" },
    { name: "KRASNODAR", color: "#d84315" },
    { name: "ARZAMAS", color: "#76ff03" },
    { name: "NOVOSIB", color: "#7cb342" },
    { name: "GROZNY", color: "#4caf50" },
    { name: "SARATOV", color: "#1976d2" },
    { name: "OMSK", color: "#80cbc4" },
    { name: "IRKUTSK", color: "#4fc3f7" },
    { name: "VOLGOGRAD", color: "#d32f2f" },
    { name: "VORONEZH", color: "#ffeb3b" },
    { name: "BELGOROD", color: "#1a237e" },
    { name: "MAKHACHKALA", color: "#4caf50" },
    { name: "VLADIKAVKAZ", color: "#78909c" },
    { name: "VLADIVOSTOK", color: "#1976d2" },
    { name: "KALININGRAD", color: "#d7ccc8" },
    { name: "CHELYABINSK", color: "#ef6c00" },
    { name: "KRASNOYARSK", color: "#ff6d00" },
    { name: "CHEBOKSARY", color: "#66bb6a" },
    { name: "KHABAROVSK", color: "#1976d2" },
    { name: "PERM", color: "#ffeb3b" },
    { name: "TULA", color: "#ffa726" },
    { name: "RYAZAN", color: "#9c27b0" },
    { name: "MURMANSK", color: "#1976d2" },
    { name: "PENZA", color: "#80cbc4" },
    { name: "KURSK", color: "#8d4004" },
    { name: "ARKHANGELSK", color: "#e91e63" },
    { name: "ORENBURG", color: "#e65100" },
    { name: "KIROV", color: "#9e9e9e" },
    { name: "KEMEROVO", color: "#d32f2f" },
    { name: "TYUMEN", color: "#4fc3f7" },
    { name: "TOLYATTI", color: "#9c27b0" },
    { name: "IVANOVO", color: "#d7ccc8" },
    { name: "STAVROPOL", color: "#1976d2" },
    { name: "SMOLENSK", color: "#8d6e63" },
    { name: "PSKOV", color: "#7cb342" },
    { name: "BRYANSK", color: "#00bcd4" },
    { name: "OREL", color: "#ffeb3b" },
    { name: "YAROSLAVL", color: "#d32f2f" },
    { name: "BARNAUL", color: "#7986cb" },
    { name: "LIPETSK", color: "#9e9e9e" },
    { name: "ULYANOVSK", color: "#8d6e63" },
    { name: "YAKUTSK", color: "#4fc3f7" },
    { name: "TAMBOV", color: "#9e9e9e" },
    { name: "BRATSK", color: "#d7ccc8" },
    { name: "ASTRAKHAN", color: "#d32f2f" },
    { name: "CHITA", color: "#4caf50" },
    { name: "KOSTROMA", color: "#ffeb3b" },
    { name: "VLADIMIR", color: "#ff9800" },
    { name: "KALUGA", color: "#1976d2" },
    { name: "NOVGOROD", color: "#ffeb3b" },
    { name: "TAGANROG", color: "#9c27b0" },
    { name: "VOLOGDA", color: "#d32f2f" },
    { name: "TVER", color: "#1976d2" },
    { name: "TOMSK", color: "#4caf50" },
    { name: "IZHEVSK", color: "#00bcd4" },
    { name: "SURGUT", color: "#9c27b0" },
    { name: "PODOLSK", color: "#d7ccc8" },
    { name: "MAGADAN", color: "#9e9e9e" },
    { name: "CHEREPOVETS", color: "#1976d2" },
    { name: "NORILSK", color: "#4fc3f7" }
];

// Кэш количества объявлений по серверам
let adCountsCache = {};

// Активный список серверов — зависит от режима
const ZBT_SERVERS = [
    { name: ZBT_SERVER, color: '#ff1e1e' }
];
const servers = ZBT_MODE ? ZBT_SERVERS : ALL_SERVERS;

// Загружаем количество объявлений по серверам
async function loadAdCounts() {
    try {
        const ads = await getAllAds();
        adCountsCache = {};
        ads.forEach(ad => {
            if (ad.server) {
                const s = ad.server.toUpperCase();
                adCountsCache[s] = (adCountsCache[s] || 0) + 1;
            }
        });
    } catch (e) {
        console.error('Ошибка загрузки счётчиков:', e);
    }
}

// Функция для затемнения цвета
function darkenColor(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max((num >> 16) - amt, 0);
    const G = Math.max((num >> 8 & 0x00FF) - amt, 50);
    const B = Math.max((num & 0x0000FF) - amt, 50);
    return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// ===== РАБОТА С ПОЛЬЗОВАТЕЛЯМИ =====

// Получаем список всех пользователей из Firebase
async function getFirebaseUsers() {
    try {
        const docRef = doc(db, 'data', 'users');
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data().items || [] : [];
    } catch (e) {
        console.error('Ошибка загрузки пользователей:', e);
        return [];
    }
}

// Сохраняем список пользователей в Firebase
async function saveFirebaseUsers(users) {
    try {
        await setDoc(doc(db, 'data', 'users'), { items: users });
    } catch (e) {
        console.error('Ошибка сохранения пользователей:', e);
    }
}

// Получаем текущего пользователя (из localStorage — для скорости)
function getCurrentUser() {
    return JSON.parse(localStorage.getItem('currentUser'));
}

// Сохраняем текущего пользователя (localStorage + Firebase)
async function saveCurrentUser(user) {
    // Всегда сохраняем в localStorage для быстрого доступа
    localStorage.setItem('currentUser', JSON.stringify(user));
    
    // Синхронизируем с Firebase
    try {
        const users = await getFirebaseUsers();
        const index = users.findIndex(u => u.nickname === user.nickname);
        
        if (index !== -1) {
            // Обновляем существующего
            users[index] = user;
        } else {
            // Добавляем нового
            users.push(user);
        }
        
        await saveFirebaseUsers(users);
        console.log('Пользователь сохранён в Firebase');
    } catch (e) {
        console.error('Ошибка синхронизации с Firebase:', e);
    }
}

// Получаем сохранённый сервер
function getLastServer() {
    const user = getCurrentUser();
    return user ? user.server : null;
}

// Сохраняем выбранный сервер
async function saveServer(serverName) {
    const user = getCurrentUser();
    if (!user) {
        window.location.href = 'register.html';
        return;
    }
    
    user.server = serverName;
    await saveCurrentUser(user); 
}



// Создаём HTML карточки сервера
function createServerCard(server, isLarge = false) {
    const div = document.createElement('div');
    
    if (isLarge) {
        // Для большой карточки — применяем стили напрямую
        div.style.width = '300px';
        div.style.height = '180px';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'center';
        div.style.fontSize = '32px';
        div.style.borderRadius = '20px';
        div.className = 'server-card'; // оставляем класс для hover-эффектов
    } else {
        div.className = 'server-card';
    }
    
    const count = adCountsCache[server.name] || 0;
    const countText = count > 0 ? ('📋 ' + count + ' объявл.') : '📋 0 объявл.';
    if (isLarge) {
        div.innerHTML = '<div style="font-weight:700;font-size:32px;">' + server.name + '</div>'
            + '<div style="font-size:13px;opacity:0.7;margin-top:6px;">' + countText + '</div>';
    } else {
        div.innerHTML = '<div style="font-weight:700;">' + server.name + '</div>'
            + '<div style="font-size:11px;opacity:0.7;margin-top:4px;">' + countText + '</div>';
    }

    let mainColor = server.color;
    let darkColor;
    let glowColor;

    if (server.name === 'BLACK') {
        mainColor = '#333333';
        darkColor = '#1a1a1a';
        glowColor = '#555555';
    } else if (server.name === 'WHITE') {
        mainColor = '#888888';
        darkColor = '#555555';
        glowColor = '#aaaaaa';
    } else {
        darkColor = darkenColor(server.color, 40);
        glowColor = server.color;
    }

    div.style.setProperty('--server-color', mainColor);
    div.style.setProperty('--server-color-dark', darkColor);
    div.style.setProperty('--server-color-glow', glowColor);

    div.addEventListener('click', () => {
        saveServer(server.name);
        window.location.href = 'index.html';
    });

    return div;
}



// Отрисовка последнего сервера
function renderLastServer() {
    const lastServerName = getLastServer();
    const container = document.getElementById('lastServerCard');
    container.innerHTML = '';

    if (lastServerName) {
        const server = servers.find(s => s.name === lastServerName);
        if (server) {
            // Создаём обёртку для большой карточки
            const card = createServerCard(server, true);
            container.appendChild(card);
        }
    } else {
        container.innerHTML = '<p style="color: #888;">Сервер не выбран</p>';
    }
}

// Переключение режимов
function showMyServer() {
    document.getElementById('singleServerView').classList.remove('hidden');
    document.getElementById('serversGrid').classList.add('hidden');
    document.getElementById('myServerBtn').classList.add('active');
    document.getElementById('allServersBtn').classList.remove('active');
    // Скрываем поиск в режиме "мой сервер"
    const searchContainer = document.getElementById('serverSearchContainer');
    if (searchContainer) searchContainer.style.display = 'none';
    renderLastServer();
}

function showAllServers() {
    document.getElementById('singleServerView').classList.add('hidden');
    document.getElementById('serversGrid').classList.remove('hidden');
    document.getElementById('myServerBtn').classList.remove('active');
    document.getElementById('allServersBtn').classList.add('active');
    
    // Показываем поиск
    const searchContainer = document.getElementById('serverSearchContainer');
    if (searchContainer) searchContainer.style.display = 'block';
    
    renderAllServers();
    setupSearch(); // подключаем поиск
}
// ===== ПОИСК СЕРВЕРОВ =====
let searchTimeout = null;

function setupSearch() {
    const input = document.getElementById('serverSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const resultsCount = document.getElementById('searchResultsCount');
    
    if (!input) return;
    
    // Очищаем старые слушатели (если есть)
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    newInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        // Показываем/скрываем кнопку очистки
        clearBtn.style.display = query ? 'block' : 'none';
        
        // Дебаунс 300мс
        searchTimeout = setTimeout(() => {
            filterServers(query);
        }, 300);
    });
    
    // Кнопка очистки
    clearBtn.addEventListener('click', () => {
        newInput.value = '';
        clearBtn.style.display = 'none';
        filterServers('');
        newInput.focus();
    });
    
    // Фокус при открытии
    setTimeout(() => newInput.focus(), 100);
}

function filterServers(query) {
    const grid = document.getElementById('serversGrid');
    const resultsCount = document.getElementById('searchResultsCount');
    
    if (!query) {
        // Пустой поиск — показываем все
        renderAllServers();
        resultsCount.textContent = `Всего серверов: ${servers.length}`;
        return;
    }
    
    const lowerQuery = query.toLowerCase();
    const filtered = servers.filter(s => 
        s.name.toLowerCase().includes(lowerQuery)
    );
    
    // Рендерим отфильтрованные
    grid.innerHTML = '';
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: #888;">
                <p style="font-size: 18px; margin-bottom: 10px;">😕 Ничего не найдено</p>
                <p style="font-size: 14px;">Попробуйте другой запрос</p>
            </div>
        `;
    } else {
        filtered.forEach(server => {
            grid.appendChild(createServerCard(server));
        });
    }
    
    resultsCount.textContent = `Найдено: ${filtered.length} из ${servers.length}`;
}

// Обновляем renderAllServers чтобы показывать счётчик
function renderAllServers() {
    const grid = document.getElementById('serversGrid');
    grid.innerHTML = '';

    if (ZBT_MODE) {
        // В ЗБТ режиме — только один сервер + баннер
        const searchContainer = document.getElementById('serverSearchContainer');
        if (searchContainer) searchContainer.style.display = 'none';

        const banner = document.createElement('div');
        banner.style.cssText = `
            grid-column:1/-1;
            background:rgba(255,30,30,0.08);
            border:1px solid rgba(255,30,30,0.25);
            border-radius:14px; padding:16px 20px;
            margin-bottom:8px; text-align:center;
        `;
        banner.innerHTML = `
            <div style="font-size:18px;margin-bottom:4px;">🚀 Закрытое бета-тестирование</div>
            <div style="color:#aaa;font-size:13px;">Во время ЗБТ доступен один сервер. После релиза откроются все сервера.</div>
        `;
        grid.appendChild(banner);
    }

    servers.forEach(server => {
        grid.appendChild(createServerCard(server));
    });

    const resultsCount = document.getElementById('searchResultsCount');
    if (resultsCount) {
        resultsCount.textContent = ZBT_MODE ? '' : `Всего серверов: ${servers.length}`;
    }
}

// ===== TOAST УВЕДОМЛЕНИЯ =====
function showToast(message, type = 'info') {
    document.querySelectorAll('.bm-toast').forEach(t => t.remove());
    const colors = {
        success: { bg: '#1a2e1a', border: '#4caf50', icon: '✓', iconColor: '#4caf50' },
        error:   { bg: '#2e1a1a', border: '#f44336', icon: '✕', iconColor: '#f44336' },
        warning: { bg: '#2e2a1a', border: '#ff9800', icon: '!', iconColor: '#ff9800' },
        info:    { bg: '#1a1e2e', border: '#2196f3', icon: 'i', iconColor: '#2196f3' }
    };
    const c = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.className = 'bm-toast';
    toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-80px);background:${c.bg};border:1.5px solid ${c.border};color:white;padding:14px 20px;border-radius:12px;z-index:99999;font-size:14px;font-weight:500;display:flex;align-items:center;gap:10px;min-width:260px;max-width:90vw;box-shadow:0 8px 24px rgba(0,0,0,0.5);transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s ease;opacity:0;`;
    toast.innerHTML = `<span style="width:22px;height:22px;border-radius:50%;background:${c.border}22;border:1.5px solid ${c.border};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${c.iconColor};flex-shrink:0;">${c.icon}</span><span>${message}</span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.transform='translateX(-50%) translateY(0)'; toast.style.opacity='1'; });
    setTimeout(() => { toast.style.transform='translateX(-50%) translateY(-80px)'; toast.style.opacity='0'; setTimeout(() => toast.remove(), 300); }, type === 'error' || type === 'warning' ? 3500 : 2500);
}
// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', async () => {  
    
    // Проверяем авторизацию
    const currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'register.html';
        return;
    }
    
    // Проверяем бан статус (как в register.js)
    try {
        const docRef = doc(db, 'data', 'bannedUsers');
        const docSnap = await getDoc(docRef);
        const bannedUsers = docSnap.exists() ? docSnap.data().items || {} : {};
        
        const banInfo = bannedUsers[currentUser.nickname];
        if (banInfo) {
            if (banInfo.until === 'permanent' || Date.now() < banInfo.until) {
                showToast('Ваш аккаунт заблокирован!', 'error');
                localStorage.removeItem('currentUser');
                setTimeout(() => window.location.href = 'register.html', 1500);
                return;
            }
        }
    } catch (e) {
        console.error('Ошибка проверки бана:', e);
    }

    await loadAdCounts();

    const lastServer = getLastServer();
    
    // Если есть последний сервер — показываем его, иначе сразу все сервера
    if (lastServer) {
        showMyServer();
    } else {
        showAllServers();
        document.getElementById('myServerBtn').style.display = 'none';
    }

    // Обработчики кнопок
    document.getElementById('myServerBtn').addEventListener('click', showMyServer);
    document.getElementById('allServersBtn').addEventListener('click', showAllServers);
    document.getElementById('changeServerBtn').addEventListener('click', showAllServers);
});
