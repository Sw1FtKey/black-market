// ===== FAVORITES — избранные объявления (localStorage + статистика в Firebase) =====
import { db } from '../firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAllAds } from '../api.js';

export function getFavorites() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return [];
    const raw = JSON.parse(localStorage.getItem(`favorites_${user.nickname}`)) || [];
    // Нормализуем: всегда числа, без дублей
    return [...new Set(raw.map(id => Number(id)))];
}

export function saveFavorites(favorites) {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return;
    // Сохраняем всегда как числа без дублей
    const clean = [...new Set(favorites.map(id => Number(id)))];
    localStorage.setItem(`favorites_${user.nickname}`, JSON.stringify(clean));
}

export function isFavorite(adId) {
    return getFavorites().includes(adId);
}

export function toggleFavorite(adId) {
    let favorites = getFavorites();
    const wasInFav = favorites.includes(adId);
    if (wasInFav) {
        favorites = favorites.filter(id => id !== adId);
    } else {
        favorites.push(adId);
    }
    saveFavorites(favorites);
    updateFavCount();
    // Обновляем счётчик избранного в Firebase (adStats)
    updateFavoritesCountInFirebase(adId, !wasInFav);
    return !wasInFav;
}

export async function updateFavoritesCountInFirebase(adId, isAdding) {
    try {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        if (!user) return;
        const statsRef = doc(db, 'adStats', adId.toString());
        const snap = await getDoc(statsRef);
        const today = new Date().toISOString().split('T')[0];
        if (!snap.exists()) {
            // Создаём документ статистики если его ещё нет
            await setDoc(statsRef, {
                adId: adId,
                totalViews: 0,
                uniqueViewers: [],
                dailyViews: {},
                favoritesCount: isAdding ? 1 : 0,
                favoritesUsers: isAdding ? [user.nickname] : [],
                dailyFavs: isAdding ? { [today]: 1 } : {},
                createdAt: new Date().toISOString()
            });
        } else {
            const data = snap.data();
            const favUsers = data.favoritesUsers || [];
            const alreadyFaved = favUsers.includes(user.nickname);
            // Защита от дублирования
            if (isAdding && alreadyFaved) return;
            if (!isAdding && !alreadyFaved) return;
            const newUsers = isAdding
                ? [...favUsers, user.nickname]
                : favUsers.filter(u => u !== user.nickname);
            const dailyFavs = data.dailyFavs || {};
            if (isAdding) {
                dailyFavs[today] = (dailyFavs[today] || 0) + 1;
            }
            const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            await updateDoc(statsRef, {
                favoritesCount: Math.max(0, (data.favoritesCount || 0) + (isAdding ? 1 : -1)),
                favoritesUsers: newUsers,
                dailyFavs: dailyFavs
            });
        }
    } catch (e) {
        console.error('Ошибка обновления избранного в статистике:', e);
    }
}

export function updateFavCount() {
    const count = getFavorites().length;
    const badge = document.getElementById('favCount');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

export async function cleanupFavorites() {
    const favorites = getFavorites();
    if (favorites.length === 0) return;
    const allAds = await getAllAds();
    const existingIds = new Set(allAds.map(ad => Number(ad.id)));
    const cleaned = favorites.filter(id => existingIds.has(Number(id)));
    if (cleaned.length !== favorites.length) {
        saveFavorites(cleaned);
        updateFavCount();
    }
}
