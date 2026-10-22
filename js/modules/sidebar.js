// ===== SIDEBAR — шторка профиля на главной странице =====
import { getAllAds, getAdStats, getReviews } from '../api.js';
import { escapeHtml } from '../utils.js';
import { currentUser } from './main.js';
import { ALL_SERVERS } from '../servers-data.js';
import { BADGES_CONFIG, RARITY_LABELS, ROLE_LABELS } from '../badges-data.js';

// DOM-элементы шапки/шторки — резолвятся сразу (не зависят от currentUser)
const profileBox     = document.getElementById('profileBox');
const profileMenu    = document.getElementById('profileMenu');
const profileOverlay = document.getElementById('profileOverlay');

// initSidebarModule() вызывается из main.js после того, как currentUser точно
// проинициализирован — это разрывает цикл sidebar.js <-> main.js на уровне
// top-level кода (ES-модули иначе бросают TDZ ReferenceError при цикле).
export function initSidebarModule() {
    if (currentUser && !currentUser.server) {
        window.location.href = 'servers.html';
        return;
    }

    const profileNickname = document.getElementById('profileNickname');
    if (profileNickname && currentUser) {
        profileNickname.textContent = `${currentUser.nickname} • ${currentUser.server}`;
    }
}

export function initSidebarHeader() {
    if (!currentUser) return;

    const letter = currentUser.nickname?.charAt(0).toUpperCase() || 'P';
    // Берём аватар: сначала из currentUser, потом из отдельного localStorage ключа
    const avatar = currentUser.avatar
        || localStorage.getItem(`avatar_${currentUser.nickname}`)
        || null;
    // Синхронизируем в currentUser если взяли из отдельного ключа
    if (avatar && !currentUser.avatar) {
        currentUser.avatar = avatar;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
    }

    // ── Кнопка в шапке сайта ──
    const profileBox = document.getElementById('profileBox');
    if (profileBox) {
        profileBox.innerHTML = `
            <div class="header-avatar-circle" id="headerAvatarCircle">
                ${avatar ? `<img src="${avatar}" alt="avatar">` : letter}
            </div>
            <span id="profileNickname">${currentUser.nickname}</span>
        `;
    }

    // ── Шапка шторки ──
    const nickEl   = document.getElementById('sidebarNickname');
    const serverEl = document.getElementById('sidebarServer');
    if (nickEl)   nickEl.textContent   = currentUser.nickname;
    if (serverEl) serverEl.innerHTML   = getServerBadgeHtml(currentUser.server);

    const circle = document.getElementById('sidebarAvatarCircle');
    if (circle) circle.innerHTML = avatar ? `<img src="${avatar}" alt="avatar">` : letter;


}

// Цвета серверов — берём из общего списка (servers-data.js), чтобы никогда
// не расходиться с экраном выбора сервера, как это было раньше.
const SERVER_COLORS = Object.fromEntries(ALL_SERVERS.map(s => [s.name, s.color]));

export function getServerBadgeHtml(server) {
    if (!server) return '';
    const color = SERVER_COLORS[server.toUpperCase()] || '#888';
    // Всегда белый текст — цвет сервера только в рамке и фоне
    // Для светлых серверов усиливаем фон чтобы был виден контраст
    const lightServers = ['WHITE','PLATINUM','LIME','YELLOW','GOLD','AQUA','ICE','GREEN','ARZAMAS','NOVOSIB','EKB','TASHKENT'];
    const isLight = lightServers.includes(server.toUpperCase());
    const bg = isLight ? `${color}35` : `${color}18`;
    const border = isLight ? `${color}80` : `${color}50`;
    return `<span class="server-badge" style="color:#fff;border-color:${border};background:${bg};text-shadow:0 1px 3px rgba(0,0,0,0.8);">${server.toUpperCase()}</span>`;
}

export function renderUserBadges(badges, size = 'md') {
    if (!badges || badges.length === 0) return '';
    const fontSize = size === 'sm' ? '12px' : '13px';
    const padding  = size === 'sm' ? '2px 7px' : '3px 10px';

    return badges.map(key => {
        const cfg = BADGES_CONFIG[key];
        if (!cfg) return '';
        const rarity = RARITY_LABELS[cfg.rarity] || RARITY_LABELS.uncommon;
        const isLegendary = cfg.rarity === 'legendary';
        const borderStyle = isLegendary
            ? `border: 1px solid ${cfg.color}80; box-shadow: 0 0 6px ${cfg.color}40;`
            : `border: 1px solid ${cfg.color}50;`;
        return `<span class="user-badge${isLegendary ? ' user-badge--legendary' : ''}"
            style="
                display:inline-flex; align-items:center; gap:4px;
                background:${cfg.color}18; color:${cfg.color};
                ${borderStyle}
                border-radius:20px; padding:${padding};
                font-size:${fontSize}; font-weight:600;
                cursor:default; white-space:nowrap;
            "
            title="${cfg.label} · ${rarity.label}\n${cfg.desc}"
        >${cfg.icon} ${cfg.label}</span>`;
    }).join('');
}

export function applySidebarRole(role) {
    const badge = document.getElementById('sidebarRoleBadge');
    if (!badge) return;
    if (!role || !ROLE_LABELS[role]) { badge.classList.add('hidden'); return; }
    const cfg = ROLE_LABELS[role];
    badge.textContent = cfg.text;
    badge.className = `role-badge ${cfg.cls}`;
}

window.switchSidebarTab = function(name, btn) {
    document.querySelectorAll('.sidebar-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-tab').forEach(el => el.classList.remove('active'));
    const tab = document.getElementById('sidebar-tab-' + name);
    if (tab) tab.classList.add('active');
    if (btn) btn.classList.add('active');

    // Ленивая загрузка данных при первом открытии таба
    if (name === 'stats' && !_sidebarStatsLoaded) loadSidebarStats();
};

function openProfileMenu() {
    profileMenu.classList.remove('hidden');
    profileOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

window.goToMyProfile = function() {
    const user = JSON.parse(localStorage.getItem("currentUser"));
    if (user?.nickname) {
        window.location.href = "profile.html?user=" + encodeURIComponent(user.nickname);
    }
};

export function closeProfileMenu() {
    profileMenu.classList.add('hidden');
    profileOverlay.classList.add('hidden');
    document.body.style.overflow = '';
}
window.closeProfileMenu = closeProfileMenu; // для onclick="closeProfileMenu()" в HTML

profileBox?.addEventListener('click', (e) => {
    e.stopPropagation();
    profileMenu.classList.contains('hidden') ? openProfileMenu() : closeProfileMenu();
});

profileOverlay?.addEventListener('click', closeProfileMenu);

document.addEventListener('click', (e) => {
    if (!profileMenu?.contains(e.target) && !profileBox?.contains(e.target)) closeProfileMenu();
});

document.getElementById('logoutButton')?.addEventListener('click', () => {
    localStorage.removeItem('currentUser');
    window.location.href = 'register.html';
});

document.getElementById('addAdButton')?.addEventListener('click', () => {
    window.location.href = 'create-ad.html';
});

let _pendingAvatar = null;

let _sidebarStatsLoaded = false;

async function loadSidebarStats() {
    _sidebarStatsLoaded = true;
    if (!currentUser) return;

    try {
        // Объявления
        const allAds = await getAllAds();
        const myAds  = allAds.filter(a => a.author === currentUser.nickname);
        document.getElementById('sidebarAdsCount').textContent = myAds.length;

        // Статистика просмотров/избранного
        let totalViews = 0, totalFavs = 0;
        await Promise.all(myAds.map(async ad => {
            const st = await getAdStats(ad.id);
            if (st) {
                totalViews += st.totalViews    || 0;
                totalFavs  += st.favoritesCount || 0;
            }
        }));

        document.getElementById('sidebarViews').textContent = totalViews;
        document.getElementById('sidebarFavs').textContent  = totalFavs;
        const conv = totalViews > 0 ? (totalFavs / totalViews * 100).toFixed(1) + '%' : '0%';
        document.getElementById('sidebarConversion').textContent = conv;

        // Отзывы
        const reviews = await getReviews(currentUser.nickname);
        const reviewsEl = document.getElementById('sidebarReviews');
        if (!reviewsEl) return;

        if (!reviews.length) {
            reviewsEl.innerHTML = '<div style="color:#555;font-size:13px;padding:12px 24px">Отзывов пока нет</div>';
            return;
        }

        reviewsEl.innerHTML = reviews.slice(0, 3).map(r => `
            <div class="sidebar-review-item">
                <div class="sidebar-review-author">
                    <span class="sidebar-review-stars">${'★'.repeat(r.rating || 5)}${'☆'.repeat(5 - (r.rating || 5))}</span>
                    <a href="profile.html?user=${encodeURIComponent(r.author)}" style="color:#ff6b6b;text-decoration:none;font-weight:600;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(r.author)}</a>
                </div>
                <div class="sidebar-review-text">${escapeHtml(r.text || '')}</div>
            </div>
        `).join('');

    } catch (e) {
        console.error('Ошибка загрузки статистики шторки:', e);
    }
}