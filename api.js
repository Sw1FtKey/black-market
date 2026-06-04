// ===== API.JS — все обращения к Firestore =====
// Импортируй нужное: import { getAllAds, saveAd, getUsers } from './api.js';

import { db } from './firebase-config.js';
import {
    doc, getDoc, setDoc, deleteDoc,
    collection, getDocs, addDoc, query, orderBy, where,
    writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ─────────────────────────────────────────────
// ⚡ КЭШ — один раз загрузили, используем везде
// ─────────────────────────────────────────────
const CACHE_TTL = 30000; // 30 секунд
const _cache = {};

async function _cached(key, fetcher, ttl = CACHE_TTL) {
    const now = Date.now();
    if (_cache[key] && now - _cache[key].time < ttl) {
        return _cache[key].data;
    }
    const data = await fetcher();
    _cache[key] = { data, time: now };
    return data;
}

export function invalidateCache(key) {
    delete _cache[key];
}

export function invalidateAll() {
    Object.keys(_cache).forEach(k => delete _cache[k]);
}

// ─────────────────────────────────────────────
// 📋 ОБЪЯВЛЕНИЯ
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 📋 ОБЪЯВЛЕНИЯ — каждое в отдельном документе ads/{adId}
// Больше нет лимита 1MB — каждый документ до 1MB отдельно
// ─────────────────────────────────────────────

export async function getAllAds() {
    return _cached('ads', async () => {
        // Попытка 1
        try {
            const snap = await getDocs(collection(db, 'ads'));
            return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
        } catch (e) {
            console.warn('getAllAds: первая попытка неудачна, retry через 1.5с...', e?.code || e?.message);
        }

        // Retry через 1.5 секунды
        await new Promise(r => setTimeout(r, 1500));

        try {
            const snap = await getDocs(collection(db, 'ads'));
            return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
        } catch (e) {
            console.error('getAllAds: обе попытки неудачны:', e?.code || e?.message);
            return _cache['ads']?.data || [];
        }
    });
}

export async function saveAd(ad) {
    try {
        // Каждое объявление — отдельный документ с id как название
        const adRef = doc(db, 'ads', String(ad.id));
        await setDoc(adRef, { ...ad, createdAt: ad.createdAt || new Date().toISOString() });
        invalidateCache('ads');
        return true;
    } catch (e) {
        console.error('Ошибка сохранения объявления:', e);
        return false;
    }
}

export async function deleteAd(adId) {
    try {
        await deleteDoc(doc(db, 'ads', String(adId)));
        invalidateCache('ads');
        return true;
    } catch (e) {
        console.error('Ошибка удаления объявления:', e);
        return false;
    }
}

export async function updateAd(adId, updates) {
    try {
        const adRef = doc(db, 'ads', String(adId));
        await setDoc(adRef, { ...updates, updatedAt: new Date().toISOString() }, { merge: true });
        invalidateCache('ads');
        return true;
    } catch (e) {
        console.error('Ошибка обновления объявления:', e);
        return false;
    }
}

// ─────────────────────────────────────────────
// 👥 ПОЛЬЗОВАТЕЛИ
// ─────────────────────────────────────────────
export async function getUsers() {
    return _cached('users', async () => {
        try {
            const snap = await getDoc(doc(db, 'data', 'users'));
            return snap.exists() ? snap.data().items || [] : [];
        } catch (e) {
            console.error('Ошибка загрузки пользователей:', e);
            return [];
        }
    }, 60000); // кэш 60 секунд
}

export async function saveUsers(users) {
    await setDoc(doc(db, 'data', 'users'), { items: users });
    invalidateCache('users');
}

export async function findUser(nickname) {
    if (!nickname) return null;
    const users = await getUsers();
    return users.find(u => u.nickname?.toLowerCase() === nickname.toLowerCase().trim()) || null;
}

// ─────────────────────────────────────────────
// 🔨 БАНЫ
// ─────────────────────────────────────────────
export async function getBannedUsers() {
    return _cached('bannedUsers', async () => {
        try {
            const snap = await getDoc(doc(db, 'data', 'bannedUsers'));
            return snap.exists() ? snap.data().items || {} : {};
        } catch (e) { return {}; }
    }, 60000);
}

export async function checkBanStatus(nickname) {
    try {
        const bannedUsers = await getBannedUsers();
        const banInfo = bannedUsers[nickname];
        if (!banInfo) return { banned: false };

        if (banInfo.until === 'permanent') {
            return { banned: true, level: 'ban_perm', reason: banInfo.reason || 'Нарушение правил', remaining: Infinity };
        }

        if (Date.now() > banInfo.until) {
            delete bannedUsers[nickname];
            await setDoc(doc(db, 'data', 'bannedUsers'), { items: bannedUsers });
            invalidateCache('bannedUsers');
            return { banned: false, wasBanned: true };
        }

        const remaining = banInfo.until - Date.now();
        const hours = Math.ceil(remaining / (1000 * 60 * 60));
        return {
            banned: true,
            level: hours < 24 ? 'ban_1h' : 'ban_24h',
            reason: banInfo.reason || 'Нарушение правил',
            remaining,
            expiresAt: banInfo.until
        };
    } catch (e) {
        console.error('Ошибка проверки бана:', e);
        return { banned: false };
    }
}

// ─────────────────────────────────────────────
// 🚨 ЖАЛОБЫ
// ─────────────────────────────────────────────
export async function getReports() {
    return _cached('reports', async () => {
        try {
            const snap = await getDoc(doc(db, 'data', 'reports'));
            return snap.exists() ? snap.data().items || [] : [];
        } catch (e) { return []; }
    });
}

export async function saveReports(reports) {
    await setDoc(doc(db, 'data', 'reports'), { items: reports });
    invalidateCache('reports');
}

// ─────────────────────────────────────────────
// 🛡️ РОЛИ
// ─────────────────────────────────────────────
export async function getRoles() {
    return _cached('roles', async () => {
        try {
            const snap = await getDoc(doc(db, 'data', 'roles'));
            return snap.exists() ? snap.data().items || {} : {};
        } catch (e) { return {}; }
    }, 120000); // кэш 2 минуты
}

export async function getUserRole(nickname) {
    if (!nickname) return null;
    const roles = await getRoles();
    return roles[nickname] || roles[nickname?.toLowerCase()] || null;
}

export async function saveRoles(roles) {
    await setDoc(doc(db, 'data', 'roles'), { items: roles });
    invalidateCache('roles');
}

// ─────────────────────────────────────────────
// 📊 СТАТИСТИКА ОБЪЯВЛЕНИЙ
// ─────────────────────────────────────────────
export async function getAdStats(adId) {
    try {
        const snap = await getDoc(doc(db, 'adStats', String(adId)));
        return snap.exists() ? snap.data() : null;
    } catch (e) { return null; }
}

export async function saveAdStats(adId, data) {
    try {
        await setDoc(doc(db, 'adStats', String(adId)), data);
        return true;
    } catch (e) { return false; }
}

// ─────────────────────────────────────────────
// ⭐ ОТЗЫВЫ
// ─────────────────────────────────────────────
export async function getReviews(nickname) {
    try {
        const snap = await getDoc(doc(db, 'reviews', nickname));
        return snap.exists() ? snap.data().items || [] : [];
    } catch (e) { return []; }
}

export async function saveReview(nickname, review) {
    try {
        const ref = doc(db, 'reviews', nickname);
        const snap = await getDoc(ref);
        const items = snap.exists() ? snap.data().items || [] : [];
        items.unshift(review);
        if (items.length > 100) items.pop();
        await setDoc(ref, { items });
        return true;
    } catch (e) {
        console.error('Ошибка сохранения отзыва:', e);
        return false;
    }
}
