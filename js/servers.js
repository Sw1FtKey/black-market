// ===== ИМПОРТ FIREBASE =====
import { getAllAds, saveUser, getBannedUsers } from './api.js';
import { ALL_SERVERS } from './servers-data.js';

let adCountsCache = {};

const servers = ALL_SERVERS;

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
    } catch (e) { console.error('Ошибка загрузки счётчиков:', e); }
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
// users/{nickname} — один документ на пользователя (см. api.js). Не
// нужно больше читать всех пользователей, чтобы обновить одного — заодно
// пропадает гонка: раньше двое одновременно менявших сервер пользователей
// читали один и тот же массив и могли затереть правку друг друга при
// записи всего массива обратно.

// Получаем текущего пользователя (из localStorage — для скорости)
function getCurrentUser() {
    return JSON.parse(localStorage.getItem('currentUser'));
}

// Сохраняем текущего пользователя (localStorage + Firebase)
async function saveCurrentUser(user) {
    // Всегда сохраняем в localStorage для быстрого доступа
    localStorage.setItem('currentUser', JSON.stringify(user));

    // Синхронизируем с Firebase — апдейтим только свой документ
    try {
        await saveUser(user);
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
    const countText = '<i data-lucide="clipboard-list" width="13" height="13"></i> ' + count + ' объявл.';
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.alignItems = 'center';
    div.style.justifyContent = 'center';
    div.style.gap = '4px';
    div.innerHTML = '<div class="server-card-name">' + server.name + '</div>'
        + '<div class="server-card-count">' + countText + '</div>';

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
        if (window.lucide) lucide.createIcons();
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
                <p style="font-size: 18px; margin-bottom: 10px;"><i data-lucide="frown" width="18" height="18"></i> Ничего не найдено</p>
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

    servers.forEach(server => {
        grid.appendChild(createServerCard(server));
    });

    const resultsCount = document.getElementById('searchResultsCount');
    if (resultsCount) {
        resultsCount.textContent = `Всего серверов: ${servers.length}`;
    }
}

// ===== TOAST УВЕДОМЛЕНИЯ =====
function showToast(message, type = 'info') {
    document.querySelectorAll('.bm-toast').forEach(t => t.remove());
    const colors = {
        success: { bg: '#1a2e1a', border: '#4caf50', icon: '<i data-lucide="check" width="13" height="13"></i>', iconColor: '#4caf50' },
        error:   { bg: '#2e1a1a', border: '#f44336', icon: '<i data-lucide="x" width="13" height="13"></i>', iconColor: '#f44336' },
        warning: { bg: '#2e2a1a', border: '#ff9800', icon: '!', iconColor: '#ff9800' },
        info:    { bg: '#1a1e2e', border: '#2196f3', icon: 'i', iconColor: '#2196f3' }
    };
    const c = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.className = 'bm-toast';
    toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-80px);background:${c.bg};border:1.5px solid ${c.border};color:white;padding:14px 20px;border-radius:12px;z-index:99999;font-size:14px;font-weight:500;display:flex;align-items:center;gap:10px;min-width:260px;max-width:90vw;box-shadow:0 8px 24px rgba(0,0,0,0.5);transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.3s ease;opacity:0;`;
    toast.innerHTML = `<span style="width:22px;height:22px;border-radius:50%;background:${c.border}22;border:1.5px solid ${c.border};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${c.iconColor};flex-shrink:0;">${c.icon}</span><span>${message}</span>`;
    document.body.appendChild(toast);
    if (window.lucide) lucide.createIcons();
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
        const bannedUsers = await getBannedUsers();

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
