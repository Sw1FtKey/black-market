// ===== API.JS — все обращения к Firestore =====
// Импортируй нужное: import { getAllAds, saveAd, getUsers } from './api.js';

import { db } from './firebase-config.js';
import { compressImage } from './utils.js';
import {
    doc, getDoc, setDoc, deleteDoc, updateDoc,
    collection, getDocs, addDoc, query, orderBy, where,
    writeBatch, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ─────────────────────────────────────────────
// КЭШ — один раз загрузили, используем везде
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
// ОБЪЯВЛЕНИЯ
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// ОБЪЯВЛЕНИЯ — каждое в отдельном документе ads/{adId}
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

// ─────────────────────────────────────────────
// ФОТО ОБЪЯВЛЕНИЙ
// ─────────────────────────────────────────────
// Раньше все фото (base64, до ~200 КБ на объявление) лежали прямо в документе
// ads/{id}, а лента загружала ВСЕ объявления целиком, хотя на карточке видно
// только первое фото. Теперь:
//   • в ads/{id} остаются thumb (миниатюра ~15 КБ) и photoCount;
//   • полный список фото лежит в adPhotos/{id} и грузится при открытии объявления.
// Ссылки на файлы (стоковые заглушки) и объявления без фото хранятся как раньше.
// Старые объявления работают без изменений; перенести их можно один раз
// функцией migrateAdPhotos() (см. внизу блока).
const THUMB_WIDTH = 420;
const THUMB_QUALITY = 0.65;
const THUMB_MAX_LEN = 45000;
const _photoCache = new Map();

const isInlinePhoto = p => typeof p === 'string' && p.startsWith('data:image/');

async function makeThumb(photos) {
    const first = photos[0];
    if (!first) return null;
    if (!isInlinePhoto(first)) return first;            // ссылка на файл — маленькая, берём как есть
    const t = await compressImage(first, THUMB_WIDTH, THUMB_QUALITY);
    return t && t.length <= THUMB_MAX_LEN ? t : null;   // не удалось ужать — без миниатюры
}

// Полный список фото объявления (из самого объявления или из adPhotos)
export async function getAdPhotos(ad) {
    if (Array.isArray(ad.photos)) return ad.photos;
    if (!(ad.photoCount > 0)) return [];
    const key = String(ad.id);
    if (_photoCache.has(key)) return _photoCache.get(key);
    const snap = await getDoc(doc(db, 'adPhotos', key));
    const photos = snap.exists() && Array.isArray(snap.data().photos) ? snap.data().photos : [];
    _photoCache.set(key, photos);
    return photos;
}

// Копия объявления с полным списком фото
export async function withPhotos(ad) {
    if (Array.isArray(ad.photos) || !(ad.photoCount > 0)) return ad;
    return { ...ad, photos: await getAdPhotos(ad) };
}

export async function saveAd(ad) {
    try {
        const adRef = doc(db, 'ads', String(ad.id));
        const data = { ...ad, createdAt: ad.createdAt || new Date().toISOString() };
        const photos = Array.isArray(ad.photos) ? ad.photos : null;
        const heavy = !!photos && photos.some(isInlinePhoto);
        if (photos) {
            data.photoCount = photos.length;
            if (heavy) {
                const thumb = await makeThumb(photos);
                delete data.photos;
                if (thumb) data.thumb = thumb;
            }
        }
        // Сначала объявление: правила разрешают писать adPhotos только владельцу
        // уже существующего объявления
        await setDoc(adRef, data);
        if (heavy) {
            try {
                await setDoc(doc(db, 'adPhotos', String(ad.id)), {
                    adId: ad.id, photos, updatedAt: new Date().toISOString()
                });
            } catch (e) {
                await deleteDoc(adRef).catch(() => {}); // объявление без фото не оставляем
                throw e;
            }
        }
        invalidateCache('ads');
        return true;
    } catch (e) {
        console.error('Ошибка сохранения объявления:', e);
        return false;
    }
}

export async function deleteAd(adId) {
    try {
        // Сначала фото: правила определяют владельца по самому объявлению
        await deleteDoc(doc(db, 'adPhotos', String(adId))).catch(() => {});
        await deleteDoc(doc(db, 'ads', String(adId)));
        _photoCache.delete(String(adId));
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
        const data = { ...updates, updatedAt: new Date().toISOString() };
        if (data.photos === undefined) delete data.photos; // фото не трогаем

        if (Array.isArray(data.photos)) {
            const photos = data.photos;
            data.photoCount = photos.length;
            if (photos.some(isInlinePhoto)) {
                const thumb = await makeThumb(photos);
                data.thumb = thumb || deleteField();
                data.photos = deleteField();
                await setDoc(doc(db, 'adPhotos', String(adId)), {
                    adId: Number(adId) || adId, photos, updatedAt: data.updatedAt
                });
            } else {
                // фото нет или только ссылки на файлы — храним в самом объявлении
                data.thumb = deleteField();
                await deleteDoc(doc(db, 'adPhotos', String(adId))).catch(() => {});
            }
        }

        await setDoc(adRef, data, { merge: true });
        _photoCache.delete(String(adId));
        invalidateCache('ads');
        return true;
    } catch (e) {
        console.error('Ошибка обновления объявления:', e);
        return false;
    }
}

// Однократный перенос старых объявлений на новую схему. Запускать админу/владельцу
// из консоли браузера на главной:  await migrateAdPhotos({ dryRun: true })  — посмотреть,
// что будет;  await migrateAdPhotos()  — выполнить. Копия фото сначала пишется в
// adPhotos, и только потом удаляется из объявления — потерять фото невозможно.
export async function migrateAdPhotos({ dryRun = false } = {}) {
    const snap = await getDocs(collection(db, 'ads'));
    const res = { total: snap.size, migrated: 0, skipped: 0, failed: 0, dryRun };
    for (const d of snap.docs) {
        const ad = d.data();
        if (!Array.isArray(ad.photos) || !ad.photos.some(isInlinePhoto)) { res.skipped++; continue; }
        try {
            if (!dryRun) {
                const thumb = await makeThumb(ad.photos);
                await setDoc(doc(db, 'adPhotos', d.id), {
                    adId: ad.id ?? Number(d.id), photos: ad.photos, updatedAt: new Date().toISOString()
                });
                await updateDoc(d.ref, {
                    thumb: thumb || deleteField(),
                    photoCount: ad.photos.length,
                    photos: deleteField()
                });
            }
            res.migrated++;
        } catch (e) {
            res.failed++;
            console.error('migrateAdPhotos: объявление', d.id, e?.code || e?.message);
        }
    }
    invalidateCache('ads');
    console.log('migrateAdPhotos:', res);
    return res;
}
if (typeof window !== 'undefined') window.migrateAdPhotos = migrateAdPhotos;

// ─────────────────────────────────────────────
// ПОЛЬЗОВАТЕЛИ — коллекция users/{nickname}, один документ на юзера.
// ─────────────────────────────────────────────
// Раньше все пользователи хранились в ОДНОМ документе data/users
// массивом items[]. Это давало три проблемы разом:
// 1) документ рос без ограничений и рано или поздно упёрся бы в лимит
//    Firestore 1MB на документ — та же беда, что уже чинили для ads и
//    bugReports;
// 2) правила безопасности могли проверить только "длина массива не
//    выросла больше чем на 1", а не то, ЧТО именно поменялось внутри —
//    любой авторизованный пользователь мог переписать чужие записи
//    (avatar/server/пароль-хэш и т.д.), лишь бы итоговая длина совпадала;
// 3) смена ника требовала перечитать/переписать целиком весь список
//    пользователей — риск гонки при одновременной записи двух юзеров.
// Теперь у каждого пользователя свой документ users/{nickname}, права
// на запись выдаются только владельцу ника (+ admin/owner) — см.
// firestore.rules.

export async function getUsers() {
    return _cached('users', async () => {
        try {
            const snap = await getDocs(collection(db, 'users'));
            return snap.docs.map(d => ({ ...d.data(), nickname: d.data().nickname || d.id }));
        } catch (e) {
            console.error('Ошибка загрузки пользователей:', e);
            return [];
        }
    }, 60000); // кэш 60 секунд
}

// Создать/полностью перезаписать документ одного пользователя.
export async function saveUser(user) {
    if (!user?.nickname) return false;
    try {
        await setDoc(doc(db, 'users', user.nickname), user);
        invalidateCache('users');
        return true;
    } catch (e) {
        console.error('Ошибка сохранения пользователя:', e);
        return false;
    }
}

// Частичное обновление полей одного пользователя (бейджи, avatar и т.п.)
// без перечитывания и перезаписи документов остальных пользователей.
export async function updateUser(nickname, updates) {
    if (!nickname) return false;
    try {
        await setDoc(doc(db, 'users', nickname), updates, { merge: true });
        invalidateCache('users');
        return true;
    } catch (e) {
        console.error('Ошибка обновления пользователя:', e);
        return false;
    }
}

export async function deleteUserDoc(nickname) {
    if (!nickname) return false;
    try {
        await deleteDoc(doc(db, 'users', nickname));
        invalidateCache('users');
        return true;
    } catch (e) {
        console.error('Ошибка удаления пользователя:', e);
        return false;
    }
}

export async function findUser(nickname) {
    if (!nickname) return null;
    const trimmed = nickname.trim();
    try {
        // Быстрый путь — точное совпадение ника как id документа
        // (регистронезависимость не нужна: ники создаются как typed
        // и уникальность проверяется по этому же значению).
        const snap = await getDoc(doc(db, 'users', trimmed));
        if (snap.exists()) return { ...snap.data(), nickname: snap.data().nickname || snap.id };
    } catch (e) {
        console.error('Ошибка поиска пользователя:', e);
    }
    // Запасной путь — на случай расхождения регистра/легаси-данных.
    const users = await getUsers();
    return users.find(u => u.nickname?.toLowerCase() === trimmed.toLowerCase()) || null;
}

// ─────────────────────────────────────────────
// БАНЫ
// ─────────────────────────────────────────────
export async function getBannedUsers() {
    return _cached('bannedUsers', async () => {
        try {
            const snap = await getDoc(doc(db, 'data', 'bannedUsers'));
            return snap.exists() ? snap.data().items || {} : {};
        } catch (e) { return {}; }
    }, 60000);
}

export async function saveBannedUsers(data) {
    await setDoc(doc(db, 'data', 'bannedUsers'), { items: data });
    invalidateCache('bannedUsers');
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
// ЖАЛОБЫ — коллекция reports/{id}, один документ на жалобу.
// ─────────────────────────────────────────────
// Раньше жалобы лежали в одном документе data/reports массивом, а
// правила требовали isModer() на ЧТЕНИЕ. Отправка жалобы (submitReport)
// была устроена как read-modify-write: сначала прочитать весь массив,
// добавить свою жалобу, записать весь массив обратно. Обычный
// пользователь не модератор → read падал с permission-denied → catch
// возвращал [] → запись уходила с items.length===1, что почти всегда
// расходилось с реальной длиной документа на сервере → тоже
// permission-denied. Итог: кнопка "Пожаловаться" не работала вообще,
// как только жалоб становилось больше одной. Теперь — отдельный
// документ на жалобу, create не требует предварительного чтения.
export async function getReports() {
    return _cached('reports', async () => {
        try {
            const snap = await getDocs(collection(db, 'reports'));
            return snap.docs.map(d => ({ ...d.data(), id: d.data().id ?? d.id, _docId: d.id }));
        } catch (e) {
            console.error('Ошибка загрузки жалоб:', e);
            return [];
        }
    });
}

export async function saveReport(report) {
    try {
        const ref = doc(db, 'reports', String(report.id));
        await setDoc(ref, report);
        invalidateCache('reports');
        return true;
    } catch (e) {
        console.error('Ошибка сохранения жалобы:', e);
        return false;
    }
}

export async function updateReport(reportId, updates) {
    try {
        await updateDoc(doc(db, 'reports', String(reportId)), updates);
        invalidateCache('reports');
        return true;
    } catch (e) {
        console.error('Ошибка обновления жалобы:', e);
        return false;
    }
}

export async function deleteReport(reportId) {
    try {
        await deleteDoc(doc(db, 'reports', String(reportId)));
        invalidateCache('reports');
        return true;
    } catch (e) {
        console.error('Ошибка удаления жалобы:', e);
        return false;
    }
}

// ─────────────────────────────────────────────
// БАГ-РЕПОРТЫ — отдельная коллекция, каждый репорт своим документом.
// НЕ храним вместе с жалобами на объявления (data/reports): туда
// раньше попадали и баг-репорты с фото (до 5MB base64), а это один
// общий документ с лимитом Firestore в 1MB — переполнялся и падал
// точно так же, как раньше было с объявлениями (см. комментарий выше
// про ads/{adId}). Тут та же схема: bugReports/{id}, лимит 1MB не на
// всех, а на каждый репорт по отдельности.
// ─────────────────────────────────────────────
export async function getBugReports() {
    return _cached('bugReports', async () => {
        try {
            const snap = await getDocs(collection(db, 'bugReports'));
            return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
        } catch (e) {
            console.error('Ошибка загрузки баг-репортов:', e);
            return [];
        }
    });
}

export async function saveBugReport(report) {
    try {
        const ref = doc(db, 'bugReports', String(report.id));
        await setDoc(ref, report);
        invalidateCache('bugReports');
        return true;
    } catch (e) {
        console.error('Ошибка сохранения баг-репорта:', e);
        return false;
    }
}

export async function updateBugReport(reportId, updates) {
    try {
        await setDoc(doc(db, 'bugReports', String(reportId)), updates, { merge: true });
        invalidateCache('bugReports');
        return true;
    } catch (e) {
        console.error('Ошибка обновления баг-репорта:', e);
        return false;
    }
}

export async function deleteBugReport(reportId) {
    try {
        await deleteDoc(doc(db, 'bugReports', String(reportId)));
        invalidateCache('bugReports');
        return true;
    } catch (e) {
        console.error('Ошибка удаления баг-репорта:', e);
        return false;
    }
}

// ─────────────────────────────────────────────
// РОЛИ
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
// СТАТИСТИКА ОБЪЯВЛЕНИЙ
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
// ОТЗЫВЫ — подколлекция reviews/{sellerNickname}/items/{reviewerNickname}
// ─────────────────────────────────────────────
// Раньше все отзывы о продавце лежали в одном документе одним массивом,
// и правила проверяли только "первый элемент — мой, длина +1". Это не
// защищало остальные элементы массива от подмены (можно было переписать
// текст/оценку ЧУЖОГО отзыва, лишь бы в начало добавился один новый).
// Плюс код сам обрезал массив до 100 отзывов (unshift+pop), из-за чего
// после 100-го отзыва длина переставала расти на +1 и правило начинало
// отклонять запись — новые отзывы у популярных продавцов просто
// переставали сохраняться.
// Теперь id документа = ник автора отзыва — это одновременно и хранилище,
// и естественное ограничение "один отзыв от одного человека": повторная
// попытка того же автора — это update существующего документа, а не
// create, и правила такие update запрещают.
export async function getReviews(nickname) {
    try {
        const q = query(collection(db, 'reviews', nickname, 'items'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
    } catch (e) {
        console.error('Ошибка загрузки отзывов:', e);
        return [];
    }
}

export async function saveReview(nickname, review) {
    try {
        const ref = doc(db, 'reviews', nickname, 'items', review.author);
        await setDoc(ref, review);
        return true;
    } catch (e) {
        console.error('Ошибка сохранения отзыва:', e);
        return false;
    }
}
