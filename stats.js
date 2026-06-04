// ===== STATS MODULE =====
import { db } from './firebase-config.js';
import { doc, getDoc, collection, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAllAds } from './api.js';

const currentUser = JSON.parse(localStorage.getItem('currentUser'));
if (!currentUser) window.location.href = 'register.html';

// Chart.js грузим через Promise чтобы не было race condition
function loadChartJS() {
    return new Promise((resolve) => {
        if (typeof Chart !== 'undefined') { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
        s.onload = resolve;
        document.head.appendChild(s);
    });
}

document.addEventListener('DOMContentLoaded', () => { loadStats(); });

async function loadStats() {
    showLoadingState();
    const myAds = await getMyAds();
    if (myAds.length === 0) { showEmptyState(); return; }

    let totalViews = 0, totalFavorites = 0, adsStats = [];

    // Параллельные запросы к adStats
    const statsSnaps = await Promise.all(
        myAds.map(ad => getDoc(doc(db, 'adStats', ad.id.toString())).catch(() => null))
    );

    statsSnaps.forEach((statsSnap, i) => {
        const ad = myAds[i];
        if (statsSnap && statsSnap.exists()) {
            const data = statsSnap.data();
            totalViews    += data.totalViews    || 0;
            totalFavorites += data.favoritesCount || 0;
            adsStats.push({
                id: ad.id, title: ad.title,
                views:      data.totalViews     || 0,
                favorites:  data.favoritesCount || 0,
                dailyViews: data.dailyViews     || {},
                dailyFavs:  data.dailyFavs      || {},
                conversion: data.totalViews > 0
                    ? ((data.favoritesCount || 0) / data.totalViews * 100).toFixed(1)
                    : 0
            });
        } else {
            adsStats.push({
                id: ad.id, title: ad.title,
                views: 0, favorites: 0,
                dailyViews: {}, dailyFavs: {}, conversion: 0
            });
        }
    });

    // Считаем все сообщения (не только непрочитанные)
    const messagesCount = await getTotalMessagesCount();

    animateNumber('totalViews',     totalViews);
    animateNumber('totalFavorites', totalFavorites);
    animateNumber('totalMessages',  messagesCount);

    const conversion = totalViews > 0
        ? (totalFavorites / totalViews * 100).toFixed(1)
        : 0;
    document.getElementById('conversionRate').textContent = conversion + '%';

    await loadChartJS();
    renderTopAds(adsStats);
}

async function getMyAds() {
    try {
        const allAds = await getAllAds();
        return allAds.filter(ad => ad.author === currentUser.nickname);
    } catch (e) { console.error('Ошибка загрузки объявлений:', e); return []; }
}

async function getTotalMessagesCount() {
    try {
        const snapshot = await getDocs(collection(db, 'userChats', currentUser.nickname, 'chats'));
        // Считаем чаты где есть хоть одно сообщение
        return snapshot.docs.filter(d => d.data().lastMessage && d.data().lastMessage !== 'Начните общение...').length;
    } catch (e) { return 0; }
}

function showLoadingState() {
    ['totalViews','totalFavorites','totalMessages'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
    });
    const cr = document.getElementById('conversionRate');
    if (cr) cr.textContent = '—';
    const list = document.getElementById('topAdsList');
    if (list) list.innerHTML = `<div style="text-align:center;padding:40px;color:#666;"><p>Загрузка...</p></div>`;
}

function animateNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;
    const duration = 1000, startTime = performance.now();
    function update(currentTime) {
        const progress = Math.min((currentTime - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        element.textContent = Math.floor(targetValue * eased).toLocaleString('ru-RU');
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function renderTopAds(adsStats) {
    const container = document.getElementById('topAdsList');
    const sorted = [...adsStats].sort((a, b) => b.views - a.views).slice(0, 5);

    if (sorted.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">Нет данных</div>';
        return;
    }

    container.innerHTML = sorted.map((ad, i) => {
        let rankStyle = 'background:rgba(255,30,30,0.2);color:#ff1e1e;';
        if (i === 0) rankStyle = 'background:linear-gradient(135deg,#ffd700,#ffaa00);color:#111;';
        if (i === 1) rankStyle = 'background:linear-gradient(135deg,#c0c0c0,#808080);color:#111;';
        if (i === 2) rankStyle = 'background:linear-gradient(135deg,#cd7f32,#8b4513);color:white;';
        return `
        <div class="top-ad-row" data-index="${i}"
            style="display:flex;align-items:center;gap:15px;padding:15px;background:rgba(255,255,255,0.03);border-radius:12px;margin-bottom:10px;cursor:pointer;transition:background 0.2s;"
            onmouseover="this.style.background='rgba(255,30,30,0.08)'"
            onmouseout="this.style.background='rgba(255,255,255,0.03)'">
            <div style="width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:18px;flex-shrink:0;${rankStyle}">${i+1}</div>
            <div style="flex:1;min-width:0;">
                <div style="color:white;font-weight:600;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(ad.title)}</div>
                <div style="display:flex;gap:15px;font-size:13px;color:#888;">
                    <span>👁 ${ad.views}</span>
                    <span>⭐ ${ad.favorites}</span>
                    <span>📈 ${ad.conversion}%</span>
                </div>
            </div>
            <div style="color:#555;font-size:20px;flex-shrink:0;">›</div>
        </div>`;
    }).join('');

    container.querySelectorAll('.top-ad-row').forEach(row => {
        row.addEventListener('click', () => openAdStatsModal(sorted[parseInt(row.dataset.index)]));
    });
}

// ===== МОДАЛКА С ГРАФИКОМ =====
let chartInstance = null;

function openAdStatsModal(ad) {
    const existing = document.getElementById('adStatsModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'adStatsModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div style="background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;width:100%;max-width:540px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
                <div>
                    <div style="color:#888;font-size:13px;margin-bottom:4px;">Статистика объявления</div>
                    <div style="color:white;font-size:16px;font-weight:600;max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(ad.title)}</div>
                </div>
                <button id="closeStatsModal" style="background:rgba(255,255,255,0.08);border:none;color:#aaa;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;flex-shrink:0;">×</button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px;">
                <div style="background:rgba(255,30,30,0.08);border:1px solid rgba(255,30,30,0.2);border-radius:12px;padding:14px;text-align:center;">
                    <div style="font-size:26px;font-weight:600;color:#ff1e1e;">${ad.views}</div>
                    <div style="font-size:12px;color:#888;margin-top:4px;">просмотров</div>
                </div>
                <div style="background:rgba(249,202,36,0.08);border:1px solid rgba(249,202,36,0.2);border-radius:12px;padding:14px;text-align:center;">
                    <div style="font-size:26px;font-weight:600;color:#f9ca24;">${ad.favorites}</div>
                    <div style="font-size:12px;color:#888;margin-top:4px;">в избранном</div>
                </div>
                <div style="background:rgba(76,175,80,0.08);border:1px solid rgba(76,175,80,0.2);border-radius:12px;padding:14px;text-align:center;">
                    <div style="font-size:26px;font-weight:600;color:#4caf50;">${ad.conversion}%</div>
                    <div style="font-size:12px;color:#888;margin-top:4px;">конверсия</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:16px;">
                <button id="tabViews" onclick="switchStatsTab('views')" style="background:rgba(255,30,30,0.15);border:1px solid rgba(255,30,30,0.4);color:#ff1e1e;border-radius:8px;padding:7px 18px;font-size:13px;cursor:pointer;">Просмотры</button>
                <button id="tabFavs"  onclick="switchStatsTab('favs')"  style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#888;border-radius:8px;padding:7px 18px;font-size:13px;cursor:pointer;">Избранное</button>
            </div>
            <div style="position:relative;height:200px;">
                <canvas id="adStatsChart"></canvas>
            </div>
            <div style="margin-top:12px;font-size:12px;color:#555;text-align:center;">Данные за последние 7 дней</div>
        </div>`;

    document.body.appendChild(modal);
    document.getElementById('closeStatsModal').addEventListener('click', closeAdStatsModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeAdStatsModal(); });
    document.addEventListener('keydown', handleEscStats);

    const days7 = getLast7Days();
    window._statsAdData = {
        views:  days7.map(d => ad.dailyViews[d] || 0),
        favs:   days7.map(d => ad.dailyFavs[d]  || 0),
        labels: days7.map(d => formatDay(d))
    };
    buildChart('views');
}

function closeAdStatsModal() {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    const modal = document.getElementById('adStatsModal');
    if (modal) modal.remove();
    document.removeEventListener('keydown', handleEscStats);
}

function handleEscStats(e) { if (e.key === 'Escape') closeAdStatsModal(); }

window.switchStatsTab = function(tab) {
    const btnViews = document.getElementById('tabViews');
    const btnFavs  = document.getElementById('tabFavs');
    if (tab === 'views') {
        btnViews.style.cssText = 'background:rgba(255,30,30,0.15);border:1px solid rgba(255,30,30,0.4);color:#ff1e1e;border-radius:8px;padding:7px 18px;font-size:13px;cursor:pointer;';
        btnFavs.style.cssText  = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#888;border-radius:8px;padding:7px 18px;font-size:13px;cursor:pointer;';
    } else {
        btnFavs.style.cssText  = 'background:rgba(249,202,36,0.15);border:1px solid rgba(249,202,36,0.4);color:#f9ca24;border-radius:8px;padding:7px 18px;font-size:13px;cursor:pointer;';
        btnViews.style.cssText = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#888;border-radius:8px;padding:7px 18px;font-size:13px;cursor:pointer;';
    }
    buildChart(tab);
};

function buildChart(tab) {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    if (typeof Chart === 'undefined') return;
    const data = window._statsAdData;
    const isViews = tab === 'views';
    const color = isViews ? '#ff1e1e' : '#f9ca24';
    chartInstance = new Chart(document.getElementById('adStatsChart'), {
        type: 'bar',
        data: {
            labels: data.labels,
            datasets: [{
                data: isViews ? data.views : data.favs,
                backgroundColor: color + '33',
                borderColor: color,
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#666', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#666', font: { size: 11 }, stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
            }
        }
    });
}

function getLast7Days() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
    }
    return days;
}

function formatDay(dateStr) {
    const d = new Date(dateStr);
    return d.getDate() + ' ' + ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'][d.getMonth()];
}

function showEmptyState() {
    ['totalViews','totalFavorites','totalMessages'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '0';
    });
    const cr = document.getElementById('conversionRate');
    if (cr) cr.textContent = '0%';
    document.getElementById('topAdsList').innerHTML = `
        <div style="text-align:center;padding:40px;color:#666;">
            <p>У вас пока нет объявлений</p>
            <p style="font-size:14px;margin-top:10px;">Создайте первое объявление, чтобы увидеть статистику</p>
        </div>`;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
