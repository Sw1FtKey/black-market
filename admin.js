// ===== ИМПОРТ FIREBASE =====
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ===== ЗАЩИТА ОТ ДВОЙНОГО КЛИКА =====
const processingActions = new Set();
function isProcessing(key) {
    if (processingActions.has(key)) return true;
    processingActions.add(key);
    setTimeout(() => processingActions.delete(key), 3000);
    return false;
}

// ===== TOAST =====
function showToast(message, type) {
    if (!type) type = 'info';
    document.querySelectorAll('.bm-toast-admin').forEach(t => t.remove());
    const cfg = { success:{border:'#4caf50',icon:'✓'}, error:{border:'#f44336',icon:'✕'}, warning:{border:'#ff9800',icon:'!'}, info:{border:'#2196f3',icon:'i'} };
    const c = cfg[type] || cfg.info;
    const t = document.createElement('div');
    t.className = 'bm-toast-admin';
    t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(80px);background:rgba(17,17,17,0.97);border:1px solid '+c.border+'40;border-left:3px solid '+c.border+';color:white;padding:14px 20px;border-radius:12px;z-index:99999;font-size:14px;font-weight:500;display:flex;align-items:center;gap:10px;min-width:240px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.6);transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1),opacity 0.35s ease;opacity:0;pointer-events:none;';
    t.innerHTML = '<span style="width:20px;height:20px;border-radius:50%;background:'+c.border+';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0;">'+c.icon+'</span><span>'+message+'</span>';
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform='translateX(-50%) translateY(0)'; t.style.opacity='1'; });
    setTimeout(() => { t.style.transform='translateX(-50%) translateY(80px)'; t.style.opacity='0'; setTimeout(() => t.remove(), 350); }, (type==='error'||type==='warning') ? 3500 : 2500);
}

// ===== СИСТЕМА РОЛЕЙ =====
// owner   — владелец: всё + управление ролями
// admin   — админ: баны, логи, жалобы, удаление
// moder   — модератор: жалобы, удаление объявлений, предупреждения
const ROLE_CONFIG = {
    owner: { name: 'Владелец',   icon: '👑', color: '#f9ca24', level: 3 },
    admin: { name: 'Администратор', icon: '🛡️', color: '#ff6b6b', level: 2 },
    moder: { name: 'Модератор',  icon: '🔨', color: '#74b9ff', level: 1 },
};

const currentUser = JSON.parse(localStorage.getItem('currentUser'));
let myRole = null; // загрузим из Firebase

// ===== ЗАЩИТА ДЕЙСТВИЙ =====
// Проверяем роль перед каждым критичным действием
// Это второй уровень защиты — первый в Firestore Rules
function requireRole(action) {
    if (!canDo(action)) {
        showToast('Недостаточно прав для этого действия', 'error');
        console.warn(`[Security] Попытка выполнить "${action}" без прав. Роль: ${myRole}`);
        return false;
    }
    return true;
}



// ===== СЛОВАРЬ ПРИЧИН ЖАЛОБ =====
const REPORT_REASONS = {
    'spam':        '📢 Спам',
    'wrong_price': '💰 Некорректная цена',
    'scam':        '🚨 Мошенничество',
    'sold':        '✅ Уже продано',
    'other':       '❓ Другое',
    'fake':        '🎭 Фейк',
    'offensive':   '🤬 Оскорбления',
    'wrong_info':  '❌ Неверная информация',
    'duplicate':   '📋 Дубликат',
};
function getReasonName(reason) {
    return REPORT_REASONS[reason] || reason || 'Нарушение';
}
async function getRoles() {
    try {
        const snap = await getDoc(doc(db, 'data', 'roles'));
        return snap.exists() ? snap.data().items || {} : {};
    } catch(e) { return {}; }
}

async function saveRoles(roles) {
    await setDoc(doc(db, 'data', 'roles'), { items: roles });
}

async function getMyRole() {
    const roles = await getRoles();
    return roles[currentUser?.nickname] || null;
}

// Проверки прав
function canDo(action) {
    if (!myRole) return false;
    const lvl = ROLE_CONFIG[myRole]?.level || 0;
    const required = { delete_ad: 1, warn: 1, resolve: 1, ban: 2, unban: 2, logs: 2, manage_roles: 3, pin_ad: 2, platform_stats: 3 };
    return lvl >= (required[action] || 99);
}

// ===== ДАННЫЕ =====
async function getAllAds() {
    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const snap = await getDocs(collection(db, 'ads'));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch(e) { return []; }
}

async function deleteAdById(adId) {
    try {
        const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        await deleteDoc(doc(db, 'ads', String(adId)));
        return true;
    } catch(e) { console.error('Ошибка удаления объявления:', e); return false; }
}
async function getReports() {
    try {
        const snap = await getDoc(doc(db, 'data', 'reports'));
        return snap.exists() ? snap.data().items || [] : [];
    } catch(e) { return []; }
}
async function saveReports(r) {
    await setDoc(doc(db, 'data', 'reports'), { items: r });
}
async function getAdminLogs() {
    try {
        const snap = await getDoc(doc(db, 'data', 'logs'));
        return snap.exists() ? snap.data().items || [] : [];
    } catch(e) { return []; }
}
async function saveAdminLog(action) {
    try {
        const logs = await getAdminLogs();
        logs.unshift({ id: Date.now(), admin: currentUser?.nickname || '?', role: myRole, action: action.type, target: action.target, details: action.details || '', timestamp: new Date().toISOString() });
        if (logs.length > 2000) logs.length = 2000;
        await setDoc(doc(db, 'data', 'logs'), { items: logs });
    } catch(e) {}
}
async function getBannedUsers() {
    try {
        const snap = await getDoc(doc(db, 'data', 'bannedUsers'));
        return snap.exists() ? snap.data().items || {} : {};
    } catch(e) { return {}; }
}
async function saveBannedUsers(data) {
    await setDoc(doc(db, 'data', 'bannedUsers'), { items: data });
}

// ===== УРОВНИ НАКАЗАНИЙ =====
const BAN_LEVELS = {
    warn:     { name: 'Предупреждение', color: '#ffc107', duration: 0 },
    ban_1h:   { name: 'Бан 1 час',     color: '#ff9800', duration: 3600000 },
    ban_24h:  { name: 'Бан 24 часа',   color: '#ff5722', duration: 86400000 },
    ban_7d:   { name: 'Бан 7 дней',    color: '#f44336', duration: 604800000 },
    ban_30d:  { name: 'Бан 30 дней',   color: '#e91e63', duration: 2592000000 },
    ban_perm: { name: 'Перм. бан',     color: '#9c27b0', duration: -1 }
};

// ===== СОСТОЯНИЕ =====
let currentFilter = 'all';
let currentTab = 'reports';
let selectedReports = new Set();
let allReportsData = [];

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', async () => {
    if (!currentUser) { window.location.href = 'register.html'; return; }

    myRole = await getMyRole();
    if (!myRole) {
        document.body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:white;background:#0b0b0b;gap:16px;">
            <div style="font-size:64px;">🚫</div>
            <h2 style="color:#ff4444;">Доступ запрещён</h2>
            <p style="color:#888;">У вас нет прав для доступа к админ-панели</p>
            <a href="index.html" style="color:#ff1e1e;">← На главную</a>
        </div>`;
        return;
    }

    renderRoleBadge();
    renderTabsForRole();
    await loadReports();
    updateStats();
});

function renderRoleBadge() {
    const cfg = ROLE_CONFIG[myRole];
    const badge = document.getElementById('roleBadge');
    if (badge) badge.innerHTML = `<span style="background:${cfg.color}22;border:1px solid ${cfg.color}55;color:${cfg.color};padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600;">${cfg.icon} ${cfg.name}</span>`;
}

function renderTabsForRole() {
    const tabs = document.getElementById('adminTabs');
    if (!tabs) return;
    let html = `<button class="tab-btn active" data-tab="reports" onclick="switchTab('reports')">📋 Жалобы</button>`;
    if (canDo('ban')) html += `<button class="tab-btn" data-tab="bans" onclick="switchTab('bans')">🔨 Баны</button>`;
    if (canDo('logs')) html += `<button class="tab-btn" data-tab="logs" onclick="switchTab('logs')">📜 Журнал</button>`;
    if (canDo('platform_stats')) html += `<button class="tab-btn" data-tab="platform" onclick="switchTab('platform')">📊 Платформа</button>`;
    if (canDo('manage_roles')) html += `<button class="tab-btn" data-tab="roles" onclick="switchTab('roles')">👥 Роли</button>`;
    if (canDo('manage_roles')) html += `<button class="tab-btn" data-tab="badges" onclick="switchTab('badges')">🏅 Бейджи</button>`;
    if (canDo('logs')) html += `<button class="tab-btn" data-tab="bugreports" onclick="switchTab('bugreports')">🐛 Баг-репорты</button>`;
    tabs.innerHTML = html;
}

// ===== СТАТИСТИКА =====
async function updateStats() {
    const reports = await getReports();
    const newCount = reports.filter(r => r.status === 'new').length;
    const totalCount = reports.length;
    const resolvedCount = reports.filter(r => r.status === 'resolved').length;
    const el = (id, v) => { const e = document.getElementById(id); if(e) e.textContent = v; };
    el('newReportsCount', newCount);
    el('totalReportsCount', totalCount);
    el('resolvedCount', resolvedCount);
}

// ===== ТАБЫ =====
window.switchTab = async function(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('reportsList').classList.add('hidden');
    document.getElementById('logsList')?.classList.add('hidden');
    document.getElementById('bansPanel')?.classList.add('hidden');
    document.getElementById('platformPanel')?.classList.add('hidden');
    document.getElementById('rolesPanel')?.classList.add('hidden');
    document.getElementById('badgesPanel')?.classList.add('hidden');
    document.getElementById('bugReportsPanel')?.classList.add('hidden');
    document.getElementById('massActionsPanel')?.classList.add('hidden');

    if (tab === 'reports') { document.getElementById('reportsList').classList.remove('hidden'); await loadReports(); }
    else if (tab === 'logs') { document.getElementById('logsList')?.classList.remove('hidden'); await loadLogs(); }
    else if (tab === 'bans') { document.getElementById('bansPanel')?.classList.remove('hidden'); await loadBans(); }
    else if (tab === 'platform') { document.getElementById('platformPanel')?.classList.remove('hidden'); await loadPlatformStats(); }
    else if (tab === 'roles') { document.getElementById('rolesPanel')?.classList.remove('hidden'); await loadRoles(); }
    else if (tab === 'badges') { document.getElementById('badgesPanel')?.classList.remove('hidden'); await loadBadgesPanel(); }
    else if (tab === 'bugreports') { document.getElementById('bugReportsPanel')?.classList.remove('hidden'); await loadBugReports(); }
};

// ===== ЖАЛОБЫ =====
async function loadReports() {
    const reports = await getReports();
    allReportsData = reports;
    renderReports();
}

function renderReports() {
    const list = document.getElementById('reportsList');
    if (!list) return;
    let filtered = [...allReportsData];
    if (currentFilter !== 'all') filtered = filtered.filter(r => r.status === currentFilter);

    // Сортировка: новые → в работе → решённые, внутри каждого статуса — новые сверху
    const statusOrder = { new: 0, viewed: 1, resolved: 2 };
    filtered.sort((a, b) => {
        const so = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
        if (so !== 0) return so;
        return new Date(b.createdAt) - new Date(a.createdAt);
    });

    if (filtered.length === 0) { list.innerHTML = `<div class="empty-state"><p>Нет жалоб</p></div>`; return; }

    list.innerHTML = filtered.map(r => {
        const statusColors = { new: '#ff4444', viewed: '#ff9800', resolved: '#4caf50' };
        const statusNames  = { new: '🔴 Новая', viewed: '🟡 В работе', resolved: '🟢 Решена' };
        const checked = selectedReports.has(r.id);
        const sc = statusColors[r.status] || '#888';
        const authorInitial = (r.adAuthor || r.author || '?').charAt(0).toUpperCase();
        const reporterInitial = (r.reportedBy || r.reporter || '?').charAt(0).toUpperCase();
        const isNew = r.status === 'new';
        const isViewed = r.status === 'viewed';

        return `
        <div style="background:rgba(17,17,17,0.9);border:1px solid ${isNew ? '#ff444430' : isViewed ? '#ff980030' : 'rgba(255,255,255,0.07)'};border-radius:14px;margin-bottom:12px;overflow:hidden;${isNew ? 'box-shadow:0 0 0 1px #ff444420;' : ''}">
            
            <!-- Шапка карточки -->
            <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.05);">
                <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleReportSelect(${r.id}, this.checked)" style="width:15px;height:15px;cursor:pointer;accent-color:#ff1e1e;flex-shrink:0;">
                <span style="background:${sc}18;color:${sc};border:1px solid ${sc}35;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;">${statusNames[r.status] || r.status}</span>
                <span style="background:rgba(255,255,255,0.06);color:#bbb;padding:3px 10px;border-radius:20px;font-size:12px;">${getReasonName(r.reason)}</span>
                <span style="color:#444;font-size:12px;margin-left:auto;">${formatDate(r.createdAt)}</span>
            </div>

            <!-- Тело карточки -->
            <div style="padding:14px 16px;">
                
                <!-- Объявление -->
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                    <div style="width:36px;height:36px;border-radius:8px;background:rgba(255,30,30,0.1);border:1px solid rgba(255,30,30,0.2);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">📋</div>
                    <div style="flex:1;min-width:0;">
                        <div style="color:white;font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.adTitle || 'Объявление #' + r.adId)}</div>
                        <div style="color:#666;font-size:12px;margin-top:2px;">ID: ${r.adId}</div>
                    </div>
                </div>

                <!-- Продавец и жалобщик -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:${r.comment ? '12px' : '14px'};">
                    <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:10px;display:flex;align-items:center;gap:8px;">
                        <div style="width:30px;height:30px;border-radius:50%;background:rgba(255,107,107,0.15);border:1px solid rgba(255,107,107,0.3);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#ff6b6b;flex-shrink:0;">${authorInitial}</div>
                        <div>
                            <div style="color:#888;font-size:11px;">Продавец</div>
                            <div style="color:white;font-size:13px;font-weight:600;">${escapeHtml(r.adAuthor || r.author || '—')}</div>
                        </div>
                    </div>
                    <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:10px;display:flex;align-items:center;gap:8px;">
                        <div style="width:30px;height:30px;border-radius:50%;background:rgba(100,181,246,0.15);border:1px solid rgba(100,181,246,0.3);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#64b5f6;flex-shrink:0;">${reporterInitial}</div>
                        <div>
                            <div style="color:#888;font-size:11px;">Жалоба от</div>
                            <div style="color:white;font-size:13px;font-weight:600;">${escapeHtml(r.reportedBy || r.reporter || '—')}</div>
                        </div>
                    </div>
                </div>

                <!-- Комментарий -->
                ${r.comment ? `<div style="color:#aaa;font-style:italic;font-size:13px;padding:10px 14px;background:rgba(255,255,255,0.03);border-left:3px solid rgba(255,255,255,0.1);border-radius:0 8px 8px 0;margin-bottom:14px;">"${escapeHtml(r.comment)}"</div>` : ''}

                <!-- Кнопки — зависят от статуса -->
                <div style="display:flex;flex-wrap:wrap;gap:8px;">
                    <button onclick="viewReportAd('${r.adId}')" style="padding:8px 16px;background:rgba(33,150,243,0.1);border:1px solid rgba(33,150,243,0.3);color:#64b5f6;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;">👁 Посмотреть</button>

                    ${r.status === 'new' ? `
                        <button onclick="takeInWork(${r.id})" style="padding:8px 16px;background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.3);color:#ffa726;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;">⚡ Взять в работу</button>
                        <button onclick="dismissReport(${r.id})" style="padding:8px 16px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#666;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;">✕ Отклонить</button>
                        <button onclick="deleteReport(${r.id})" style="padding:8px 16px;background:rgba(244,67,54,0.08);border:1px solid rgba(244,67,54,0.2);color:#ef5350;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;">🗑 Удалить жалобу</button>
                    ` : ''}

                    ${r.status === 'viewed' ? `
                        ${canDo('delete_ad') ? `<button onclick="deleteAdFromReport('${r.adId}', ${r.id})" style="padding:8px 16px;background:rgba(244,67,54,0.1);border:1px solid rgba(244,67,54,0.3);color:#ef5350;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;">🗑 Удалить объявление</button>` : ''}
                        ${canDo('ban') ? `<button onclick="openPunishModal('${escapeHtml(r.adAuthor || r.author || '')}', ${r.id})" style="padding:8px 16px;background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.3);color:#ffa726;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;">🔨 Наказать</button>` : ''}
                        <button onclick="resolveReport(${r.id})" style="padding:8px 16px;background:rgba(76,175,80,0.1);border:1px solid rgba(76,175,80,0.3);color:#66bb6a;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;">✓ Решить</button>
                    ` : ''}
                </div>
            </div>
        </div>`;
    }).join('');
}

// Фильтры
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderReports();
    });
});

window.toggleReportSelect = function(id, checked) {
    if (checked) selectedReports.add(id); else selectedReports.delete(id);
    updateMassActionsUI();
};

function updateMassActionsUI() {
    const panel = document.getElementById('massActionsPanel');
    if (!panel) return;
    if (selectedReports.size > 0) {
        panel.classList.remove('hidden');
        const el = document.getElementById('selectedCount');
        if (el) el.textContent = selectedReports.size;
    } else {
        panel.classList.add('hidden');
    }
}

window.takeInWork = async function(reportId) {
    const reports = await getReports();
    const r = reports.find(r => r.id === reportId);
    if (r) { r.status = 'viewed'; await saveReports(reports); }
    await saveAdminLog({ type: 'view_report', target: reportId, details: 'Взята в работу' });
    allReportsData = reports;
    renderReports();
    updateStats();
};

window.massTakeInWork = async function() {
    const reports = await getReports();
    reports.forEach(r => { if (selectedReports.has(r.id) && r.status === 'new') r.status = 'viewed'; });
    await saveReports(reports);
    selectedReports.clear();
    updateMassActionsUI();
    allReportsData = reports;
    renderReports();
    showToast('Жалобы взяты в работу', 'success');
};

window.massResolve = async function() {
    const reports = await getReports();
    reports.forEach(r => { if (selectedReports.has(r.id)) r.status = 'resolved'; });
    await saveReports(reports);
    selectedReports.clear();
    updateMassActionsUI();
    await loadReports();
    showToast('Жалобы отмечены решёнными', 'success');
};

window.deleteReport = async function(reportId) {
    if (!confirm('Удалить жалобу навсегда?')) return;
    const reports = await getReports();
    const filtered = reports.filter(r => r.id !== reportId);
    await saveReports(filtered);
    await saveAdminLog({ type: 'delete_report', target: reportId, details: 'Жалоба удалена' });
    allReportsData = filtered;
    renderReports();
    updateStats();
    showToast('Жалоба удалена', 'success');
};

window.dismissReport = async function(reportId) {
    const reports = await getReports();
    const r = reports.find(r => r.id === reportId);
    if (r) { r.status = 'resolved'; await saveReports(reports); }
    await saveAdminLog({ type: 'dismiss_report', target: reportId, details: 'Жалоба отклонена' });
    allReportsData = reports;
    renderReports();
    updateStats();
    showToast('Жалоба отклонена', 'info');
};

window.resolveReport = async function(reportId) {
    const reports = await getReports();
    const r = reports.find(r => r.id === reportId);
    if (r) { r.status = 'resolved'; await saveReports(reports); }
    await saveAdminLog({ type: 'resolve_report', target: reportId, details: 'Жалоба закрыта' });
    await loadReports();
    showToast('Жалоба закрыта', 'success');
};

window.deleteAdFromReport = async function(adId, reportId) {
    if (!requireRole('delete_ad')) return;
    if (!confirm('Удалить объявление и выдать предупреждение продавцу?')) return;

    const ads = await getAllAds();
    const ad = ads.find(a => String(a.id) === String(adId));
    const author = ad?.author;

    // Удаляем объявление из коллекции ads/{adId}
    const deleted = await deleteAdById(adId);
    if (!deleted) { showToast('Ошибка удаления объявления', 'error'); return; }

    // Автоматически выдаём предупреждение продавцу
    if (author) {
        const violation = { type: 'warn', reason: 'violation', note: 'Объявление удалено модератором', admin: currentUser?.nickname || 'admin' };
        await saveUserViolation(author, violation);
        await saveAdminLog({ type: 'warn_user', target: author, details: `Автопредупреждение при удалении объявления "${ad?.title}"` });
        showToast(`Предупреждение выдано: ${author}`, 'info');
    }

    // Закрываем жалобу автоматически
    const reports = await getReports();
    reports.forEach(r => { if (r.adId == adId || r.id === reportId) r.status = 'resolved'; });
    await saveReports(reports);

    await saveAdminLog({ type: 'delete_ad', target: adId, details: `Удалено "${ad?.title}" по жалобе #${reportId}` });
    await loadReports();
    showToast('Объявление удалено, предупреждение выдано', 'success');
};

window.viewReportAd = async function(adId) {
    try {
        // Сначала пробуем прочитать напрямую из Firestore по ID
        const adSnap = await getDoc(doc(db, 'ads', String(adId)));
        if (adSnap.exists()) {
            openAdModal({ id: adSnap.id, ...adSnap.data() });
            return;
        }
        // Fallback — ищем в списке всех объявлений
        const ads = await getAllAds();
        const ad = ads.find(a => String(a.id) === String(adId));
        if (!ad) { showToast('Объявление не найдено (возможно уже удалено)', 'warning'); return; }
        openAdModal(ad);
    } catch(e) {
        console.error('Ошибка просмотра объявления:', e);
        showToast('Ошибка загрузки объявления', 'error');
    }
};

// ===== МОДАЛКА ПРОСМОТРА ОБЪЯВЛЕНИЯ =====
function openAdModal(ad) {
    const existing = document.getElementById('adminAdModal');
    if (existing) existing.remove();
    const priceFormatted = ad.price ? ad.price.toLocaleString('ru-RU') + ' ₽' : '—';
    const date = ad.createdAt ? new Date(ad.createdAt).toLocaleString('ru-RU') : '—';
    const photos = ad.photos?.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">${ad.photos.map(p => `<img src="${p}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;">`).join('')}</div>` : '';

    const overlay = document.createElement('div');
    overlay.id = 'adminAdModal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
    <div style="background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;width:100%;max-width:520px;max-height:85vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h3 style="color:white;margin:0;">${escapeHtml(ad.title)}</h3>
            <button onclick="document.getElementById('adminAdModal').remove()" style="background:rgba(255,255,255,0.1);border:none;color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:18px;">×</button>
        </div>
        <p style="color:#ff1e1e;font-size:22px;font-weight:700;margin:0 0 12px;">${priceFormatted}</p>
        ${photos}
        ${ad.description ? `<p style="color:#ccc;margin-bottom:16px;">${escapeHtml(ad.description)}</p>` : ''}
        ${renderAdDetails(ad)}
        <div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:12px;margin-top:12px;display:flex;justify-content:space-between;font-size:13px;color:#666;">
            <span>Продавец: <b style="color:#aaa;">${escapeHtml(ad.author)}</b></span>
            <span>${date}</span>
        </div>
        ${canDo('delete_ad') ? `<button onclick="deleteAdDirect(${ad.id})" style="margin-top:12px;width:100%;padding:10px;background:#f4433620;border:1px solid #f4433640;color:#f44336;border-radius:8px;cursor:pointer;">🗑 Удалить объявление</button>` : ''}
        ${canDo('ban') ? `<button onclick="openPunishModal('${ad.author}')" style="margin-top:8px;width:100%;padding:10px;background:#ff980020;border:1px solid #ff980040;color:#ff9800;border-radius:8px;cursor:pointer;">🔨 Наказать продавца</button>` : ''}
    </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

window.deleteAdDirect = async function(adId) {
    if (!requireRole('delete_ad')) return;
    if (!confirm('Удалить объявление?')) return;
    const deleted = await deleteAdById(adId);
    if (!deleted) { showToast('Ошибка удаления', 'error'); return; }
    await saveAdminLog({ type: 'delete_ad', target: adId, details: 'Прямое удаление из просмотра' });
    document.getElementById('adminAdModal')?.remove();
    showToast('Объявление удалено', 'success');
};

function renderAdDetails(ad) {
    if (!ad || ad.category !== 'cars') return '';
    const parts = [];
    if (ad.firmware) parts.push(`<span style="background:rgba(255,30,30,0.1);border:1px solid rgba(255,30,30,0.2);color:#ff6b6b;padding:4px 10px;border-radius:6px;font-size:13px;">⚙️ ${ad.firmware}</span>`);
    if (ad.lights?.underglow?.has) parts.push(`<span style="background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.2);color:#ffa726;padding:4px 10px;border-radius:6px;font-size:13px;">💡 Подсветка</span>`);
    if (ad.lights?.strobe?.has) parts.push(`<span style="background:rgba(156,39,176,0.1);border:1px solid rgba(156,39,176,0.2);color:#ce93d8;padding:4px 10px;border-radius:6px;font-size:13px;">🔴 Стробы</span>`);
    if (ad.suspension?.length) ad.suspension.forEach(s => parts.push(`<span style="background:rgba(33,150,243,0.1);border:1px solid rgba(33,150,243,0.2);color:#64b5f6;padding:4px 10px;border-radius:6px;font-size:13px;">🔧 ${s === 'pneumatic' ? 'Пневма' : 'Гидравлика'}</span>`));
    if (!parts.length) return '';
    return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">${parts.join('')}</div>`;
}

// ===== ИСТОРИЯ НАРУШЕНИЙ =====
async function getUserViolations(nickname) {
    try {
        const snap = await getDoc(doc(db, 'data', 'violations'));
        const v = snap.exists() ? snap.data().items || {} : {};
        return v[nickname] || [];
    } catch(e) { return []; }
}

async function saveUserViolation(nickname, violation) {
    try {
        const snap = await getDoc(doc(db, 'data', 'violations'));
        const v = snap.exists() ? snap.data().items || {} : {};
        if (!v[nickname]) v[nickname] = [];
        v[nickname].push({ ...violation, date: new Date().toISOString(), id: Date.now() });
        await setDoc(doc(db, 'data', 'violations'), { items: v });
    } catch(e) { console.error('Ошибка сохранения нарушения:', e); }
}

async function determineBanLevel(nickname) {
    const v = await getUserViolations(nickname);
    const count = v.length;
    if (count === 0) return 'warn';
    if (count === 1) return 'ban_1h';
    if (count === 2) return 'ban_24h';
    if (count === 3) return 'ban_7d';
    if (count === 4) return 'ban_30d';
    return 'ban_perm';
}

// ===== МОДАЛКА НАКАЗАНИЯ (оригинальный стиль) =====
window.openPunishModal = async function(nickname, reportId) {
    if (!canDo('ban') && !canDo('warn')) return;
    if (isProcessing('punish_' + nickname)) return;
    const existing = document.getElementById('punishmentModal');
    if (existing) existing.remove();

    const violations = await getUserViolations(nickname);
    const suggestedLevel = await determineBanLevel(nickname);

    const modal = document.createElement('div');
    modal.className = 'punishment-modal-overlay';
    modal.id = 'punishmentModal';
    modal.innerHTML = `
        <div class="punishment-modal-content">
            <button class="modal-close" onclick="closePunishmentModal()">&times;</button>
            <h2>🛡️ Наказание для ${escapeHtml(nickname)}</h2>

            <div class="violations-history">
                <h4>История нарушений (${violations.length})</h4>
                ${violations.length ? violations.map(v => `
                    <div class="violation-item ${v.type}">
                        <span class="violation-type">${BAN_LEVELS[v.type]?.name || v.type}</span>
                        <span class="violation-date">${new Date(v.date).toLocaleDateString('ru-RU')}</span>
                        <p>${escapeHtml(v.reason || '')}${v.note ? ': ' + escapeHtml(v.note) : ''}</p>
                    </div>
                `).join('') : '<p class="no-violations">Нет нарушений</p>'}
            </div>

            <div class="suggested-punishment">
                <p>Рекомендуемое наказание: <strong style="color:${BAN_LEVELS[suggestedLevel].color}">${BAN_LEVELS[suggestedLevel].name}</strong></p>
            </div>

            <div style="margin-bottom:16px;">
                <label style="display:block;color:#888;font-size:13px;margin-bottom:10px;">Причина наказания</label>
                <div id="punishmentReasonBtns" style="display:flex;flex-wrap:wrap;gap:8px;">
                    <button type="button" data-value="spam"   onclick="selectPunishReason(this)" style="padding:8px 14px;border-radius:8px;border:1.5px solid rgba(255,30,30,0.6);background:rgba(255,30,30,0.15);color:#ff6b6b;font-size:13px;cursor:pointer;">Спам / Реклама</button>
                    <button type="button" data-value="scam"   onclick="selectPunishReason(this)" style="padding:8px 14px;border-radius:8px;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#aaa;font-size:13px;cursor:pointer;">Мошенничество</button>
                    <button type="button" data-value="insult" onclick="selectPunishReason(this)" style="padding:8px 14px;border-radius:8px;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#aaa;font-size:13px;cursor:pointer;">Оскорбления</button>
                    <button type="button" data-value="fake"   onclick="selectPunishReason(this)" style="padding:8px 14px;border-radius:8px;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#aaa;font-size:13px;cursor:pointer;">Фейк</button>
                    <button type="button" data-value="other"  onclick="selectPunishReason(this)" style="padding:8px 14px;border-radius:8px;border:1.5px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:#aaa;font-size:13px;cursor:pointer;">Другое</button>
                </div>
                <input type="hidden" id="punishmentReason" value="spam">
            </div>

            <div style="margin-bottom:20px;">
                <label style="display:block;color:#888;font-size:13px;margin-bottom:8px;">Комментарий (необязательно)</label>
                <textarea id="punishmentNote" placeholder="Дополнительные комментарии..." style="width:100%;padding:10px 14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;color:white;font-size:14px;outline:none;resize:vertical;min-height:72px;font-family:inherit;box-sizing:border-box;"></textarea>
            </div>

            <div class="punishment-actions">
                ${Object.entries(BAN_LEVELS).map(([key, cfg]) => `
                    <button class="punishment-btn"
                        style="border-color:${cfg.color};color:${cfg.color};"
                        data-nick="${escapeHtml(nickname)}"
                        data-level="${key}"
                        data-report="${reportId || ''}"
                        onclick="executePunishment(this.dataset.nick, this.dataset.level, this.dataset.report)">
                        ${cfg.name}
                    </button>
                `).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));
    modal.addEventListener('click', e => { if (e.target === modal) closePunishmentModal(); });
};

window.closePunishmentModal = function() {
    const modal = document.getElementById('punishmentModal');
    if (modal) { modal.classList.remove('active'); setTimeout(() => modal.remove(), 300); }
};

window.selectPunishReason = function(btn) {
    document.querySelectorAll('#punishmentReasonBtns button').forEach(b => {
        b.style.border = '1.5px solid rgba(255,255,255,0.1)';
        b.style.background = 'rgba(255,255,255,0.05)';
        b.style.color = '#aaa';
    });
    btn.style.border = '1.5px solid rgba(255,30,30,0.6)';
    btn.style.background = 'rgba(255,30,30,0.15)';
    btn.style.color = '#ff6b6b';
    document.getElementById('punishmentReason').value = btn.dataset.value;
};

window.executePunishment = async function(nickname, level, reportId) {
    if (!requireRole('ban')) return;
    if (!nickname || !level) { showToast('Ошибка: не указан ник или уровень', 'error'); return; }
    const cfg = BAN_LEVELS[level];
    if (!cfg) { showToast('Неизвестный уровень наказания: ' + level, 'error'); return; }

    const reason = document.getElementById('punishmentReason')?.value || 'other';
    const note   = document.getElementById('punishmentNote')?.value?.trim() || '';

    // Блокируем кнопки чтобы не нажали дважды
    document.querySelectorAll('.punishment-btn').forEach(b => b.disabled = true);

    try {
        const violation = { type: level, reason, note, admin: currentUser?.nickname || 'Unknown' };
        await saveUserViolation(nickname, violation);

        if (level !== 'warn') {
            const snap = await getDoc(doc(db, 'data', 'bannedUsers'));
            const bannedUsers = snap.exists() ? snap.data().items || {} : {};
            bannedUsers[nickname] = {
                until: cfg.duration === -1 ? 'permanent' : Date.now() + cfg.duration,
                reason, note, admin: violation.admin,
                date: new Date().toISOString(), level
            };
            await setDoc(doc(db, 'data', 'bannedUsers'), { items: bannedUsers });

            const ads = await getAllAds();
            const toDelete = ads.filter(a => a.author === nickname || a.author?.toLowerCase() === nickname.toLowerCase());
            for (const ad of toDelete) {
                await deleteAdById(ad.id);
            }
            const deleted = toDelete.length;
            if (deleted > 0) showToast(`Удалено ${deleted} объявлений от ${nickname}`, 'info');
        }

        // Автозакрытие жалобы после наказания
        if (reportId) {
            const reports = await getReports();
            const r = reports.find(r => String(r.id) === String(reportId));
            if (r) { r.status = 'resolved'; await saveReports(reports); }
        }

        await saveAdminLog({
            type: level === 'warn' ? 'warn_user' : 'ban_user',
            target: nickname,
            details: `${cfg.name}${note ? ': ' + note : ''} (Причина: ${reason})`
        });

        closePunishmentModal();

        const toast = document.createElement('div');
        toast.className = 'punishment-toast';
        toast.innerHTML = `<strong>${cfg.name}</strong> применено к ${escapeHtml(nickname)}`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2000);
        }, 100);

        await loadReports();
        updateStats();

    } catch(e) {
        console.error('Ошибка применения наказания:', e);
        showToast('Ошибка: ' + e.message, 'error');
        document.querySelectorAll('.punishment-btn').forEach(b => b.disabled = false);
    }
};

// ===== БАНЫ =====
async function loadBans() {
    const panel = document.getElementById('bansPanel');
    if (!panel) return;
    const banned = await getBannedUsers();
    const entries = Object.entries(banned);
    if (!entries.length) { panel.innerHTML = `<div class="empty-state"><p>Нет заблокированных пользователей</p></div>`; return; }

    panel.innerHTML = `
    <div class="bans-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 style="color:white;margin:0;">Заблокированные пользователи (${entries.length})</h3>
    </div>
    <div class="bans-list">
    ${entries.map(([nick, info]) => {
        const isPerm = info.until === 'permanent';
        const expired = !isPerm && Date.now() > info.until;
        const remaining = isPerm ? '∞' : expired ? 'Истёк' : formatRemaining(info.until - Date.now());
        const color = expired ? '#666' : isPerm ? '#9c27b0' : '#f44336';
        return `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:14px;margin-bottom:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <div style="width:40px;height:40px;border-radius:50%;background:${color}22;border:2px solid ${color}44;display:flex;align-items:center;justify-content:center;font-weight:700;color:${color};flex-shrink:0;">${nick.charAt(0).toUpperCase()}</div>
            <div style="flex:1;min-width:120px;">
                <div style="color:white;font-weight:600;">${escapeHtml(nick)}</div>
                <div style="color:#888;font-size:12px;margin-top:2px;">${escapeHtml(info.reason || '—')}</div>
                <div style="color:#555;font-size:11px;">Заблокировал: ${escapeHtml(info.bannedBy || '—')}</div>
            </div>
            <div style="text-align:right;">
                <div style="color:${color};font-weight:600;font-size:14px;">${remaining}</div>
                <div style="color:#555;font-size:11px;">${new Date(info.bannedAt).toLocaleDateString('ru-RU')}</div>
            </div>
            <button onclick="unbanUser('${nick}')" style="padding:8px 14px;background:rgba(76,175,80,0.1);border:1px solid rgba(76,175,80,0.3);color:#4caf50;border-radius:8px;cursor:pointer;font-size:13px;">Разбанить</button>
        </div>`;
    }).join('')}
    </div>`;
}

window.unbanUser = async function(nickname) {
    if (!requireRole('unban')) return;
    if (!confirm(`Разбанить ${nickname}?`)) return;
    const banned = await getBannedUsers();
    delete banned[nickname];
    await saveBannedUsers(banned);
    await saveAdminLog({ type: 'unban_user', target: nickname, details: 'Ручной разбан' });
    await loadBans();
    showToast(`${nickname} разбанен`, 'success');
};

// ===== ЖУРНАЛ =====
async function loadLogs() {
    const panel = document.getElementById('logsList');
    if (!panel) return;
    const logs = await getAdminLogs();
    const actionFilter = document.getElementById('logActionFilter')?.value || 'all';
    const search = document.getElementById('logSearch')?.value.toLowerCase() || '';
    let filtered = logs;
    if (actionFilter !== 'all') filtered = filtered.filter(l => l.action === actionFilter);
    if (search) filtered = filtered.filter(l => (l.admin+l.target+l.details).toLowerCase().includes(search));

    const typeLabels = {
        delete_ad:      '🗑 Удаление',
        ban_user:       '🔨 Бан',
        warn_user:      '⚠️ Предупреждение',
        resolve_report: '✓ Жалоба закрыта',
        unban_user:     '✅ Разбан',
        view_report:    '👁 Взята в работу',
        assign_role:    '👤 Назначена роль',
        remove_role:    '❌ Роль снята',
        pin_ad:         '📌 Пин объявления',
    };
    const typeColors = {
        delete_ad:      '#f44336',
        ban_user:       '#9c27b0',
        warn_user:      '#ff9800',
        resolve_report: '#4caf50',
        unban_user:     '#2196f3',
        view_report:    '#607d8b',
        assign_role:    '#00bcd4',
        remove_role:    '#ff5722',
        pin_ad:         '#ffc107',
    };

    const table = document.getElementById('logsTable');
    if (!table) return;
    if (!filtered.length) { table.innerHTML = `<div class="empty-state"><p>Нет записей</p></div>`; return; }
    table.innerHTML = filtered.map(l => {
        const color = typeColors[l.action] || '#888';
        const roleIcon = ROLE_CONFIG[l.role]?.icon || '👤';
        return `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="padding:4px 8px;background:${color}18;border-radius:6px;font-size:12px;color:${color};white-space:nowrap;flex-shrink:0;">${typeLabels[l.action] || l.action}</div>
            <div style="flex:1;min-width:0;">
                <div style="color:white;font-size:13px;">${escapeHtml(l.details || '—')}</div>
                <div style="color:#666;font-size:11px;margin-top:3px;">${roleIcon} ${escapeHtml(l.admin)} · ${formatDate(l.timestamp)}</div>
            </div>
        </div>`;
    }).join('');
}

// Фильтры журнала
document.getElementById('logActionFilter')?.addEventListener('change', loadLogs);
document.getElementById('logSearch')?.addEventListener('input', loadLogs);

// ===== СТАТИСТИКА ПЛАТФОРМЫ (только Owner) =====
async function loadPlatformStats() {
    const panel = document.getElementById('platformPanel');
    if (!panel) return;
    const [ads, reports, banned, logs] = await Promise.all([getAllAds(), getReports(), getBannedUsers(), getAdminLogs()]);
    const bannedCount = Object.keys(banned).length;
    const todayLogs = logs.filter(l => l.timestamp?.startsWith(new Date().toISOString().split('T')[0]));
    const categories = {};
    ads.forEach(ad => { categories[ad.category] = (categories[ad.category] || 0) + 1; });
    const catNames = { cars:'Машины', houses:'Дома', garages:'Гаражи', business:'Бизнесы', accessories:'Аксессуары', skins:'Скины', other:'Разное' };

    panel.innerHTML = `
    <h3 style="color:white;margin:0 0 20px;">📊 Статистика платформы</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px;">
        ${[['📋','Объявлений',ads.length,'#ff6b6b'],['🚩','Жалоб',reports.length,'#ffa726'],['🔨','Заблок.',bannedCount,'#ce93d8'],['⚡','Действий сегодня',todayLogs.length,'#4fc3f7']].map(([icon,label,val,color]) => `
        <div style="background:rgba(17,17,17,0.9);border:1px solid ${color}22;border-radius:12px;padding:16px;text-align:center;">
            <div style="font-size:28px;">${icon}</div>
            <div style="font-size:26px;font-weight:700;color:${color};margin:6px 0;">${val}</div>
            <div style="color:#666;font-size:13px;">${label}</div>
        </div>`).join('')}
    </div>
    <h4 style="color:#888;margin:0 0 12px;font-size:14px;text-transform:uppercase;letter-spacing:1px;">По категориям</h4>
    <div style="display:flex;flex-direction:column;gap:8px;">
        ${Object.entries(categories).sort((a,b)=>b[1]-a[1]).map(([cat,count]) => {
            const pct = Math.round(count / ads.length * 100);
            return `<div style="display:flex;align-items:center;gap:10px;">
                <span style="color:#aaa;width:90px;font-size:13px;">${catNames[cat]||cat}</span>
                <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:4px;height:8px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#ff1e1e,#ff6b6b);border-radius:4px;"></div>
                </div>
                <span style="color:#666;font-size:13px;width:40px;text-align:right;">${count}</span>
            </div>`;
        }).join('')}
    </div>`;
}

// ===== УПРАВЛЕНИЕ РОЛЯМИ (только Owner) =====
// ─────────────────────────────────────────────
// 🏅 УПРАВЛЕНИЕ БЕЙДЖАМИ
// ─────────────────────────────────────────────
const BADGES_CONFIG = {
    zbt_member:    { icon: '🔥', label: 'Участник ЗБТ',        rarity: 'rare',      color: '#ff6b35' },
    first_100:     { icon: '⚡', label: 'Первые 100',           rarity: 'legendary', color: '#ffd700' },
    founder:       { icon: '👑', label: 'Основатель',           rarity: 'legendary', color: '#ffd700' },
    administrator: { icon: '🛡️', label: 'Администратор',        rarity: 'special',   color: '#e05fff' },
    moderator:     { icon: '🔨', label: 'Модератор',            rarity: 'special',   color: '#5b9dff' },
    veteran:       { icon: '⭐', label: 'Ветеран Black Market',  rarity: 'rare',      color: '#a8e063' },
    verified:      { icon: '🛡️', label: 'Проверенный продавец', rarity: 'uncommon',  color: '#4ecdc4' },
    trusted:       { icon: '💎', label: 'Надёжный продавец',    rarity: 'rare',      color: '#74b9ff' },
    top_seller:    { icon: '🏆', label: 'Топ продавец месяца',  rarity: 'legendary', color: '#ffd700' },
    bug_hunter:    { icon: '🐞', label: 'Охотник за багами',    rarity: 'uncommon',  color: '#ff7675' },
    active_tester: { icon: '🏅', label: 'Активный тестер',      rarity: 'uncommon',  color: '#fdcb6e' },
    zbt_legend:    { icon: '🏆', label: 'Легенда ЗБТ',          rarity: 'legendary', color: '#ffd700' },
    early_bird:    { icon: '🚀', label: 'Ранний сторонник',     rarity: 'rare',      color: '#a29bfe' },
};

async function loadBadgesPanel() {
    const panel = document.getElementById('badgesPanel');
    if (!panel) return;

    const users = await getUsers();

    panel.innerHTML = `
    <h3 style="color:white;margin:0 0 20px;">🏅 Управление бейджами</h3>

    <!-- Форма выдачи -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px;margin-bottom:20px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
            <div style="flex:1;min-width:150px;">
                <label style="color:#888;font-size:12px;display:block;margin-bottom:6px;">Никнейм</label>
                <input id="badgeNickInput" placeholder="Введите никнейм..." list="badgeNickList"
                    style="width:100%;padding:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;font-size:14px;box-sizing:border-box;">
                <datalist id="badgeNickList">
                    ${users.map(u => `<option value="${escapeHtml(u.nickname)}">`).join('')}
                </datalist>
            </div>
            <div style="min-width:220px;">
                <label style="color:#888;font-size:12px;display:block;margin-bottom:6px;">Бейдж</label>
                <select id="badgeKeySelect" style="width:100%;padding:10px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;font-size:14px;">
                    ${Object.entries(BADGES_CONFIG).map(([key, cfg]) =>
                        `<option value="${key}">${cfg.icon} ${cfg.label}</option>`
                    ).join('')}
                </select>
            </div>
            <div style="display:flex;gap:8px;">
                <button onclick="grantBadge()" style="padding:10px 18px;background:linear-gradient(135deg,#1D9E75,#0d7a59);border:none;border-radius:8px;color:white;font-weight:600;cursor:pointer;">✅ Выдать</button>
                <button onclick="revokeBadge()" style="padding:10px 18px;background:rgba(255,30,30,0.15);border:1px solid rgba(255,30,30,0.3);border-radius:8px;color:#ff6b6b;font-weight:600;cursor:pointer;">❌ Забрать</button>
            </div>
        </div>
    </div>

    <!-- Список юзеров с бейджами -->
    <div id="badgesUserList">
        ${users.filter(u => u.badges?.length).length === 0
            ? '<div style="color:#555;text-align:center;padding:24px;">Ни у кого пока нет бейджей</div>'
            : users.filter(u => u.badges?.length).map(u => `
                <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:8px;flex-wrap:wrap;">
                    <div style="font-weight:600;color:white;min-width:100px;">${escapeHtml(u.nickname)}</div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;flex:1;">
                        ${u.badges.map(k => {
                            const cfg = BADGES_CONFIG[k];
                            return cfg ? `<span style="background:${cfg.color}18;color:${cfg.color};border:1px solid ${cfg.color}40;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600;">${cfg.icon} ${cfg.label}</span>` : '';
                        }).join('')}
                    </div>
                </div>`
            ).join('')
        }
    </div>`;
}

window.grantBadge = async function() {
    if (!requireRole('manage_roles')) return;
    const nick = document.getElementById('badgeNickInput')?.value.trim();
    const key  = document.getElementById('badgeKeySelect')?.value;
    if (!nick) { showToast('Введите никнейм', 'error'); return; }

    const users = await getUsers();
    const idx = users.findIndex(u => u.nickname === nick);
    if (idx === -1) { showToast('Пользователь не найден', 'error'); return; }

    const badges = users[idx].badges || [];
    if (badges.includes(key)) { showToast('Бейдж уже есть', 'warning'); return; }
    users[idx].badges = [...badges, key];
    await saveUsers(users);
    await saveAdminLog({ type: 'grant_badge', target: nick, details: `Бейдж: ${BADGES_CONFIG[key]?.label}` });
    showToast(`Бейдж "${BADGES_CONFIG[key]?.label}" выдан ${nick}`, 'success');
    await loadBadgesPanel();
};

window.revokeBadge = async function() {
    if (!requireRole('manage_roles')) return;
    const nick = document.getElementById('badgeNickInput')?.value.trim();
    const key  = document.getElementById('badgeKeySelect')?.value;
    if (!nick) { showToast('Введите никнейм', 'error'); return; }

    const users = await getUsers();
    const idx = users.findIndex(u => u.nickname === nick);
    if (idx === -1) { showToast('Пользователь не найден', 'error'); return; }

    const before = users[idx].badges || [];
    users[idx].badges = before.filter(b => b !== key);
    if (before.length === users[idx].badges.length) { showToast('У пользователя нет этого бейджа', 'warning'); return; }
    await saveUsers(users);
    await saveAdminLog({ type: 'revoke_badge', target: nick, details: `Бейдж: ${BADGES_CONFIG[key]?.label}` });
    showToast(`Бейдж "${BADGES_CONFIG[key]?.label}" забран у ${nick}`, 'success');
    await loadBadgesPanel();
};

async function loadRoles() {
    const panel = document.getElementById('rolesPanel');
    if (!panel) return;
    const roles = await getRoles();

    panel.innerHTML = `
    <h3 style="color:white;margin:0 0 20px;">👥 Управление ролями</h3>
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px;margin-bottom:16px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
            <div style="flex:1;min-width:150px;">
                <label style="color:#888;font-size:12px;display:block;margin-bottom:6px;">Никнейм</label>
                <input id="roleNickInput" placeholder="Введите никнейм..." style="width:100%;padding:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;font-size:14px;box-sizing:border-box;">
            </div>
            <div style="min-width:180px;">
                <label style="color:#888;font-size:12px;display:block;margin-bottom:6px;">Роль</label>
                <div style="position:relative;">
                    <div id="roleSelectBtn" onclick="toggleRoleDropdown()" style="padding:10px 36px 10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;font-size:14px;cursor:pointer;user-select:none;">
                        🔨 Модератор
                    </div>
                    <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:#888;pointer-events:none;">▾</span>
                    <div id="roleDropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:#1a1a1a;border:1px solid rgba(255,255,255,0.12);border-radius:8px;margin-top:4px;z-index:100;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.5);">
                        <div onclick="selectRole('moder','🔨 Модератор')" style="padding:11px 14px;cursor:pointer;color:#74b9ff;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);" onmouseover="this.style.background='rgba(116,185,255,0.1)'" onmouseout="this.style.background=''">🔨 Модератор</div>
                        <div onclick="selectRole('admin','🛡 Администратор')" style="padding:11px 14px;cursor:pointer;color:#ff6b6b;font-size:14px;border-bottom:1px solid rgba(255,255,255,0.05);" onmouseover="this.style.background='rgba(255,107,107,0.1)'" onmouseout="this.style.background=''">🛡 Администратор</div>
                        <div onclick="selectRole('owner','👑 Владелец')" style="padding:11px 14px;cursor:pointer;color:#f9ca24;font-size:14px;" onmouseover="this.style.background='rgba(249,202,36,0.1)'" onmouseout="this.style.background=''">👑 Владелец</div>
                    </div>
                    <input type="hidden" id="roleSelect" value="moder">
                </div>
            </div>
            <button onclick="assignRole()" style="padding:10px 20px;background:linear-gradient(135deg,#ff1e1e,#cc0000);border:none;border-radius:8px;color:white;font-weight:600;cursor:pointer;">Назначить</button>
        </div>
    </div>
    <div id="rolesList">
        ${Object.entries(roles).length === 0 ? '<div class="empty-state"><p>Нет назначенных ролей</p></div>' :
        Object.entries(roles).map(([nick, role]) => {
            const cfg = ROLE_CONFIG[role] || {};
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;margin-bottom:8px;">
                <div style="width:38px;height:38px;border-radius:50%;background:${cfg.color}22;border:2px solid ${cfg.color}44;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${cfg.icon||'?'}</div>
                <div style="flex:1;">
                    <div style="color:white;font-weight:600;">${escapeHtml(nick)}</div>
                    <div style="color:${cfg.color};font-size:13px;">${cfg.name||role}</div>
                </div>
                ${nick !== currentUser.nickname ? `<button onclick="removeRole('${nick}')" style="padding:6px 12px;background:rgba(244,67,54,0.1);border:1px solid rgba(244,67,54,0.3);color:#f44336;border-radius:6px;cursor:pointer;font-size:12px;">Снять</button>` : '<span style="color:#555;font-size:12px;">Вы</span>'}
            </div>`;
        }).join('')}
    </div>`;
}

window.toggleRoleDropdown = function() {
    const drop = document.getElementById('roleDropdown');
    if (drop) drop.style.display = drop.style.display === 'none' ? 'block' : 'none';
};
window.selectRole = function(value, label) {
    document.getElementById('roleSelect').value = value;
    document.getElementById('roleSelectBtn').textContent = label;
    document.getElementById('roleDropdown').style.display = 'none';
};
// Закрываем при клике вне
document.addEventListener('click', (e) => {
    if (!e.target.closest('#roleSelectBtn') && !e.target.closest('#roleDropdown')) {
        const drop = document.getElementById('roleDropdown');
        if (drop) drop.style.display = 'none';
    }
});

window.assignRole = async function() {
    if (!requireRole('manage_roles')) return;
    const nick = document.getElementById('roleNickInput')?.value.trim();
    const role = document.getElementById('roleSelect')?.value;
    if (!nick) { showToast('Введите никнейм', 'error'); return; }
    const roles = await getRoles();
    roles[nick] = role;
    await saveRoles(roles);
    await saveAdminLog({ type: 'assign_role', target: nick, details: `Роль: ${ROLE_CONFIG[role]?.name}` });
    await loadRoles();
    showToast(`Роль ${ROLE_CONFIG[role]?.name} назначена ${nick}`, 'success');
};

window.removeRole = async function(nick) {
    if (!requireRole('manage_roles')) return;
    if (!confirm(`Снять роль с ${nick}?`)) return;
    const roles = await getRoles();
    delete roles[nick];
    await saveRoles(roles);
    await saveAdminLog({ type: 'remove_role', target: nick, details: 'Роль снята' });
    await loadRoles();
    showToast(`Роль снята с ${nick}`, 'success');
};

// ===== ВСПОМОГАТЕЛЬНЫЕ =====
function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function formatRemaining(ms) {
    if (ms <= 0) return 'Истёк';
    const h = Math.floor(ms / 3600000);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d} д ${h % 24} ч`;
    return `${h} ч`;
}

window.switchTab = window.switchTab;

// ===== ПИН ОБЪЯВЛЕНИЙ (admin+) =====
window.togglePinAd = async function(adId) {
    if (!canDo('pin_ad')) { showToast('Недостаточно прав', 'error'); return; }
    const adRef = doc(db, 'ads', String(adId));
    const snap = await getDoc(adRef);
    if (!snap.exists()) { showToast('Объявление не найдено', 'error'); return; }
    const pinned = !snap.data().pinned;
    const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    await updateDoc(adRef, { pinned });
    await saveAdminLog({ type: 'pin_ad', target: adId, details: pinned ? 'Закреплено' : 'Откреплено' });
    showToast(pinned ? '📌 Объявление закреплено' : 'Объявление откреплено', 'success');
};

// ===== ВЕРИФИКАЦИЯ ПРОДАВЦА (owner) =====
window.toggleVerify = async function(nickname) {
    if (!canDo('manage_roles')) { showToast('Недостаточно прав', 'error'); return; }
    const ads = await getAllAds();
    const hasVerified = ads.some(a => a.author === nickname && a.verifiedSeller);
    const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
    for (const ad of ads) {
        if (ad.author === nickname) {
            await updateDoc(doc(db, 'ads', String(ad.id)), { verifiedSeller: !hasVerified });
        }
    }
    showToast(hasVerified ? `Верификация снята с ${nickname}` : `${nickname} верифицирован ✓`, 'success');
};


// ===== БАГ-РЕПОРТЫ =====
async function loadBugReports() {
    const panel = document.getElementById('bugReportsPanel');
    if (!panel) return;

    panel.innerHTML = '<div style="text-align:center;padding:40px;color:#555;">Загрузка...</div>';

    try {
        const reports = await getReports();
        // Баг-репорты — те у которых есть поле type (не жалобы на объявления)
        const bugReports = reports.filter(r => r.type && ['bug','ui','performance','chat','ads','other'].includes(r.type));

        if (bugReports.length === 0) {
            panel.innerHTML = '<div style="text-align:center;padding:40px;color:#555;">🐛 Баг-репортов пока нет</div>';
            return;
        }

        const typeLabels = { bug:'🐛 Баг', ui:'🎨 Интерфейс', performance:'⚡ Тормоза', chat:'💬 Чат', ads:'📋 Объявления', other:'💡 Другое' };
        const statusColors = { new:'#ff9800', viewed:'#2196f3', resolved:'#4caf50' };

        panel.innerHTML = bugReports.map(r => `
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px;margin-bottom:10px;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:13px;font-weight:700;color:#ff9800;">${typeLabels[r.type] || r.type}</span>
                        <span style="font-size:11px;color:#555;">· ${escapeHtml(r.author)} · ${escapeHtml(r.server || '—')} · ${escapeHtml(r.page || '—')}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:11px;color:${statusColors[r.status] || '#888'};font-weight:600;text-transform:uppercase;">${r.status || 'new'}</span>
                        <span style="font-size:11px;color:#444;">${new Date(r.createdAt).toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
                        <button onclick="resolveBugReport(${r.id})" style="padding:4px 10px;background:rgba(76,175,80,0.15);border:1px solid rgba(76,175,80,0.3);border-radius:6px;color:#4caf50;font-size:12px;cursor:pointer;">✓ Решено</button>
                    </div>
                </div>
                <div style="font-size:14px;color:#ccc;line-height:1.6;">${escapeHtml(r.description)}</div>
            </div>
        `).join('');

    } catch(e) {
        panel.innerHTML = '<div style="text-align:center;padding:40px;color:#f44336;">Ошибка загрузки</div>';
    }
}

window.resolveBugReport = async function(reportId) {
    try {
        const reports = await getReports();
        const idx = reports.findIndex(r => r.id === reportId);
        if (idx !== -1) {
            reports[idx].status = 'resolved';
            await saveReports(reports);
            await loadBugReports();
            showToast('Отмечено как решённое', 'success');
        }
    } catch(e) {
        showToast('Ошибка', 'error');
    }
};