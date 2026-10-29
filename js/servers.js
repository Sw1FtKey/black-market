// ===== SERVERS — страница выбора сервера =====
import { getAllAds, updateUser, getBannedUsers } from './api.js';
import { ALL_SERVERS } from './servers-data.js';
import { showToast } from './utils.js';

// Первые серверы в списке — «цветные», дальше идут города (граница — MOSCOW).
const CITIES_START = ALL_SERVERS.findIndex(s => s.name === 'MOSCOW');
const SERVERS = ALL_SERVERS.map((s, i) => ({
    ...s,
    group: CITIES_START === -1 || i < CITIES_START ? 'colors' : 'cities'
}));

let adCounts = {};
let group = 'all';       // all | colors | cities
let query = '';

const $ = id => document.getElementById(id);

const ICON_CLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/></svg>';
const ICON_TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

// ===== ОБЪЯВЛЕНИЯ ПО СЕРВЕРАМ (счётчики на карточках) =====
async function loadAdCounts() {
    try {
        const ads = await getAllAds();
        adCounts = {};
        ads.forEach(ad => {
            if (ad.server) {
                const s = ad.server.toUpperCase();
                adCounts[s] = (adCounts[s] || 0) + 1;
            }
        });
    } catch (e) { console.error('Ошибка загрузки счётчиков:', e); }
}

// ===== ПОЛЬЗОВАТЕЛЬ / ВЫБРАННЫЙ СЕРВЕР =====
function getCurrentUser() {
    try { return JSON.parse(localStorage.getItem('currentUser')); } catch { return null; }
}

// Сохраняем выбранный сервер (localStorage + Firebase).
async function saveServer(serverName) {
    const user = getCurrentUser();
    if (!user) { window.location.href = 'register.html'; return; }

    user.server = serverName;
    localStorage.setItem('currentUser', JSON.stringify(user));

    // Точечно обновляем ТОЛЬКО поле server — раньше записывалась вся локальная
    // копия пользователя целиком, и устаревшая копия (без аватара/Telegram/
    // бейджей) затирала их в Firestore.
    try {
        await updateUser(user.nickname, { nickname: user.nickname, server: serverName });
    } catch (e) {
        console.error('Ошибка синхронизации сервера с Firebase:', e);
    }
}

function getLastServer() {
    const user = getCurrentUser();
    return user ? user.server : null;
}

// ===== ЦВЕТА КАРТОЧЕК =====
function darken(hex, percent) {
    const num = parseInt(hex.slice(1), 16), amt = Math.round(2.55 * percent);
    const R = Math.max((num >> 16) - amt, 0);
    const G = Math.max((num >> 8 & 255) - amt, 30);
    const B = Math.max((num & 255) - amt, 30);
    return '#' + (0x1000000 + R * 65536 + G * 256 + B).toString(16).slice(1);
}
function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(n >> 16) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255);
}
// Цвета градиента + нужен ли тёмный текст (на светлых серверах белый плохо читается)
function look(s) {
    let c = s.color, c2 = darken(s.color, 40);
    if (s.name === 'BLACK') { c = '#3a3a3a'; c2 = '#1a1a1a'; }
    if (s.name === 'WHITE') { c = '#9a9a9a'; c2 = '#5a5a5a'; }
    const light = s.name !== 'WHITE' && luminance(c) > 0.42 && luminance(c2) > 0.12;
    return { c, c2, light };
}

// ===== КАРТОЧКА =====
function createCard(server, { selected = false } = {}) {
    const { c, c2, light } = look(server);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'srv-card' + (light ? ' light' : '') + (selected ? ' sel' : '');
    el.style.setProperty('--c', c);
    el.style.setProperty('--c2', c2);
    el.innerHTML =
        `<span class="srv-tick">${ICON_TICK}</span>` +
        `<span class="srv-name"></span>` +
        `<span class="srv-cnt">${ICON_CLIP}${adCounts[server.name] || 0} объявл.</span>`;
    el.querySelector('.srv-name').textContent = server.name;

    el.addEventListener('click', async () => {
        if (el.classList.contains('busy')) return;     // защита от двойного тапа
        el.classList.add('busy');
        // Дожидаемся записи ПЕРЕД переходом — раньше saveServer не ждали, и
        // навигация могла оборвать запись в Firestore на полпути.
        await saveServer(server.name);
        window.location.href = 'index.html';
    });
    return el;
}

// ===== ОТРИСОВКА =====
function renderMyServer() {
    const box = $('srvMyCard');
    box.innerHTML = '';
    const server = SERVERS.find(s => s.name === getLastServer());
    if (server) box.appendChild(createCard(server));
}

function createSection(title, items, shownTotal) {
    const wrap = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'srv-gh';
    head.textContent = title;
    const num = document.createElement('span');
    num.textContent = shownTotal;
    head.appendChild(num);
    wrap.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'srv-grid';
    const last = getLastServer();
    items.forEach(s => grid.appendChild(createCard(s, { selected: s.name === last })));
    wrap.appendChild(grid);
    return wrap;
}

function renderAll() {
    const q = query.trim().toLowerCase();
    const last = getLastServer();
    const current = SERVERS.find(s => s.name === last);
    const match = s => (group === 'all' || s.group === group) && (!q || s.name.toLowerCase().includes(q));

    // Блок «Ваш сервер» сверху — только когда нет поиска и фильтра;
    // из общего списка тогда его не дублируем.
    const showMine = !!current && !q && group === 'all';
    const inList = s => match(s) && !(showMine && s.name === last);

    const colors = SERVERS.filter(s => s.group === 'colors' && inList(s));
    const cities = SERVERS.filter(s => s.group === 'cities' && inList(s));
    const total = SERVERS.filter(match).length;

    const grid = $('serversGrid');
    grid.innerHTML = '';
    if (colors.length) grid.appendChild(createSection('Цветные серверы', colors, SERVERS.filter(s => s.group === 'colors' && match(s)).length));
    if (cities.length) grid.appendChild(createSection('Города', cities, SERVERS.filter(s => s.group === 'cities' && match(s)).length));
    if (!total) {
        grid.innerHTML = '<div class="srv-empty"><b>Ничего не найдено</b>Попробуйте другой запрос</div>';
    }

    $('searchResultsCount').textContent = (q || group !== 'all')
        ? `Найдено: ${total} из ${SERVERS.length}`
        : `Всего серверов: ${SERVERS.length}`;

    const mine = $('srvMine');
    if (showMine) {
        mine.classList.remove('hidden');
        mine.innerHTML = '<div class="srv-gh">Ваш сервер</div><div class="srv-grid"></div>';
        mine.querySelector('.srv-grid').appendChild(createCard(current, { selected: true }));
    } else {
        mine.classList.add('hidden');
        mine.innerHTML = '';
    }

    document.querySelectorAll('.srv-chip').forEach(ch => ch.classList.toggle('on', ch.dataset.g === group));
}

function renderChips() {
    const count = g => g === 'all' ? SERVERS.length : SERVERS.filter(s => s.group === g).length;
    $('srvChips').innerHTML = [['all', 'Все'], ['colors', 'Цветные'], ['cities', 'Города']]
        .filter(([g]) => g === 'all' || count(g) > 0)
        .map(([g, t]) => `<button type="button" class="srv-chip" data-g="${g}">${t} <b>${count(g)}</b></button>`)
        .join('');
    $('srvChips').addEventListener('click', e => {
        const b = e.target.closest('.srv-chip');
        if (b) { group = b.dataset.g; renderAll(); }
    });
}

// ===== ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ =====
function showView(view) {
    const my = view === 'my';
    $('singleServerView').classList.toggle('hidden', !my);
    $('allServersView').classList.toggle('hidden', my);
    $('myServerBtn').classList.toggle('on', my);
    $('allServersBtn').classList.toggle('on', !my);
    if (my) {
        renderMyServer();
    } else {
        renderAll();
        // Фокус в поиск — только на устройствах с мышью. На телефоне он сразу
        // открывал бы клавиатуру и закрывал пол-экрана с серверами.
        if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
            setTimeout(() => $('serverSearchInput').focus(), 50);
        }
    }
}

function setupSearch() {
    const input = $('serverSearchInput');
    const clearBtn = $('clearSearchBtn');
    let timer = null;

    input.addEventListener('input', e => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            query = e.target.value;
            clearBtn.classList.toggle('show', !!query);
            renderAll();
        }, 120);
    });
    clearBtn.addEventListener('click', () => {
        input.value = '';
        query = '';
        clearBtn.classList.remove('show');
        renderAll();
        input.focus();
    });
}

// Липкая панель поиска прозрачна, пока лежит на своём месте, и получает фон
// (класс .stuck), только когда прилипла к верху при прокрутке. Следим за
// маркером над панелью: ушёл за верхний край экрана — значит, панель прилипла.
function setupStickyState() {
    const tools = document.querySelector('.srv-tools');
    const sentinel = $('srvSentinel');
    if (!tools) return;
    if (!sentinel || !('IntersectionObserver' in window)) { tools.classList.add('stuck'); return; }
    // rootMargin -10px = липкий отступ панели от верха (top: 10px на ПК):
    // маркер считается ушедшим, когда достиг этой линии, а не края экрана.
    new IntersectionObserver(([entry]) => {
        tools.classList.toggle('stuck', !entry.isIntersecting && entry.boundingClientRect.top < 10);
    }, { rootMargin: '-10px 0px 0px 0px' }).observe(sentinel);
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', async () => {
    // Авторизация
    const currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'register.html';
        return;
    }

    // Бан
    try {
        const bannedUsers = await getBannedUsers();
        const banInfo = bannedUsers[currentUser.nickname];
        if (banInfo && (banInfo.until === 'permanent' || Date.now() < banInfo.until)) {
            showToast('Ваш аккаунт заблокирован!', 'error');
            localStorage.removeItem('currentUser');
            setTimeout(() => window.location.href = 'register.html', 1500);
            return;
        }
    } catch (e) {
        console.error('Ошибка проверки бана:', e);
    }

    renderChips();
    setupSearch();
    setupStickyState();
    $('myServerBtn').addEventListener('click', () => showView('my'));
    $('allServersBtn').addEventListener('click', () => showView('all'));
    $('changeServerBtn').addEventListener('click', () => showView('all'));

    // Есть выбранный сервер — показываем его, иначе сразу все сервера
    if (getLastServer() && SERVERS.some(s => s.name === getLastServer())) {
        showView('my');
    } else {
        $('myServerBtn').classList.add('hidden');
        showView('all');
    }

    // Счётчики объявлений подтягиваем после первой отрисовки — страница
    // появляется сразу, а числа на карточках обновляются, как только пришли.
    await loadAdCounts();
    if (!$('allServersView').classList.contains('hidden')) renderAll(); else renderMyServer();
});
