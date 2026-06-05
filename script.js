import { db, auth } from './firebase-config.js';
import { ZBT_MODE, ZBT_SERVER } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast, escapeHtml, timeAgo, formatPrice, compressImage } from './utils.js';
import { getAllAds, saveAd, deleteAd as deleteAdFromAPI, updateAd, invalidateCache } from './api.js';

// ===== ЗАЩИТА ОТ ДВОЙНОГО КЛИКА =====
const processingActions = new Set();

function isProcessing(key) {
    if (processingActions.has(key)) return true;
    processingActions.add(key);
    setTimeout(() => processingActions.delete(key), 3000);
    return false;
}
// ===== ВРЕМЯ ОТНОСИТЕЛЬНОЕ =====
// ===== ОБРАБОТКА ОШИБОК FIREBASE =====
async function safeFirebaseCall(call, fallback = null) {
    try {
        return await call();
    } catch (error) {
        console.error('Firebase error:', error);
        if (error.code === 'permission-denied') {
            showToast('Нет доступа!', 'error');
        } else if (error.code === 'unavailable' || error.code === 'network-request-failed') {
            showToast('Проблема с соединением', 'error');
        } else {
            showToast('Ошибка загрузки данных', 'error');
        }
        return fallback;
    }
}
// ===== AUTH CHECK =====
const currentUser = JSON.parse(localStorage.getItem('currentUser'));
if (!currentUser) {
    window.location.href = 'register.html';
}


// ===== КАСТОМНЫЙ CONFIRM =====
function showConfirm(message, onConfirm, onCancel) {
    const existing = document.getElementById('bm-confirm');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'bm-confirm';
    overlay.style.cssText = `position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);
        display:flex;align-items:center;justify-content:center;padding:20px;
        opacity:0;transition:opacity 0.2s ease;`;

    overlay.innerHTML = `
        <div style="background:#1a1a1a;border:1px solid rgba(255,30,30,0.25);border-radius:16px;
            padding:28px 24px;max-width:360px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.6);
            transform:scale(0.92);transition:transform 0.2s ease;">
            <p style="color:white;font-size:16px;font-weight:500;margin:0 0 24px;line-height:1.5;text-align:center;">${message}</p>
            <div style="display:flex;gap:10px;">
                <button id="bm-confirm-cancel" style="flex:1;padding:12px;border-radius:10px;
                    border:1.5px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);
                    color:#aaa;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;">
                    Отмена
                </button>
                <button id="bm-confirm-ok" style="flex:1;padding:12px;border-radius:10px;
                    border:none;background:linear-gradient(135deg,#ff1e1e,#cc0000);
                    color:white;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;">
                    Подтвердить
                </button>
            </div>
        </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.querySelector('div').style.transform = 'scale(1)';
    });

    function close() {
        overlay.style.opacity = '0';
        overlay.querySelector('div').style.transform = 'scale(0.92)';
        setTimeout(() => overlay.remove(), 200);
    }

    document.getElementById('bm-confirm-ok').onclick = () => { close(); onConfirm && onConfirm(); };
    document.getElementById('bm-confirm-cancel').onclick = () => { close(); onCancel && onCancel(); };
    overlay.addEventListener('click', e => { if (e.target === overlay) { close(); onCancel && onCancel(); } });
    document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { close(); onCancel && onCancel(); document.removeEventListener('keydown', esc); }
    });
}
// ===== FAVORITES (оставляем в LocalStorage - персональные) =====
function getFavorites() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return [];
    const raw = JSON.parse(localStorage.getItem(`favorites_${user.nickname}`)) || [];
    // Нормализуем: всегда числа, без дублей
    return [...new Set(raw.map(id => Number(id)))];
}

function saveFavorites(favorites) {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return;
    // Сохраняем всегда как числа без дублей
    const clean = [...new Set(favorites.map(id => Number(id)))];
    localStorage.setItem(`favorites_${user.nickname}`, JSON.stringify(clean));
}

function isFavorite(adId) {
    return getFavorites().includes(adId);
}

function toggleFavorite(adId) {
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

async function updateFavoritesCountInFirebase(adId, isAdding) {
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

function updateFavCount() {
    const count = getFavorites().length;
    const badge = document.getElementById('favCount');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// Чистим избранное от удалённых объявлений
async function cleanupFavorites() {
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

// ===== ФИЛЬТРАЦИЯ ПО СЕРВЕРУ (локальная) =====
// getAllAds, saveAd, deleteAd, updateAd — из api.js (импорт выше)
async function getAds() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user?.server) return [];
    const allAds = await getAllAds();
    return allAds.filter(ad => ad.server === user.server);
}

// ===== MY ADS =====
async function getMyAds() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return [];
    const allAds = await getAllAds();
    return allAds.filter(ad => ad.author === user.nickname && ad.server === user.server);
}

function updateMyAdsCount() {
    getMyAds().then(myAds => {
        const count = myAds.length;
        const badge = document.getElementById('myAdsCount');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    });
}

function deleteAd(adId) {
    showConfirm('Удалить объявление?', async () => {
        // Узнаём автора до удаления, чтобы декрементировать счётчик
        const allAds = await getAllAds();
        const ad = allAds.find(a => a.id === adId);
        const adAuthor = ad ? ad.author : null;

        const success = await deleteAdFromAPI(adId);
        if (!success) {
            showToast('Ошибка удаления!', 'error');
            return;
        }

        // Декрементируем счётчик adCounters только для автора объявления
        if (adAuthor) {
            try {
                const counterRef = doc(db, 'adCounters', adAuthor);
                const snap = await getDoc(counterRef);
                if (snap.exists()) {
                    const current = snap.data().activeCount || 0;
                    await setDoc(counterRef, {
                        activeCount: Math.max(0, current - 1),
                        lastAdAt: snap.data().lastAdAt || serverTimestamp()
                    });
                }
            } catch (e) {
                console.error('Ошибка обновления счётчика при удалении:', e);
            }
        }

        let favorites = getFavorites().filter(id => id !== adId);
        saveFavorites(favorites);
        updateMyAdsCount();
        updateFavCount();
        showMyAds();
    });
}

async function editAd(adId) {
    const allAds = await getAllAds();
    const ad = allAds.find(a => a.id === adId);
    if (!ad) return;
    
    const existingModal = document.querySelector('.edit-modal-overlay');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.className = 'edit-modal-overlay';

    // helpers для выбора option
    function sel(val, opt) { return val === opt ? 'selected' : ''; }
    function yn(field, val) {
        return `
        <div class="yes-no-item">
            <span class="yes-no-label">${field}</span>
            <div class="yes-no-btns">
                <button type="button" class="yn-btn ${val==='yes'?'active':''}" data-field="edit_${field.toLowerCase()}" data-value="yes" onclick="selectYesNo(this)">Есть</button>
                <button type="button" class="yn-btn ${val==='no'?'active':''}" data-field="edit_${field.toLowerCase()}" data-value="no" onclick="selectYesNo(this)">Нет</button>
            </div>
            <input type="hidden" id="edit_${field.toLowerCase()}" value="${val||''}">
        </div>`;
    }
    function toggleBtn(group, value, label, active) {
        return `<button type="button" class="toggle-btn ${active?'active':''}" data-group="${group}" data-value="${value}" onclick="toggleCarBtn(this)">${label}</button>`;
    }

    const c = ad.category;
    const l = ad.lights || {};
    const ug = l.underglow || {};
    const ugPos = ug.positions || [];
    const susp = ad.suspension || [];

    // Дополнительные поля по категории
    let extraFields = '';

    if (c === 'cars') {
        const hasUG = ug.has ? 'true' : 'false';
        const hasHB = l.highBeam ? 'true' : 'false';
        const hasST = l.strobe?.has ? 'true' : 'false';
        extraFields = `
        <div class="car-row-2">
            <div class="form-group">
                <label>Пробег</label>
                <select id="edit_mileage">
                    <option value="">Выберите</option>
                    <option value="0-10" ${sel(ad.mileage,'0-10')}>До 10 000 км</option>
                    <option value="10-50" ${sel(ad.mileage,'10-50')}>10 — 50 тыс. км</option>
                    <option value="50-100" ${sel(ad.mileage,'50-100')}>50 — 100 тыс. км</option>
                    <option value="100+" ${sel(ad.mileage,'100+')}>Более 100 тыс. км</option>
                </select>
            </div>
            <div class="form-group">
                <label>Прошивка</label>
                <select id="edit_firmware">
                    <option value="">Выберите</option>
                    <option value="stock" ${sel(ad.firmware,'stock')}>Сток</option>
                    <option value="drift" ${sel(ad.firmware,'drift')}>Дрифт</option>
                    <option value="comfort+" ${sel(ad.firmware,'comfort+')}>Комфорт+</option>
                    <option value="sport" ${sel(ad.firmware,'sport')}>Спорт</option>
                    <option value="sport+" ${sel(ad.firmware,'sport+')}>Спорт+</option>
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>Свет</label>
            <div class="toggle-group">
                ${toggleBtn('lights','underglow','💡 Подсветка', ug.has)}
                ${toggleBtn('lights','highbeam','🔆 Дальний свет', l.highBeam)}
                ${toggleBtn('lights','strobe','🔴 Стробоскопы', l.strobe?.has)}
            </div>
            <input type="hidden" id="edit_hasUnderglow" value="${hasUG}">
            <input type="hidden" id="edit_hasHighBeam" value="${hasHB}">
            <input type="hidden" id="edit_hasStrobe" value="${hasST}">
            <div id="edit_underglowOptions" class="car-sub-options ${ug.has?'':'hidden'}">
                <label class="sub-label">Позиции подсветки:</label>
                <div class="toggle-group">
                    <button type="button" class="toggle-btn small ${ugPos.includes('bottom')?'active':''}" data-group="edit_underglow" data-value="bottom" onclick="toggleCarBtn(this)">Нижняя</button>
                    <button type="button" class="toggle-btn small ${ugPos.includes('left')?'active':''}" data-group="edit_underglow" data-value="left" onclick="toggleCarBtn(this)">Левая</button>
                    <button type="button" class="toggle-btn small ${ugPos.includes('right')?'active':''}" data-group="edit_underglow" data-value="right" onclick="toggleCarBtn(this)">Правая</button>
                </div>
            </div>
            <div id="edit_strobeOptions" class="car-sub-options ${l.strobe?.has?'':'hidden'}">
                <label class="sub-label">Тип стробоскопов:</label>
                <div class="toggle-group">
                    <button type="button" class="toggle-btn small single ${l.strobe?.type==='donate'?'active':''}" data-group="edit_strobe-type" data-value="donate" onclick="selectCarBtn(this)">Донатные</button>
                    <button type="button" class="toggle-btn small single ${l.strobe?.type==='regular'?'active':''}" data-group="edit_strobe-type" data-value="regular" onclick="selectCarBtn(this)">Обычные</button>
                </div>
                <input type="hidden" id="edit_strobeType" value="${l.strobe?.type||''}">
            </div>
        </div>
        <div class="form-group">
            <label>Подвеска</label>
            <div class="toggle-group">
                ${toggleBtn('edit_suspension','hydraulic','🔧 Гидравлика', susp.includes('hydraulic'))}
                ${toggleBtn('edit_suspension','pneumatic','💨 Пневма', susp.includes('pneumatic'))}
            </div>
        </div>
        <div class="form-group">
            <label>Дополнительно</label>
            <div class="yes-no-grid">
                ${yn('Шинка', ad.tires)}
                ${yn('Клиренс', ad.clearance)}
                ${yn('Лаунч', ad.launch)}
                ${yn('ПДВ', ad.pdv)}
                ${yn('Антирадар', ad.antiradar)}
            </div>
        </div>`;
    } else if (c === 'houses') {
        extraFields = `
        <div class="form-group">
            <label>Расположение</label>
            <select id="edit_location">
                <option value="">Выберите</option>
                ${['Арзамас','Батырево','Лыткарино','Южный','Нижегородск'].map(v=>`<option value="${v}" ${sel(ad.location,v)}>${v}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>Улучшения дома</label>
            <select id="edit_upgrades">
                <option value="">Выберите</option>
                ${['1/5','2/5','3/5','4/5','5/5'].map(v=>`<option value="${v}" ${sel(ad.upgrades,v)}>${v}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>Улучшения подвала</label>
            <select id="edit_basement">
                <option value="">Выберите</option>
                ${['1/5','2/5','3/5','4/5','5/5'].map(v=>`<option value="${v}" ${sel(ad.basement,v)}>${v}</option>`).join('')}
            </select>
        </div>`;
    } else if (c === 'garages') {
        extraFields = `
        <div class="form-group">
            <label>Расположение</label>
            <select id="edit_location">
                <option value="">Выберите</option>
                ${['Арзамас','Батырево','Лыткарино','Южный','Нижегородск'].map(v=>`<option value="${v}" ${sel(ad.location,v)}>${v}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>Улучшения</label>
            <select id="edit_upgrades">
                <option value="">Выберите</option>
                ${['1/5','2/5','3/5','4/5','5/5'].map(v=>`<option value="${v}" ${sel(ad.upgrades,v)}>${v}</option>`).join('')}
            </select>
        </div>`;
    } else if (c === 'business') {
        const biz = [
            ['247','Магазин 24/7'],['gas','АЗС'],['sk','СК'],['tk','ТК'],
            ['ammo','Амуниция'],['accessories','Аксессуары'],['clothes','Одежда'],
            ['workshop','Мастерская'],['pvz','ПВЗ'],['fishing','Рыболовный магазин'],
            ['sto','СТО'],['techcenter','Тех. центр'],['snackbar','Закусочная'],
            ['club','Клуб'],['taxi','Такси'],['styling','Стайлинг центр'],['tireshop','Шиномонтаж']
        ];
        extraFields = `
        <div class="form-group">
            <label>Категория бизнеса</label>
            <select id="edit_businessCategory">
                <option value="">Выберите</option>
                ${biz.map(([v,n])=>`<option value="${v}" ${sel(ad.businessCategory,v)}>${n}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>Расположение</label>
            <select id="edit_businessLocation">
                <option value="">Выберите</option>
                ${['Арзамас','Батырево','Лыткарино','Южный','Нижегородск'].map(v=>`<option value="${v}" ${sel(ad.businessLocation,v)}>${v}</option>`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>Финансовая статистика (₽/день)</label>
            <div style="display:flex;gap:10px;align-items:center;">
                <input type="number" id="edit_incomeFrom" placeholder="От" value="${ad.businessIncome?.from||''}" style="flex:1;">
                <span style="color:#888;">—</span>
                <input type="number" id="edit_incomeTo" placeholder="До" value="${ad.businessIncome?.to||''}" style="flex:1;">
            </div>
        </div>`;
    }

    modal.innerHTML = `
        <div class="edit-modal-content">
            <button class="modal-close" onclick="closeEditModal()">&times;</button>
            <h2>Редактировать объявление</h2>
            <div class="edit-form">
                <div class="form-group">
                    <label>Название</label>
                    <input type="text" id="editTitle" value="${escapeHtml(ad.title)}" required>
                </div>
                <div class="form-group">
                    <label>Цена (₽)</label>
                    <input type="number" id="editPrice" value="${ad.price}" required>
                </div>
                <div class="form-group">
                    <label>Описание</label>
                    <textarea id="editDescription" rows="4">${escapeHtml(ad.description || '')}</textarea>
                </div>
                ${extraFields}
                <div class="form-group">
                    <label>Фотографии</label>
                    <div id="editPhotoPreview" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;min-height:4px;"></div>
                    <label for="editPhotosInput" style="cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(255,255,255,0.05);border:1px dashed rgba(255,255,255,0.2);border-radius:10px;color:#aaa;font-size:14px;">
                        📷 <span id="editPhotoLabel">Добавить фото (0/5)</span>
                        <input type="file" id="editPhotosInput" accept="image/*" multiple style="display:none;">
                    </label>
                </div>
                <div class="form-group">
                    <label>Telegram для связи</label>
                    <div class="telegram-input-wrapper">
                        <span class="telegram-prefix">@</span>
                        <input type="text" id="editContact" value="${escapeHtml(ad.contact || '')}" placeholder="username">
                    </div>
                </div>
                <div class="edit-actions">
                    <button class="save-btn" onclick="saveEditAd(${adId})">Сохранить</button>
                    <button class="cancel-btn" onclick="closeEditModal()">Отмена</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeEditModal();
    });

    // ===== ЛОГИКА ФОТО =====
    let _editPhotos = Array.isArray(ad.photos) ? [...ad.photos] : [];
    function _renderEditPhotos() {
        const preview = document.getElementById('editPhotoPreview');
        const label = document.getElementById('editPhotoLabel');
        if (!preview) return;
        preview.innerHTML = _editPhotos.map((p, i) => `
            <div style="position:relative;">
                <img src="${p}" style="width:75px;height:75px;object-fit:cover;border-radius:8px;border:1px solid rgba(255,255,255,0.1);">
                <button type="button" onclick="window._removeEditPhoto(${i})" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#f44336;border:none;color:white;cursor:pointer;font-size:14px;line-height:1;padding:0;">×</button>
            </div>`).join('');
        if (label) label.textContent = `Добавить фото (${_editPhotos.length}/5)`;
    }
    _renderEditPhotos();
    window._removeEditPhoto = function(i) { _editPhotos.splice(i, 1); _renderEditPhotos(); };
    window._getEditPhotos = function() { return _editPhotos; };
    const _photoInp = document.getElementById('editPhotosInput');
    if (_photoInp) {
        _photoInp.addEventListener('change', function(e) {
            const files = Array.from(e.target.files);
            if (_editPhotos.length + files.length > 3) { showToast('Максимум 3 фотографии!', 'warning'); return; }
            files.forEach(file => {
                if (!file.type.startsWith('image/')) return;
                if (file.size > 5 * 1024 * 1024) { showToast('Файл слишком большой (макс. 5MB)', 'warning'); return; }
                const reader = new FileReader();
                reader.onload = ev => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX = 800; let w = img.width, h = img.height;
                        if (w > MAX || h > MAX) { if (w > h) { h = Math.round(h*MAX/w); w=MAX; } else { w=Math.round(w*MAX/h); h=MAX; } }
                        canvas.width=w; canvas.height=h;
                        canvas.getContext('2d').drawImage(img,0,0,w,h);
                        _editPhotos.push(canvas.toDataURL('image/jpeg', 0.7));
                        _renderEditPhotos();
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            });
            _photoInp.value = '';
        });
    }

    // Переопределяем toggleCarBtn только для кнопок внутри edit-модалки
    // чтобы они управляли edit_* ID вместо create-ad ID
    modal.querySelectorAll('.toggle-btn[data-group="lights"]').forEach(btn => {
        btn.onclick = function() {
            const val = this.dataset.value;
            const isActive = this.classList.contains('active');
            this.classList.toggle('active', !isActive);
            if (val === 'underglow') {
                document.getElementById('edit_hasUnderglow').value = !isActive ? 'true' : 'false';
                document.getElementById('edit_underglowOptions').classList.toggle('hidden', isActive);
            }
            if (val === 'strobe') {
                document.getElementById('edit_hasStrobe').value = !isActive ? 'true' : 'false';
                document.getElementById('edit_strobeOptions').classList.toggle('hidden', isActive);
                if (isActive) document.getElementById('edit_strobeType').value = '';
            }
            if (val === 'highbeam') {
                document.getElementById('edit_hasHighBeam').value = !isActive ? 'true' : 'false';
            }
        };
    });

    modal.querySelectorAll('.toggle-btn[data-group="edit_strobe-type"]').forEach(btn => {
        btn.onclick = function() {
            modal.querySelectorAll('.toggle-btn[data-group="edit_strobe-type"]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('edit_strobeType').value = this.dataset.value;
        };
    });
}

function closeEditModal() {
    const modal = document.querySelector('.edit-modal-overlay');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
}

async function saveEditAd(adId) {
    const title = document.getElementById('editTitle').value.trim();
    const price = parseInt(document.getElementById('editPrice').value);
    const description = document.getElementById('editDescription').value.trim();
    const contactRaw = document.getElementById('editContact').value.trim().replace(/^@/, '');

    if (!title) { showToast('Введите название', 'error'); return; }
    if (!price || price <= 0) { showToast('Введите корректную цену', 'error'); return; }

    // Получаем оригинальное объявление чтобы знать категорию
    const allAds = await getAllAds();
    const orig = allAds.find(a => a.id === adId);
    if (!orig) { showToast('Объявление не найдено', 'error'); return; }

    const updated = {
        id: adId,
        title,
        price,
        description,
        contact: contactRaw || null,
        photos: (typeof window._getEditPhotos === 'function') ? window._getEditPhotos() : (orig.photos || []),
        updatedAt: new Date().toISOString()
    };

    const c = orig.category;

    if (c === 'cars') {
        updated.mileage = document.getElementById('edit_mileage')?.value || orig.mileage;
        updated.firmware = document.getElementById('edit_firmware')?.value || orig.firmware;

        const hasUG = document.getElementById('edit_hasUnderglow')?.value === 'true';
        const hasHB = document.getElementById('edit_hasHighBeam')?.value === 'true';
        const hasST = document.getElementById('edit_hasStrobe')?.value === 'true';
        updated.lights = {
            underglow: {
                has: hasUG,
                positions: hasUG
                    ? Array.from(document.querySelectorAll('.toggle-btn[data-group="edit_underglow"].active')).map(b => b.dataset.value)
                    : []
            },
            highBeam: hasHB,
            strobe: {
                has: hasST,
                type: hasST ? (document.getElementById('edit_strobeType')?.value || null) : null
            }
        };
        updated.suspension = Array.from(document.querySelectorAll('.toggle-btn[data-group="edit_suspension"].active')).map(b => b.dataset.value);
        updated.tires     = document.getElementById('edit_шинка')?.value || orig.tires;
        updated.clearance = document.getElementById('edit_клиренс')?.value || orig.clearance;
        updated.launch    = document.getElementById('edit_лаунч')?.value || orig.launch;
        updated.pdv       = document.getElementById('edit_пдв')?.value || orig.pdv;
        updated.antiradar = document.getElementById('edit_антирадар')?.value || orig.antiradar;

    } else if (c === 'houses') {
        updated.location = document.getElementById('edit_location')?.value || orig.location;
        updated.upgrades = document.getElementById('edit_upgrades')?.value || orig.upgrades;
        updated.basement = document.getElementById('edit_basement')?.value || orig.basement;

    } else if (c === 'garages') {
        updated.location = document.getElementById('edit_location')?.value || orig.location;
        updated.upgrades = document.getElementById('edit_upgrades')?.value || orig.upgrades;

    } else if (c === 'business') {
        const bizCatEl = document.getElementById('edit_businessCategory');
        updated.businessCategory = bizCatEl?.value || orig.businessCategory;
        updated.businessCategoryName = bizCatEl?.options[bizCatEl.selectedIndex]?.text || orig.businessCategoryName;
        updated.businessLocation = document.getElementById('edit_businessLocation')?.value || orig.businessLocation;
        const from = document.getElementById('edit_incomeFrom')?.value;
        const to   = document.getElementById('edit_incomeTo')?.value;
        if (from || to) {
            updated.businessIncome = {
                from: from ? parseInt(from) : null,
                to:   to   ? parseInt(to)   : null
            };
        }
    }

    const success = await updateAd(updated.id, updated);
    if (success) {
        showToast('Объявление обновлено!', 'success');
        closeEditModal();
        showMyAds();
    } else {
        showToast('Ошибка сохранения!', 'error');
    }
}

async function showMyAds() {
    currentCategory = 'myads';
    const myAds = await getMyAds();
    const adsGrid = document.getElementById('adsGrid');
    
    document.querySelectorAll('#categoryList li').forEach(li => li.classList.remove('active'));
    
    if (myAds.length === 0) {
        adsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: #888;">
                <p style="font-size: 18px; margin-bottom: 10px;">📋 У вас нет объявлений</p>
                <p style="font-size: 14px;">Нажмите + чтобы создать первое</p>
            </div>
        `;
        return;
    }
    
    adsGrid.innerHTML = myAds.map(ad => createMyAdCard(ad)).join('');
    
    document.querySelectorAll('.listing-card').forEach(card => {
        card.addEventListener('click', async (e) => {
            if (e.target.closest('.my-ad-actions')) return;
            const adId = parseInt(card.dataset.id);
            const allAds = await getAllAds();
            const ad = allAds.find(a => a.id === adId);
            if (ad) window.openModal(ad);
        });
    });
}

// ===== PROFILE MENU =====
if (currentUser && !currentUser.server) {
    window.location.href = 'servers.html';
}

const profileNickname = document.getElementById('profileNickname');
if (profileNickname && currentUser) {
    profileNickname.textContent = `${currentUser.nickname} • ${currentUser.server}`;
}

const profileBox    = document.getElementById('profileBox');
const profileMenu   = document.getElementById('profileMenu');
const profileOverlay = document.getElementById('profileOverlay');

// ── Инициализация шапки шторки ──
function initSidebarHeader() {
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

    // ── Таб Профиль ──
    const nickDisplay = document.getElementById('editNicknameDisplay');
    if (nickDisplay) nickDisplay.textContent = currentUser.nickname;

    const tgInput = document.getElementById('editTelegram');
    if (tgInput && currentUser.telegram) tgInput.value = currentUser.telegram;

    const previewCircle = document.getElementById('avatarPreviewCircle');
    if (previewCircle) previewCircle.innerHTML = avatar ? `<img src="${avatar}" alt="avatar">` : letter;
}

// ── Цвета серверов ──
const SERVER_COLORS = {
    RED:'#ff2b2b', GREEN:'#2bff4a', BLUE:'#2b6bff', YELLOW:'#ffe600',
    ORANGE:'#ff8c1a', PURPLE:'#a64dff', LIME:'#9dff00', PINK:'#ff4fd8',
    CHERRY:'#b3003b', BLACK:'#888', INDIGO:'#4b0082', WHITE:'#dddddd',
    MAGENTA:'#ff00ff', CRIMSON:'#dc143c', GOLD:'#ffd700', AZURE:'#007fff',
    PLATINUM:'#e5e4e2', AQUA:'#00ffff', GRAY:'#808080', ICE:'#b3f0ff',
    CHILLI:'#ff3c00', CHOCO:'#5a2d0c', MOSCOW:'#c70000', SPB:'#005eff',
    UFA:'#ffc107', SOCHI:'#00bcd4', KAZAN:'#2196f3', SAMARA:'#9c27b0',
    ROSTOV:'#ff9800', ANAPA:'#03a9f4', EKB:'#8bc34a', KRASNODAR:'#d84315',
    ARZAMAS:'#76ff03', NOVOSIB:'#7cb342', GROZNY:'#4caf50', SARATOV:'#1976d2',
    OMSK:'#80cbc4', IRKUTSK:'#4fc3f7', VOLGOGRAD:'#d32f2f'
};

function getServerBadgeHtml(server) {
    if (!server) return '';
    const color = SERVER_COLORS[server.toUpperCase()] || '#888';
    // Всегда белый текст — цвет сервера только в рамке и фоне
    // Для светлых серверов усиливаем фон чтобы был виден контраст
    const lightServers = ['WHITE','PLATINUM','LIME','YELLOW','GOLD','AQUA','ICE','GREEN','ARZAMAS','NOVOSIB','EKB'];
    const isLight = lightServers.includes(server.toUpperCase());
    const bg = isLight ? `${color}35` : `${color}18`;
    const border = isLight ? `${color}80` : `${color}50`;
    return `<span class="server-badge" style="color:#fff;border-color:${border};background:${bg};text-shadow:0 1px 3px rgba(0,0,0,0.8);">${server.toUpperCase()}</span>`;
}

// ── Ролевые плашки ──
const ROLE_LABELS = {
    owner: { text: 'Владелец', cls: 'owner' },
    admin: { text: 'Администратор', cls: 'admin' },
    moder: { text: 'Модератор', cls: 'moder' }
};

// ── Система бейджей достижений ──
const BADGES_CONFIG = {
    // Этап 2 — Бейджи первой волны
    zbt_member:    { icon: '🔥', label: 'Участник ЗБТ',         desc: 'Принял участие в закрытом бета-тестировании Black Market',  rarity: 'rare',      color: '#ff6b35' },
    first_100:     { icon: '⚡', label: 'Первые 100',            desc: 'Вошёл в первые 100 пользователей платформы',               rarity: 'legendary', color: '#ffd700' },
    founder:       { icon: '👑', label: 'Основатель',            desc: 'Один из основателей сообщества Black Market',              rarity: 'legendary', color: '#ffd700' },
    administrator: { icon: '🛡️', label: 'Администратор',         desc: 'Администратор проекта Black Market',                       rarity: 'special',   color: '#e05fff' },
    moderator:     { icon: '🔨', label: 'Модератор',             desc: 'Модератор платформы Black Market',                         rarity: 'special',   color: '#5b9dff' },
    // Этап 3 — Репутационные
    veteran:       { icon: '⭐', label: 'Ветеран Black Market',   desc: 'Долгожитель платформы',                                    rarity: 'rare',      color: '#a8e063' },
    verified:      { icon: '🛡️', label: 'Проверенный продавец',  desc: 'Подтверждённый надёжный продавец',                         rarity: 'uncommon',  color: '#4ecdc4' },
    trusted:       { icon: '💎', label: 'Надёжный продавец',     desc: 'Высокий рейтинг и много положительных отзывов',            rarity: 'rare',      color: '#74b9ff' },
    top_seller:    { icon: '🏆', label: 'Топ продавец месяца',   desc: 'Лучший продавец по итогам месяца',                         rarity: 'legendary', color: '#ffd700' },
    // Этап 4 — Достижения сообщества
    bug_hunter:    { icon: '🐞', label: 'Охотник за багами',     desc: 'Нашёл и сообщил о важном баге',                            rarity: 'uncommon',  color: '#ff7675' },
    active_tester: { icon: '🏅', label: 'Активный тестер',       desc: 'Активно участвовал в тестировании платформы',              rarity: 'uncommon',  color: '#fdcb6e' },
    zbt_legend:    { icon: '🏆', label: 'Легенда ЗБТ',           desc: 'Внёс выдающийся вклад в развитие проекта во время ЗБТ',   rarity: 'legendary', color: '#ffd700' },
    early_bird:    { icon: '🚀', label: 'Ранний сторонник',      desc: 'Поддержал проект на самом раннем этапе',                   rarity: 'rare',      color: '#a29bfe' },
};

const RARITY_LABELS = {
    uncommon:  { label: 'Необычный', color: '#4ecdc4' },
    rare:      { label: 'Редкий',    color: '#74b9ff' },
    legendary: { label: 'Легендарный', color: '#ffd700' },
    special:   { label: 'Особый',    color: '#e05fff' },
};

// ── Рендер бейджей пользователя ──
// badges — массив ключей из BADGES_CONFIG, например ['zbt_member', 'first_100']
// size: 'sm' (для карточек/чата) | 'md' (дефолт, для профиля)
function renderUserBadges(badges, size = 'md') {
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

function applySidebarRole(role) {
    const badge = document.getElementById('sidebarRoleBadge');
    if (!badge) return;
    if (!role || !ROLE_LABELS[role]) { badge.classList.add('hidden'); return; }
    const cfg = ROLE_LABELS[role];
    badge.textContent = cfg.text;
    badge.className = `role-badge ${cfg.cls}`;
}

// ── Табы шторки ──
window.switchSidebarTab = function(name, btn) {
    document.querySelectorAll('.sidebar-tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-tab').forEach(el => el.classList.remove('active'));
    const tab = document.getElementById('sidebar-tab-' + name);
    if (tab) tab.classList.add('active');
    if (btn) btn.classList.add('active');

    // Ленивая загрузка данных при первом открытии таба
    if (name === 'stats' && !_sidebarStatsLoaded) loadSidebarStats();
};

// ── Открыть/закрыть шторку ──
function openProfileMenu() {
    profileMenu.classList.remove('hidden');
    profileOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeProfileMenu() {
    profileMenu.classList.add('hidden');
    profileOverlay.classList.add('hidden');
    document.body.style.overflow = '';
}

profileBox?.addEventListener('click', (e) => {
    e.stopPropagation();
    profileMenu.classList.contains('hidden') ? openProfileMenu() : closeProfileMenu();
});
profileOverlay?.addEventListener('click', closeProfileMenu);
document.addEventListener('click', (e) => {
    if (!profileMenu?.contains(e.target) && !profileBox?.contains(e.target)) closeProfileMenu();
});

// ── Выход ──
document.getElementById('logoutButton')?.addEventListener('click', () => {
    localStorage.removeItem('currentUser');
    window.location.href = 'register.html';
});

document.getElementById('addAdButton')?.addEventListener('click', () => {
    window.location.href = 'create-ad.html';
});

// ── Смена пароля — показываем подтверждение ──
document.getElementById('editPasswordNew')?.addEventListener('input', function() {
    const confirmGroup = document.getElementById('editPasswordConfirmGroup');
    if (confirmGroup) confirmGroup.style.display = this.value.length > 0 ? 'flex' : 'none';
});

// ── Сохранение профиля ──
document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
    const telegram = document.getElementById('editTelegram')?.value.trim();
    const newPass  = document.getElementById('editPasswordNew')?.value;
    const confPass = document.getElementById('editPasswordConfirm')?.value;

    if (newPass && newPass !== confPass) {
        showToast('Пароли не совпадают', 'error'); return;
    }
    if (newPass && newPass.length < 6) {
        showToast('Пароль минимум 6 символов', 'error'); return;
    }

    const btn = document.getElementById('saveProfileBtn');
    btn.textContent = 'Сохраняю...';
    btn.disabled = true;

    try {
        // Обновляем данные в Firestore
        const { getUsers, saveUsers } = await import('./api.js');
        const users = await getUsers();
        const idx = users.findIndex(u => u.nickname === currentUser.nickname);
        if (idx !== -1) {
            if (telegram !== undefined) users[idx].telegram = telegram;
            if (_pendingAvatar)         users[idx].avatar   = _pendingAvatar;
            await saveUsers(users);
            invalidateCache('users'); // сбрасываем кэш чтобы при следующем входе взялись свежие данные
        }

        // Обновляем Firebase Auth пароль если нужно
        if (newPass) {
            const { updatePassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
            await updatePassword(auth.currentUser, newPass);
        }

        // Обновляем localStorage и currentUser
        const freshAvatar = _pendingAvatar || currentUser.avatar;
        Object.assign(currentUser, { telegram, avatar: freshAvatar });
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        // Дополнительно храним аватар отдельно — надёжнее чем в объекте пользователя
        if (freshAvatar) localStorage.setItem(`avatar_${currentUser.nickname}`, freshAvatar);
        _pendingAvatar = null;
        // Перерисовываем шапку с новым аватаром
        initSidebarHeader();

        showToast('Профиль сохранён!', 'success');
        document.getElementById('editPasswordNew').value = '';
        document.getElementById('editPasswordConfirm').value = '';
        document.getElementById('editPasswordConfirmGroup').style.display = 'none';

    } catch (e) {
        console.error('Ошибка сохранения профиля:', e);
        showToast('Ошибка сохранения', 'error');
    } finally {
        btn.textContent = 'Сохранить изменения';
        btn.disabled = false;
    }
});

// ── Загрузка аватара ──
let _pendingAvatar = null;

document.getElementById('avatarFileInput')?.addEventListener('change', async function() {
    const file = this.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Файл слишком большой (макс. 2MB)', 'error'); return; }

    const reader = new FileReader();
    reader.onload = async (e) => {
        // Сжимаем аватар до 200px — для аватара достаточно
        const compressed = await compressImage(e.target.result, 200, 0.8);
        _pendingAvatar = compressed;

        // Обновляем превью везде
        const imgHtml = `<img src="${compressed}" alt="avatar">`;
        const circle  = document.getElementById('sidebarAvatarCircle');
        const preview = document.getElementById('avatarPreviewCircle');
        const header  = document.getElementById('headerAvatarCircle');
        if (circle)  circle.innerHTML  = imgHtml;
        if (preview) preview.innerHTML = imgHtml;
        if (header)  header.innerHTML  = imgHtml;
        showToast('Фото выбрано — нажми "Сохранить"', 'info');
    };
    reader.readAsDataURL(file);
});

// Клик на аватар в шапке → открывает выбор файла
document.getElementById('sidebarAvatarEdit')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('avatarFileInput')?.click();
});

// ── Статистика в шторке (ленивая загрузка) ──
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
        const { getAdStats } = await import('./api.js');
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
        const { getReviews } = await import('./api.js');
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
                    ${escapeHtml(r.author)}
                </div>
                <div class="sidebar-review-text">${escapeHtml(r.text || '')}</div>
            </div>
        `).join('');

    } catch (e) {
        console.error('Ошибка загрузки статистики шторки:', e);
    }
}

// ===== FILTERS =====
let currentCategory = 'all';
let currentSearch = '';
let currentSort = 'newest';

document.getElementById('categoryList')?.addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
        document.querySelectorAll('#categoryList li').forEach(li => li.classList.remove('active'));
        e.target.classList.add('active');
        currentCategory = e.target.dataset.category;
        _adsPage = 1;
        
        if (currentCategory !== 'myads' && currentCategory !== 'favorites') {
            currentSearch = '';
            document.getElementById('searchInput').value = '';
        }
        
        renderAds();
    }
});

document.getElementById('searchInput')?.addEventListener('input', (e) => {
    currentSearch = e.target.value.trim().toLowerCase();
    _adsPage = 1;
    renderAds();
});

document.getElementById('sortBtns')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.sort-btn');
    if (!btn) return;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentSort = btn.dataset.sort;
    _adsPage = 1;
    renderAds();
});

// ===== RENDER ADS =====
function filterAndSortAds(ads) {
    let filtered = ads;

    if (currentCategory !== 'all' && currentCategory !== 'myads' && currentCategory !== 'favorites') {
        filtered = ads.filter(ad => ad.category === currentCategory);
    }

    if (currentSearch) {
        filtered = filtered.filter(ad => {
            const title = (ad.title || '').toLowerCase();
            const desc = (ad.description || '').toLowerCase();
            return title.includes(currentSearch) || desc.includes(currentSearch);
        });
    }

    // Цена
    if (advancedFilters.priceMin) filtered = filtered.filter(ad => ad.price >= parseInt(advancedFilters.priceMin));
    if (advancedFilters.priceMax) filtered = filtered.filter(ad => ad.price <= parseInt(advancedFilters.priceMax));

    // Авто фильтры
    if (advancedFilters.firmware) filtered = filtered.filter(ad => ad.firmware === advancedFilters.firmware);
    if (advancedFilters.mileage) filtered = filtered.filter(ad => ad.mileage === advancedFilters.mileage);
    if (advancedFilters.suspension) filtered = filtered.filter(ad => Array.isArray(ad.suspension) && ad.suspension.includes(advancedFilters.suspension));
    ['tires','clearance','launch','pdv','antiradar'].forEach(key => {
        if (advancedFilters[key] === 'yes') filtered = filtered.filter(ad => ad[key] === 'yes');
    });

    // Расположение
    if (advancedFilters.location) filtered = filtered.filter(ad =>
        ad.location === advancedFilters.location || ad.businessLocation === advancedFilters.location
    );
    // Улучшения
    if (advancedFilters.upgrades) filtered = filtered.filter(ad => ad.upgrades === advancedFilters.upgrades);
    // Тип бизнеса
    if (advancedFilters.businessType) filtered = filtered.filter(ad => ad.businessCategory === advancedFilters.businessType);

    const sorted = [...filtered];
    switch (currentSort) {
        case 'newest': sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
        case 'oldest': sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
        case 'price_asc': sorted.sort((a, b) => a.price - b.price); break;
        case 'price_desc': sorted.sort((a, b) => b.price - a.price); break;
    }
    return sorted;
}

function createAdCard(ad) {
    const priceFormatted = ad.price.toLocaleString('ru-RU') + ' ₽';
    const date = new Date(ad.createdAt).toLocaleDateString('ru-RU');
    
    const categoryColors = {
        cars: '#ff6b6b', houses: '#4ecdc4', garages: '#45b7d1',
        business: '#f9ca24', accessories: '#a55eea', skins: '#26de81', other: '#778ca3'
    };
    
    const categoryNames = {
        cars: 'Машина', houses: 'Дом', garages: 'Гараж',
        business: 'Бизнес', accessories: 'Аксессуар', skins: 'Скин', other: 'Разное'
    };
    
    const catColor = categoryColors[ad.category] || '#888';
    const catName = escapeHtml(categoryNames[ad.category]) || escapeHtml(String(ad.category));
    const isFav = isFavorite(ad.id);
    const photoBadge = ad.photos?.length ? `<span class="photo-badge">📷 ${ad.photos.length}</span>` : '';
    
    return `
        <div class="listing-card" data-id="${ad.id}">
            <div class="ad-header">
                <span class="ad-category" style="background: ${catColor}20; color: ${catColor}; border: 1px solid ${catColor}40;">
                    ${catName}
                </span>
                <div style="display:flex;align-items:center;gap:6px;">
                    ${photoBadge}
                    <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavCard(${ad.id})" title="В избранное">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFav ? '#ff4d6d' : 'none'}" stroke="${isFav ? '#ff4d6d' : 'rgba(255,255,255,0.35)'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <h3 class="ad-title">${escapeHtml(ad.title)}</h3>
            <p class="ad-price">${priceFormatted}</p>
            <p class="ad-description">${escapeHtml(ad.description || 'Нет описания')}</p>
            <div class="ad-footer">
                <span class="ad-author seller-link" onclick="event.stopPropagation(); window.location.href='profile.html?user=${encodeURIComponent(ad.author)}'">${escapeHtml(ad.author)}</span>
               <span class="ad-date" title="${new Date(ad.createdAt).toLocaleString('ru-RU')}">${timeAgo(ad.createdAt)}</span>
            </div>
            <p class="ad-hint">Нажмите для подробностей</p>
        </div>
    `;
}

function createMyAdCard(ad) {
    const priceFormatted = ad.price.toLocaleString('ru-RU') + ' ₽';
    const date = new Date(ad.createdAt).toLocaleDateString('ru-RU');
    const updated = ad.updatedAt ? ' (ред.)' : '';
    
    const categoryColors = {
        cars: '#ff6b6b', houses: '#4ecdc4', garages: '#45b7d1',
        business: '#f9ca24', accessories: '#a55eea', skins: '#26de81', other: '#778ca3'
    };
    
    const categoryNames = {
        cars: 'Машина', houses: 'Дом', garages: 'Гараж',
        business: 'Бизнес', accessories: 'Аксессуар', skins: 'Скин', other: 'Разное'
    };
    
    const catColor = categoryColors[ad.category] || '#888';
    const catName = categoryNames[ad.category] || ad.category;
    const photoBadge = ad.photos?.length ? `<span class="photo-badge">📷 ${ad.photos.length}</span>` : '';
    
    return `
        <div class="listing-card my-listing-card" data-id="${ad.id}">
            <div class="ad-header">
                <span class="ad-category" style="background: ${catColor}20; color: ${catColor}; border: 1px solid ${catColor}40;">
                    ${catName}
                </span>
                ${photoBadge}
            </div>
            <h3 class="ad-title">${escapeHtml(ad.title)}</h3>
            <p class="ad-price">${priceFormatted}</p>
            <p class="ad-description">${escapeHtml(ad.description || 'Нет описания')}</p>
            <div class="ad-footer">
                <span class="ad-date">${date}${updated}</span>
            </div>
            <div class="my-ad-actions">
                <button class="edit-btn" onclick="event.stopPropagation(); editAd(${ad.id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <span>Изменить</span>
                </button>
                <button class="delete-btn" onclick="event.stopPropagation(); deleteAd(${ad.id})">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Удалить</span>
                </button>
            </div>
        </div>
    `;
}

let _adsFirstLoad = true;
const ADS_PER_PAGE = 20;
let _adsPage = 1;       // сколько «страниц» сейчас показано
let _adsTotalFiltered = 0; // общее кол-во после фильтрации

async function renderAds() {
    const adsGrid = document.getElementById('adsGrid');
    if (!adsGrid) return;

    // Скелетон только при первой загрузке — потом не мигаем
    if (_adsFirstLoad) {
        adsGrid.innerHTML = Array(6).fill(0).map(() => `
            <div class="listing-card skeleton-card" style="pointer-events:none;">
                <div class="skeleton-img" style="width:100%;height:160px;border-radius:10px;
                    background:linear-gradient(90deg,#1a1a1a 25%,#222 50%,#1a1a1a 75%);
                    background-size:200% 100%;animation:skeletonShimmer 1.4s infinite;"></div>
                <div style="padding:12px;display:flex;flex-direction:column;gap:10px;">
                    <div style="height:16px;border-radius:6px;width:75%;
                        background:linear-gradient(90deg,#1a1a1a 25%,#222 50%,#1a1a1a 75%);
                        background-size:200% 100%;animation:skeletonShimmer 1.4s infinite;"></div>
                    <div style="height:13px;border-radius:6px;width:50%;
                        background:linear-gradient(90deg,#1a1a1a 25%,#222 50%,#1a1a1a 75%);
                        background-size:200% 100%;animation:skeletonShimmer 1.4s infinite;"></div>
                </div>
            </div>
        `).join('');

        if (!document.getElementById('skeletonStyle')) {
            const style = document.createElement('style');
            style.id = 'skeletonStyle';
            style.textContent = '@keyframes skeletonShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
            document.head.appendChild(style);
        }
    }

    let serverAds;
    try {
        serverAds = await getAds();
        _adsFirstLoad = false;
    } catch (e) {
        adsGrid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
                <div style="font-size:48px;margin-bottom:16px;">😕</div>
                <p style="font-size:18px;color:#ff1e1e;margin-bottom:8px;">Не удалось загрузить объявления</p>
                <p style="font-size:14px;color:#888;margin-bottom:20px;">Проверьте интернет-соединение и попробуйте снова</p>
                <button onclick="renderAds()" style="padding:10px 24px;background:linear-gradient(135deg,#ff1e1e,#cc0000);
                    color:white;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">
                    🔄 Обновить
                </button>
            </div>`;
        return;
    }

    const ads = filterAndSortAds(serverAds);
    _adsTotalFiltered = ads.length;
    const user = JSON.parse(localStorage.getItem('currentUser'));

    if (ads.length === 0) {
        adsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon" style="font-size:40px;">📋</div>
                <p class="empty-state-title">На сервере <span style="color:#ff1e1e">${user?.server || ''}</span> пока нет объявлений</p>
                <p class="empty-state-hint">Будьте первым — создайте объявление и найдите покупателя!</p>
                <a href="create-ad.html" class="empty-state-btn">+ Создать объявление</a>
            </div>
        `;
        return;
    }

    // Показываем только первые _adsPage * ADS_PER_PAGE объявлений
    const visibleAds = ads.slice(0, _adsPage * ADS_PER_PAGE);
    const hasMore = visibleAds.length < ads.length;

    adsGrid.innerHTML = visibleAds.map(ad => createAdCard(ad)).join('');

    // Кнопка «Показать ещё» если есть ещё объявления
    if (hasMore) {
        const remaining = ads.length - visibleAds.length;
        const loadMoreBtn = document.createElement('div');
        loadMoreBtn.id = 'loadMoreBtn';
        loadMoreBtn.style.cssText = 'grid-column:1/-1;display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0 8px;';
        loadMoreBtn.innerHTML = `
            <button onclick="loadMoreAds()" style="
                padding:12px 32px;
                background:rgba(255,30,30,0.08);
                border:1.5px solid rgba(255,30,30,0.25);
                color:#ff6b6b; border-radius:12px;
                font-size:14px; font-weight:600; cursor:pointer;
                transition:all 0.2s;
            " onmouseover="this.style.background='rgba(255,30,30,0.15)'"
               onmouseout="this.style.background='rgba(255,30,30,0.08)'">
                Показать ещё ${Math.min(remaining, ADS_PER_PAGE)} из ${remaining}
            </button>
            <span style="font-size:12px;color:#555;">Показано ${visibleAds.length} из ${ads.length}</span>
        `;
        adsGrid.appendChild(loadMoreBtn);
    }

    document.querySelectorAll('.listing-card').forEach(card => {
        card.addEventListener('click', async () => {
            const adId = parseInt(card.dataset.id);
            const allAds = await getAllAds();
            const ad = allAds.find(a => a.id === adId);
            if (ad) window.openModal(ad);
        });
    });
}

// ===== ПОДГРУЗКА ЕЩЁ ОБЪЯВЛЕНИЙ =====
window.loadMoreAds = function() {
    _adsPage++;
    renderAds();
    // Скролл к новым карточкам — к кнопке «Показать ещё» которая была
    const btn = document.getElementById('loadMoreBtn');
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ===== MODAL =====
let currentPhotoIndex = 0;
let currentAdPhotos = [];

async function openModal(ad) {
    closeModal();
    currentAdPhotos = ad.photos || [];
    currentPhotoIndex = 0;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <button class="modal-close">&times;</button>
            ${createModalContent(ad)}
            <div id="sellerBlock" style="margin-top:4px;">
                <div style="padding:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;margin-bottom:15px;">
                    <span style="color:#555;font-size:13px;">Загрузка отзывов...</span>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));
    if (currentAdPhotos.length > 0) setupGalleryHandlers(modal);
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', handleEsc);

    // Подгружаем блок продавца с отзывами
    try {
        const sellerHtml = await renderSellerBlock(ad);
        const sellerBlock = document.getElementById('sellerBlock');
        if (sellerBlock) sellerBlock.innerHTML = sellerHtml;
    } catch(e) {
        const sellerBlock = document.getElementById('sellerBlock');
        if (sellerBlock) sellerBlock.innerHTML = '';
    }
}

function setupGalleryHandlers(modal) {
    modal.querySelector('.gallery-prev')?.addEventListener('click', (e) => {
        e.stopPropagation();
        changePhoto(-1);
    });
    modal.querySelector('.gallery-next')?.addEventListener('click', (e) => {
        e.stopPropagation();
        changePhoto(1);
    });
    modal.querySelectorAll('.gallery-dot').forEach((dot, index) => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            goToPhoto(index);
        });
    });
}

function changePhoto(direction) {
    currentPhotoIndex += direction;
    if (currentPhotoIndex < 0) currentPhotoIndex = currentAdPhotos.length - 1;
    if (currentPhotoIndex >= currentAdPhotos.length) currentPhotoIndex = 0;
    updateGallery();
}

function goToPhoto(index) {
    currentPhotoIndex = index;
    updateGallery();
}

function updateGallery() {
    const img = document.querySelector('.gallery-image');
    const dots = document.querySelectorAll('.gallery-dot');
    
    if (img) {
        img.style.opacity = '0';
        setTimeout(() => {
            img.src = currentAdPhotos[currentPhotoIndex];
            img.style.opacity = '1';
        }, 200);
    }
    
    dots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentPhotoIndex);
    });
}

function closeModal() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.remove();
            document.removeEventListener('keydown', handleEsc);
        }, 300);
    }
    currentAdPhotos = [];
    currentPhotoIndex = 0;
}

function handleEsc(e) {
    if (e.key === 'Escape') closeModal();
}

function createModalContent(ad) {
    const priceFormatted = ad.price.toLocaleString('ru-RU') + ' ₽';
    const date = new Date(ad.createdAt).toLocaleString('ru-RU');
    
    const categoryNames = {
        cars: 'Машина', houses: 'Дом', garages: 'Гараж',
        business: 'Бизнес', accessories: 'Аксессуар', skins: 'Скин', other: 'Разное'
    };
    
    let galleryHtml = '';
    if (ad.photos?.length > 0) {
        const dotsHtml = ad.photos.map((_, i) => 
            `<span class="gallery-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`
        ).join('');
        const navButtons = ad.photos.length > 1 ? 
            `<button class="gallery-nav gallery-prev">‹</button><button class="gallery-nav gallery-next">›</button>` : '';
        
        galleryHtml = `
            <div class="modal-gallery">
                <img src="${ad.photos[0]}" class="gallery-image" alt="Фото">
                ${navButtons}
                <div class="gallery-dots">${dotsHtml}</div>
            </div>
        `;
    }
    
    let detailsHtml = '';

    if (ad.category === 'cars') {
        detailsHtml = renderCarCard(ad);
    } else if (ad.category === 'houses') {
        detailsHtml = renderHouseCard(ad);
    } else if (ad.category === 'garages') {
        detailsHtml = renderGarageCard(ad);
    } else if (ad.category === 'business') {
        detailsHtml = renderBusinessCard(ad);
    }
    
    // ===== ПРОВЕРЯЕМ, НУЖНА ЛИ КНОПКА ЧАТА =====
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const isOwn = ad.author === currentUser?.nickname;
    
    let chatButtonHtml = '';
    if (currentUser) {
        const safeTitle = ad.title.replace(/'/g, "\\'").replace(/"/g, '\\"');

        // Кнопка чата — только для чужих объявлений
        const chatBtn = !isOwn ? `
            <button onclick="startChat('${ad.author}', ${ad.id}, '${safeTitle}')"
                style="flex:1; padding:14px; background:linear-gradient(135deg,#ff1e1e 0%,#cc0000 100%);
                border:none; border-radius:12px; color:white; font-size:15px; font-weight:600;
                cursor:pointer; transition:all 0.3s ease;"
                onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(255,30,30,0.4)'"
                onmouseout="this.style.transform=''; this.style.boxShadow=''">
                💬 Написать продавцу
            </button>` : '';

        // TG-ссылка — всегда если указан контакт (и для своих и для чужих)
        const tgBtn = ad.contact ? `
            <div class="modal-contacts">
                <div style="display:flex;gap:10px;align-items:center;">
                    <a href="https://t.me/${encodeURIComponent(ad.contact)}" target="_blank" class="telegram-link" style="flex:1;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.692-1.653-1.123-2.678-1.799-1.185-.781-.417-1.21.258-1.911.177-.184 3.247-2.977 3.307-3.23.007-.032.015-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.442-.751-.244-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.015 3.333-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141.121.099.154.232.17.325.015.093.034.305.019.471z"/>
                        </svg>
                        <span>@${escapeHtml(String(ad.contact))}</span>
                        <span class="telegram-action">Написать →</span>
                    </a>
                    <button class="copy-contact-btn" onclick="copyToClipboard('@${(ad.contact||'').replace(/'/g, "\\'")}'); event.stopPropagation();" title="Копировать">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                </div>
            </div>` : '';

        // Показываем блок если есть хоть одна кнопка
        if (chatBtn || tgBtn) {
            chatButtonHtml = `
                <div style="margin-bottom:15px;">
                    ${chatBtn ? `<div style="margin-bottom:10px;">${chatBtn}</div>` : ''}
                    ${tgBtn}
                </div>`;
        }
    }
    
    return `
        <div class="modal-header">
            <span class="modal-category">${escapeHtml(categoryNames[ad.category]) || escapeHtml(String(ad.category))}</span>
            <button class="report-btn" onclick="event.stopPropagation(); openReportModal(${ad.id})" title="Пожаловаться">🚩</button>
        </div>
        ${galleryHtml}
        <h2 class="modal-title">${escapeHtml(ad.title)}</h2>
        <p class="modal-price">${priceFormatted}</p>
        ${ad.description ? `<div class="modal-description"><h4>Описание</h4><p>${escapeHtml(ad.description)}</p></div>` : ''}
        ${detailsHtml}
        ${chatButtonHtml}
        <div class="modal-footer">
            <span>Продавец: <a href="profile.html?user=${encodeURIComponent(ad.author)}" onclick="event.stopPropagation()" style="color:#ff6b6b;text-decoration:none;font-weight:600;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(ad.author)}</a></span>
            <span>${date}</span>
        </div>
    `;
}

function getFirmwareName(value) {
    const names = { stock: 'Сток', drift: 'Дрифт', 'comfort+': 'Комфорт+', sport: 'Спорт', 'sport+': 'Спорт+' };
    return escapeHtml(names[value] || String(value));
}

// ===== СИСТЕМА ОТЗЫВОВ =====

async function getReviews(nickname) {
    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const { db } = await import('./firebase-config.js');
        const snap = await getDoc(doc(db, 'reviews', nickname));
        return snap.exists() ? snap.data().items || [] : [];
    } catch (e) { return []; }
}

async function saveReview(nickname, review) {
    try {
        const { doc, getDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const { db } = await import('./firebase-config.js');
        const ref = doc(db, 'reviews', nickname);
        const snap = await getDoc(ref);
        const items = snap.exists() ? snap.data().items || [] : [];
        items.unshift(review);
        if (items.length > 100) items.pop(); // максимум 100 отзывов
        await setDoc(ref, { items });
        return true;
    } catch (e) { console.error(e); return false; }
}

function calcRating(reviews) {
    if (!reviews.length) return null;
    const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    return avg.toFixed(1);
}

function renderStars(rating, interactive = false, name = '') {
    const stars = [1, 2, 3, 4, 5];
    if (interactive) {
        return stars.map(s => `
            <input type="radio" name="${name}" id="star${s}" value="${s}" style="display:none;">
            <label for="star${s}" style="font-size:28px;cursor:pointer;color:${s <= 0 ? '#ffd700' : '#444'};transition:color 0.15s;" 
                onmouseover="highlightStars(this,${s})" onmouseout="resetStars('${name}')" onclick="selectStar(${s},'${name}')">★</label>
        `).reverse().join('');
    }
    const filled = Math.round(parseFloat(rating) || 0);
    return stars.map(s => `<span style="color:${s <= filled ? '#ffd700' : '#333'};font-size:16px;">★</span>`).join('');
}

window.highlightStars = function(el, value) {
    const labels = el.closest('.stars-row').querySelectorAll('label');
    labels.forEach(l => {
        l.style.color = parseInt(l.getAttribute('for').replace('star','')) <= value ? '#ffd700' : '#444';
    });
};

window.resetStars = function(name) {
    const selected = window._selectedRating || 0;
    document.querySelectorAll(`label[for^="star"]`).forEach(l => {
        l.style.color = parseInt(l.getAttribute('for').replace('star','')) <= selected ? '#ffd700' : '#444';
    });
};

window.selectStar = function(value, name) {
    window._selectedRating = value;
};

async function renderSellerBlock(ad) {
    const isOwn = ad.author === currentUser?.nickname;
    const reviews = await getReviews(ad.author);
    const rating = calcRating(reviews);
    const ratingHtml = rating
        ? `<span style="color:#ffd700;">${renderStars(rating)}</span> <span style="color:white;font-weight:600;">${rating}</span> <span style="color:#888;font-size:13px;">(${reviews.length})</span>`
        : `<span style="color:#555;font-size:13px;">Нет отзывов</span>`;

    // Подгружаем бейджи продавца
    let sellerBadgesHtml = '';
    try {
        const allUsers = await getUsers();
        const seller = allUsers.find(u => u.nickname === ad.author);
        if (seller?.badges?.length) {
            sellerBadgesHtml = `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;">${renderUserBadges(seller.badges, 'sm')}</div>`;
        }
    } catch(e) {}


    // Последние 3 отзыва
    const recentReviews = reviews.slice(0, 3).map(r => `
        <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:12px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="color:#aaa;font-size:13px;font-weight:600;">${escapeHtml(r.author)}</span>
                <span style="color:#ffd700;font-size:13px;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
            </div>
            ${r.text ? `<p style="color:#888;font-size:13px;margin:0;">${escapeHtml(r.text)}</p>` : ''}
        </div>
    `).join('');

    const leaveReviewBtn = !isOwn ? `
        <button onclick="openReviewModal('${escapeHtml(ad.author)}')" 
            style="width:100%;padding:10px;background:rgba(255,30,30,0.1);border:1px solid rgba(255,30,30,0.3);
            border-radius:10px;color:#ff6b6b;font-size:14px;cursor:pointer;margin-top:8px;transition:all 0.2s;"
            onmouseover="this.style.background='rgba(255,30,30,0.18)'" onmouseout="this.style.background='rgba(255,30,30,0.1)'">
            ✍️ Оставить отзыв
        </button>` : '';

    const showAllBtn = reviews.length > 3 ? `
        <button onclick="openAllReviews('${escapeHtml(ad.author)}')"
            style="width:100%;padding:8px;background:none;border:1px solid rgba(255,255,255,0.1);
            border-radius:10px;color:#888;font-size:13px;cursor:pointer;margin-top:6px;">
            Все отзывы (${reviews.length}) →
        </button>` : '';

    return `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px;margin-bottom:15px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div>
                    <div style="color:white;font-weight:600;margin-bottom:4px;">👤 ${escapeHtml(ad.author)}</div>
                    <div style="display:flex;align-items:center;gap:6px;">${ratingHtml}</div>
                    ${sellerBadgesHtml}
                </div>
            </div>
            ${recentReviews}
            ${showAllBtn}
            ${leaveReviewBtn}
        </div>
    `;
}

window.openReviewModal = function(nickname) {
    const existing = document.getElementById('reviewModal');
    if (existing) existing.remove();

    window._selectedRating = 0;

    const modal = document.createElement('div');
    modal.id = 'reviewModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div style="background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;width:100%;max-width:420px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="color:white;margin:0;">Отзыв о ${escapeHtml(nickname)}</h3>
                <button onclick="document.getElementById('reviewModal').remove()" style="background:rgba(255,255,255,0.08);border:none;color:#aaa;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;">×</button>
            </div>
            <div style="margin-bottom:16px;">
                <p style="color:#888;font-size:13px;margin-bottom:10px;">Оценка:</p>
                <div class="stars-row" style="display:flex;flex-direction:row-reverse;justify-content:flex-end;gap:4px;">
                    ${renderStars(0, true, 'reviewRating')}
                </div>
            </div>
            <div style="margin-bottom:20px;">
                <textarea id="reviewText" placeholder="Напишите отзыв (необязательно)..." rows="3"
                    style="width:100%;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(34,34,34,0.8);color:white;font-size:14px;resize:none;font-family:inherit;box-sizing:border-box;"></textarea>
            </div>
            <button onclick="submitReview('${escapeHtml(nickname)}')"
                style="width:100%;padding:14px;background:linear-gradient(135deg,#ff1e1e,#cc0000);border:none;border-radius:12px;color:white;font-size:15px;font-weight:700;cursor:pointer;transition:opacity 0.2s;"
                onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                Отправить отзыв
            </button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

window.submitReview = async function(nickname) {
    const rating = window._selectedRating || 0;
    if (!rating) {
        showToast('Поставьте оценку!', 'warning');
        return;
    }

    // Проверка: уже оставлял отзыв?
    const existing = await getReviews(nickname);
    if (existing.some(r => r.author === currentUser.nickname)) {
        showToast('Вы уже оставляли отзыв этому продавцу', 'warning');
        return;
    }

    const text = document.getElementById('reviewText')?.value.trim() || '';
    const review = {
        author: currentUser.nickname,
        rating,
        text,
        createdAt: new Date().toISOString()
    };

    const btn = document.querySelector('#reviewModal button:last-child');
    if (btn) { btn.disabled = true; btn.textContent = 'Отправка...'; }

    const success = await saveReview(nickname, review);
    if (success) {
        document.getElementById('reviewModal')?.remove();
        showToast('Отзыв опубликован! ⭐', 'success');
    } else {
        showToast('Ошибка. Попробуйте снова', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Отправить отзыв'; }
    }
};

window.openAllReviews = async function(nickname) {
    const reviews = await getReviews(nickname);
    const rating = calcRating(reviews);

    const existing = document.getElementById('allReviewsModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'allReviewsModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div style="background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:28px;width:100%;max-width:500px;max-height:80vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h3 style="color:white;margin:0;">Отзывы о ${escapeHtml(nickname)}</h3>
                <button onclick="document.getElementById('allReviewsModal').remove()" style="background:rgba(255,255,255,0.08);border:none;color:#aaa;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;">×</button>
            </div>
            <div style="color:#ffd700;margin-bottom:20px;">
                ${renderStars(rating)} <span style="color:white;font-weight:600;">${rating || '—'}</span>
                <span style="color:#888;font-size:13px;">(${reviews.length} отзывов)</span>
            </div>
            ${reviews.map(r => `
                <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span style="color:#aaa;font-weight:600;">${escapeHtml(r.author)}</span>
                        <span style="color:#ffd700;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
                    </div>
                    ${r.text ? `<p style="color:#888;font-size:13px;margin:0 0 6px;">${escapeHtml(r.text)}</p>` : ''}
                    <span style="color:#555;font-size:11px;">${new Date(r.createdAt).toLocaleDateString('ru-RU')}</span>
                </div>
            `).join('')}
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};



function badge(text, color) {
    const colors = {
        red:    ['rgba(255,30,30,0.15)',   '#ff6b6b',  'rgba(255,30,30,0.3)'],
        green:  ['rgba(76,175,80,0.15)',   '#66bb6a',  'rgba(76,175,80,0.3)'],
        blue:   ['rgba(33,150,243,0.15)',  '#64b5f6',  'rgba(33,150,243,0.3)'],
        amber:  ['rgba(255,152,0,0.15)',   '#ffa726',  'rgba(255,152,0,0.3)'],
        purple: ['rgba(156,39,176,0.15)',  '#ce93d8',  'rgba(156,39,176,0.3)'],
        gray:   ['rgba(255,255,255,0.08)', '#aaa',     'rgba(255,255,255,0.15)'],
    };
    const [bg, fg, border] = colors[color] || colors.gray;
    return `<span style="display:inline-flex;align-items:center;padding:5px 12px;border-radius:8px;font-size:13px;font-weight:500;background:${bg};color:${fg};border:1px solid ${border};white-space:nowrap;">${text}</span>`;
}

function badgeYesNo(label, value) {
    if (!value) return '';
    const isYes = value === 'yes';
    return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;">
        <span style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
        <span style="font-size:13px;font-weight:600;color:${isYes ? '#66bb6a' : '#ef5350'};">${isYes ? '✓ Есть' : '✗ Нет'}</span>
    </div>`;
}

function section(title, content) {
    return `<div style="margin:16px 0;">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">${title}</div>
        ${content}
    </div>`;
}

function renderCarCard(ad) {
    const MILEAGE = {'0-10':'До 10 000 км','10-50':'10 — 50 тыс. км','50-100':'50 — 100 тыс. км','100+':'Более 100 000 км'};
    const FIRMWARE = {stock:'Сток', drift:'Дрифт', 'comfort+':'Комфорт+', sport:'Спорт', 'sport+':'Спорт+'};
    const FIRMWARE_COLOR = {stock:'gray', drift:'blue', 'comfort+':'green', sport:'amber', 'sport+':'red'};
    const SUSPEND = {hydraulic:'🔧 Гидравлика', pneumatic:'💨 Пневма'};

    let html = '<div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:16px;margin-top:4px;">';

    // Строка 1: пробег + прошивка
    let row1 = '';
    if (ad.mileage) row1 += badge('🛣 ' + (MILEAGE[ad.mileage] || ad.mileage), 'gray');
    if (ad.firmware) row1 += badge('⚙️ ' + (FIRMWARE[ad.firmware] || ad.firmware), FIRMWARE_COLOR[ad.firmware] || 'gray');
    if (row1) html += section('Основное', `<div style="display:flex;flex-wrap:wrap;gap:8px;">${row1}</div>`);

    // Строка 2: свет
    let lights = '';
    if (ad.lights?.underglow?.has) {
        const posNames = {bottom:'нижняя', left:'левая', right:'правая'};
        const pos = (ad.lights.underglow.positions||[]).map(p => posNames[p]||p).join(', ');
        lights += badge('💡 Подсветка' + (pos ? ` (${pos})` : ''), 'amber');
    }
    if (ad.lights?.highBeam) lights += badge('🔆 Дальний свет', 'amber');
    if (ad.lights?.strobe?.has) lights += badge('🔴 Стробы' + (ad.lights.strobe.type === 'donate' ? ' (донат)' : ' (обычные)'), 'purple');
    if (lights) html += section('Свет', `<div style="display:flex;flex-wrap:wrap;gap:8px;">${lights}</div>`);

    // Строка 3: подвеска
    let susp = '';
    if (ad.suspension?.length) ad.suspension.forEach(s => susp += badge(SUSPEND[s]||s, 'blue'));
    if (susp) html += section('Подвеска', `<div style="display:flex;flex-wrap:wrap;gap:8px;">${susp}</div>`);

    // Строка 4: есть/нет
    const ynItems = [
        ['Шинка', ad.tires],
        ['Клиренс', ad.clearance],
        ['Лаунч', ad.launch],
        ['ПДВ', ad.pdv],
        ['Антирадар', ad.antiradar],
    ].filter(([, v]) => v);

    if (ynItems.length) {
        const ynHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:8px;">${ynItems.map(([l,v]) => badgeYesNo(l,v)).join('')}</div>`;
        html += section('Комплектация', ynHtml);
    }

    html += '</div>';
    return html;
}

function renderHouseCard(ad) {
    let html = '<div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:16px;margin-top:4px;">';
    let items = '';
    if (ad.location) items += badge('📍 ' + escapeHtml(ad.location), 'blue');
    if (ad.upgrades) items += badge('🏠 Дом ' + escapeHtml(ad.upgrades), ad.upgrades === '5/5' ? 'green' : 'amber');
    if (ad.basement) items += badge('🏚 Подвал ' + escapeHtml(ad.basement), ad.basement === '5/5' ? 'green' : 'amber');
    if (items) html += `<div style="display:flex;flex-wrap:wrap;gap:8px;">${items}</div>`;
    html += '</div>';
    return html;
}

function renderGarageCard(ad) {
    let html = '<div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:16px;margin-top:4px;">';
    let items = '';
    if (ad.location) items += badge('📍 ' + escapeHtml(ad.location), 'blue');
    if (ad.upgrades) items += badge('🔧 Улучшения ' + escapeHtml(ad.upgrades), ad.upgrades === '5/5' ? 'green' : 'amber');
    if (items) html += `<div style="display:flex;flex-wrap:wrap;gap:8px;">${items}</div>`;
    html += '</div>';
    return html;
}

function renderBusinessCard(ad) {
    let html = '<div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:16px;margin-top:4px;">';
    let items = '';
    if (ad.businessCategoryName) items += badge('🏪 ' + escapeHtml(ad.businessCategoryName), 'purple');
    if (ad.businessLocation) items += badge('📍 ' + escapeHtml(ad.businessLocation), 'blue');
    if (ad.businessIncome) {
        const from = ad.businessIncome.from ? ad.businessIncome.from.toLocaleString('ru-RU') + '₽' : '';
        const to = ad.businessIncome.to ? ad.businessIncome.to.toLocaleString('ru-RU') + '₽' : '';
        const income = from && to ? `${from} — ${to}` : from ? `от ${from}` : `до ${to}`;
        if (income) items += badge('💰 ' + income + '/день', 'green');
    }
    if (items) html += `<div style="display:flex;flex-wrap:wrap;gap:8px;">${items}</div>`;
    html += '</div>';
    return html;
}

function renderLights(lights) { return ''; }
function renderSuspension(suspension) { return ''; }

// escapeHtml — импортирован из utils.js

// ─────────────────────────────────────────────
// 👤 СТРАНИЦА ПРОДАВЦА
// ─────────────────────────────────────────────
window.openSellerPage = async function(nickname) {
    // Убираем старую модалку если есть
    document.getElementById('sellerModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'sellerModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:16px;';

    modal.innerHTML = `
        <div style="background:#111;border:1px solid rgba(255,255,255,0.1);border-radius:20px;width:100%;max-width:600px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.08);">
                <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#ff1e1e,#cc0000);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:white;">
                        ${escapeHtml(nickname.charAt(0).toUpperCase())}
                    </div>
                    <div>
                        <div style="font-size:17px;font-weight:700;color:white;">${escapeHtml(nickname)}</div>
                        <div id="sellerRating" style="font-size:13px;color:#888;">Загрузка...</div>
                    </div>
                </div>
                <button onclick="document.getElementById('sellerModal').remove()" style="background:rgba(255,255,255,0.08);border:none;color:#aaa;width:32px;height:32px;border-radius:50%;font-size:18px;cursor:pointer;">×</button>
            </div>
            <div id="sellerAds" style="overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;">
                <div style="text-align:center;padding:40px;color:#555;">Загрузка...</div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Параллельно грузим объявления и отзывы
    const [allAds, reviews] = await Promise.all([
        getAllAds(),
        getReviews(nickname)
    ]);

    const sellerAds = allAds.filter(a => a.author === nickname);

    // Рейтинг
    const ratingEl = document.getElementById('sellerRating');
    if (reviews.length > 0) {
        const avg = (reviews.reduce((s, r) => s + (r.rating || 5), 0) / reviews.length).toFixed(1);
        const stars = '★'.repeat(Math.round(avg)) + '☆'.repeat(5 - Math.round(avg));
        ratingEl.innerHTML = `<span style="color:#f9ca24">${stars}</span> ${avg} · ${reviews.length} отзывов · ${sellerAds.length} объявлений`;
    } else {
        ratingEl.textContent = `${sellerAds.length} объявлений · Нет отзывов`;
    }

    // Объявления продавца
    const adsEl = document.getElementById('sellerAds');
    if (sellerAds.length === 0) {
        adsEl.innerHTML = '<div style="text-align:center;padding:40px;color:#555;">Нет активных объявлений</div>';
        return;
    }

    adsEl.innerHTML = sellerAds.map(ad => `
        <div onclick="document.getElementById('sellerModal').remove(); setTimeout(()=>openModal(${JSON.stringify(ad).replace(/"/g,'&quot;')}),100)"
            style="display:flex;align-items:center;gap:12px;padding:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;cursor:pointer;transition:background 0.15s;"
            onmouseover="this.style.background='rgba(255,30,30,0.08)'"
            onmouseout="this.style.background='rgba(255,255,255,0.04)'">
            ${ad.photos?.[0]
                ? `<img src="${ad.photos[0]}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;flex-shrink:0;">`
                : `<div style="width:60px;height:60px;background:rgba(255,255,255,0.06);border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px;">📋</div>`
            }
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;color:white;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(ad.title)}</div>
                <div style="color:#ff1e1e;font-weight:700;font-size:15px;">${formatPrice(ad.price)}</div>
                <div style="color:#555;font-size:12px;margin-top:2px;">${timeAgo(ad.createdAt)}</div>
            </div>
            <div style="color:#444;font-size:20px;">›</div>
        </div>
    `).join('');
};

// ===== GLOBAL FUNCTIONS =====
window.toggleFavCard = function(adId) {
    const id = Number(adId);
    const isNowFav = toggleFavorite(id);
    const btn = document.querySelector(`.listing-card[data-id="${id}"] .fav-btn`);
    if (btn) {
        btn.classList.toggle('active', isNowFav);
        const path = btn.querySelector('path');
        const svg = btn.querySelector('svg');
        if (path) {
            path.setAttribute('fill', isNowFav ? '#ff4d6d' : 'none');
            path.setAttribute('stroke', isNowFav ? '#ff4d6d' : 'rgba(255,255,255,0.35)');
        }
        if (svg) svg.style.transform = isNowFav ? 'scale(1.2)' : 'scale(1)';
    }
};

async function showFavorites() {
    currentCategory = 'favorites';
    const favorites = getFavorites();
    const allAds = await getAllAds();
    const user = JSON.parse(localStorage.getItem('currentUser'));
    // Показываем только избранное с текущего сервера
    const favAds = allAds.filter(ad => favorites.includes(ad.id) && ad.server === user?.server);
    const adsGrid = document.getElementById('adsGrid');
    
    document.querySelectorAll('#categoryList li').forEach(li => li.classList.remove('active'));
    
    if (favAds.length === 0) {
        adsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">♥</div>
                <p class="empty-state-title">Избранное пусто</p>
                <p class="empty-state-hint">Нажми <span class="empty-state-accent">♥</span> на карточке объявления — оно появится здесь</p>
            </div>
        `;
        return;
    }
    
    adsGrid.innerHTML = favAds.map(ad => createAdCard(ad)).join('');
    document.querySelectorAll('.listing-card').forEach(card => {
        card.addEventListener('click', async () => {
            const adId = parseInt(card.dataset.id);
            const ads = await getAllAds();
            const ad = ads.find(a => a.id === adId);
            if (ad) window.openModal(ad);
        });
    });
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    // Сбрасываем кэш если только что опубликовали объявление
    if (document.referrer.includes('create-ad') || sessionStorage.getItem('adJustCreated')) {
        invalidateCache('ads');
        sessionStorage.removeItem('adJustCreated');
    }

    // ЗБТ-баннер — добавлен статически в index.html

    // ── Инициализация шторки профиля ──
    initSidebarHeader();

    // Открываем объявление если пришли с profile.html
    if (window.location.hash === '#openAd') {
        const adData = sessionStorage.getItem('openAd');
        if (adData) {
            sessionStorage.removeItem('openAd');
            window.history.replaceState({}, document.title, 'index.html');
            try { setTimeout(() => window.openModal(JSON.parse(adData)), 800); } catch {}
        }
    }

    // ⚡ renderAds() сразу показывает скелетон, потом грузит данные — один вызов
    renderAds();
    updateFavCount();
    updateMyAdsCount();
    cleanupFavorites();

    // Открываем объявление если пришли с profile.html (?openAd=123)
    const _openAdId = new URLSearchParams(window.location.search).get('openAd');
    if (_openAdId) {
        window.history.replaceState({}, '', 'index.html');
        getAllAds().then(ads => {
            const ad = ads.find(a => String(a.id) === String(_openAdId));
            if (ad) setTimeout(() => openModal(ad), 400);
        });
    }
    // Запускаем чат только после подтверждения Firebase Auth сессии
    onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
            initChat();
        }
    });
    initAdvancedSearch();
    initBugReport();
    
    document.getElementById('favoritesMenuItem')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeProfileMenu();
        showFavorites();
    });
    
    document.getElementById('myAdsMenuItem')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeProfileMenu();
        showMyAds();
    });

    // Проверяем роль с Firestore — не из localStorage!
    // Это защищает от подмены роли через DevTools
    checkUserRole();

    // Редактирование профиля — кнопка ✏️
    document.querySelectorAll('.profile-menu-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            const icon = item.querySelector('.menu-icon')?.textContent;
            if (icon === '✏️') {
                e.preventDefault();
                openProfileEdit();
            }
        });
    });

    const newPasswordInput = document.getElementById('newPassword');
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', function() {
            const group = document.getElementById('confirmPasswordGroup');
            if (group) {
                group.style.display = this.value ? 'flex' : 'none';
            }
        });
    }
});

function openProfileEdit() {
    const modal = document.getElementById('editProfileModal');
    const user = JSON.parse(localStorage.getItem('currentUser'));
    
    if (!user) return;
    
    const nicknameInput = document.getElementById('editNickname');
    if (nicknameInput) {
        nicknameInput.value = user.nickname;
    }
    
    const currentPass = document.getElementById('currentPassword');
    const newPass = document.getElementById('newPassword');
    const confirmPass = document.getElementById('confirmNewPassword');
    const confirmGroup = document.getElementById('confirmPasswordGroup');
    
    if (currentPass) currentPass.value = '';
    if (newPass) newPass.value = '';
    if (confirmPass) confirmPass.value = '';
    if (confirmGroup) confirmGroup.style.display = 'none';
    
    if (modal) {
        modal.classList.remove('hidden');
        requestAnimationFrame(function() {
            modal.classList.add('active');
        });
    }
    
    closeProfileMenu();
}

function closeProfileEdit() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(function() {
            modal.classList.add('hidden');
        }, 300);
    }
}

async function saveProfileChanges() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) {
        showToast('Ошибка: не авторизован', 'error');
        return;
    }
        // Защита от двойного клика
    if (isProcessing('saveProfile')) {
        return;
    }
    const currentPasswordInput = document.getElementById('currentPassword');
    const newNicknameInput = document.getElementById('editNickname');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmNewPassword');
    
    const currentPassword = currentPasswordInput ? currentPasswordInput.value : '';
    const newNickname = newNicknameInput ? newNicknameInput.value.trim() : '';
    const newPassword = newPasswordInput ? newPasswordInput.value : '';
    const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : '';
    
    if (currentPassword !== user.password) {
        showToast('Неверный текущий пароль!', 'error');
        return;
    }
    
    // Проверка ника через Firebase
    if (newNickname && newNickname !== user.nickname) {
        const users = await getFirebaseUsers();
        const exists = users.find(u => u.nickname.toLowerCase() === newNickname.toLowerCase() && u.nickname !== user.nickname);
        if (exists) {
            showToast('Этот никнейм уже занят!', 'error');
            return;
        }
    }
    
    if (newPassword) {
        if (newPassword.length < 4) {
            showToast('Пароль слишком короткий!', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast('Пароли не совпадают!', 'error');
            return;
        }
    }
    
    const oldNickname = user.nickname;
    
    // Обновляем объявления если менялся ник
    if (newNickname && newNickname !== user.nickname) {
        const allAds = await getAllAds();
        const updatedAds = allAds.map(ad => {
            if (ad.author === oldNickname) {
                return { ...ad, author: newNickname };
            }
            return ad;
        });
        await setDoc(doc(db, 'data', 'ads'), { items: updatedAds });
    }
    
    // Обновляем пользователя
    user.nickname = newNickname || user.nickname;
    if (newPassword) user.password = newPassword;
    
    await updateFirebaseUser(user);
    
    localStorage.setItem('currentUser', JSON.stringify(user));
    
    const profileNickname = document.getElementById('profileNickname');
    const sidebarNickname = document.getElementById('sidebarNickname');
    
    if (profileNickname) {
        profileNickname.textContent = user.nickname + ' • ' + user.server;
    }
    if (sidebarNickname) {
        sidebarNickname.textContent = user.nickname;
    }
    
    // Переносим избранное
    if (newNickname !== oldNickname) {
        const oldFavs = localStorage.getItem('favorites_' + oldNickname);
        if (oldFavs) {
            localStorage.setItem('favorites_' + newNickname, oldFavs);
            localStorage.removeItem('favorites_' + oldNickname);
        }
    }
    
       showToast('Профиль обновлён!', 'success');
    closeProfileEdit();
    
    // Перезагружаем страницу если менялся ник
    if (newNickname !== oldNickname) {
        setTimeout(() => window.location.reload(), 500);
    } else {
        renderAds();
    }
}

// Firebase функции для пользователей
async function getFirebaseUsers() {
    try {
        const docRef = doc(db, 'data', 'users');
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data().items || [] : [];
    } catch (e) {
        return [];
    }
}

async function updateFirebaseUser(updatedUser) {
    try {
        const users = await getFirebaseUsers();
        const index = users.findIndex(u => u.nickname === updatedUser.nickname || u.id === updatedUser.id);
        if (index !== -1) {
            users[index] = updatedUser;
        } else {
            users.push(updatedUser);
        }
        await setDoc(doc(db, 'data', 'users'), { items: users });
        return true;
    } catch (e) {
        console.error('Ошибка обновления пользователя:', e);
        return false;
    }
}

// Глобальные функции
window.openProfileEdit = openProfileEdit;
window.closeProfileEdit = closeProfileEdit;
window.saveProfileChanges = saveProfileChanges;
window.editAd = editAd;
window.closeEditModal = closeEditModal;
window.saveEditAd = saveEditAd;
window.deleteAd = deleteAd;

// ===== ЖАЛОБЫ =====
window.openReportModal = async function(adId) {
    const allAds = await getAllAds();
    const ad = allAds.find(a => a.id === adId);
    if (!ad) return;
    
    const existingModal = document.querySelector('.report-modal-overlay');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.className = 'report-modal-overlay';
    modal.innerHTML = `
        <div class="report-modal-content">
            <button class="modal-close" onclick="closeReportModal()">&times;</button>
            <h2>🚩 Пожаловаться на объявление</h2>
            <p class="report-ad-title">${escapeHtml(ad.title)}</p>
            <p class="report-ad-author">Продавец: ${escapeHtml(ad.author)}</p>
            
            <div class="report-reasons">
                <label class="report-reason">
                    <input type="radio" name="reportReason" value="spam" checked>
                    <span>Спам / Реклама</span>
                </label>
                <label class="report-reason">
                    <input type="radio" name="reportReason" value="wrong_price">
                    <span>Неверная цена</span>
                </label>
                <label class="report-reason">
                    <input type="radio" name="reportReason" value="scam">
                    <span>Мошенничество</span>
                </label>
                <label class="report-reason">
                    <input type="radio" name="reportReason" value="sold">
                    <span>Уже продано</span>
                </label>
                <label class="report-reason">
                    <input type="radio" name="reportReason" value="other">
                    <span>Другое</span>
                </label>
            </div>
            
            <textarea id="reportComment" placeholder="Опишите проблему подробнее (необязательно)" rows="3"></textarea>
            
            <div class="report-actions">
                <button class="report-submit-btn" onclick="submitReport(${adId})">Отправить жалобу</button>
                <button class="report-cancel-btn" onclick="closeReportModal()">Отмена</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeReportModal();
    });
};

window.closeReportModal = function() {
    const modal = document.querySelector('.report-modal-overlay');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
};

async function getReports() {
    try {
        const docRef = doc(db, 'data', 'reports');
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data().items || [] : [];
    } catch (e) {
        return [];
    }
}

async function saveReportToFirebase(report) {
    try {
        const reports = await getReports();
        reports.push({
            ...report,
            id: Date.now(),
            createdAt: new Date().toISOString(),
            status: 'new'
        });
        await setDoc(doc(db, 'data', 'reports'), { items: reports });
        return true;
    } catch (e) {
        console.error('Ошибка сохранения жалобы:', e);
        return false;
    }
}

window.submitReport = async function(adId) {
    const allAds = await getAllAds();
    const ad = allAds.find(a => a.id === adId);
    if (!ad) return;
    
    const reason = document.querySelector('input[name="reportReason"]:checked')?.value || 'other';
    const comment = document.getElementById('reportComment')?.value.trim() || '';
    
    const report = {
        adId: adId,
        adTitle: ad.title,
        adAuthor: ad.author,
        reporter: currentUser?.nickname || 'Гость',
        reason: reason,
        comment: comment,
        server: ad.server
    };
    
    const success = await saveReportToFirebase(report);
    if (!success) {
        showToast('Ошибка отправки жалобы!', 'error');
        return;
    }
    
    closeReportModal();
    
    const toast = document.createElement('div');
    toast.className = 'report-toast';
    toast.textContent = 'Жалоба отправлена! Спасибо.';
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }, 100);
};
// ===== КОПИРОВАНИЕ В БУФЕР =====
window.copyToClipboard = async function(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('📋 Ник скопирован: ' + text);
    } catch (err) {
        // Fallback для старых браузеров
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('📋 Ник скопирован: ' + text);
    }
};
// --- ЧАТ ---
// ===== РОЛИ — читаем с Firestore, не из localStorage =====
// Кэшируем в памяти чтобы не спамить запросами
let _userRole = null;
let _roleLoaded = false;

async function checkUserRole() {
    if (!currentUser) return;
    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const snap = await getDoc(doc(db, 'data', 'roles'));
        const roles = snap.exists() ? snap.data().items || {} : {};
        // Проверяем по нижнему регистру для надёжности
        _userRole = roles[currentUser.nickname] || roles[currentUser.nickname?.toLowerCase()] || null;
        _roleLoaded = true;

        // Показываем кнопку админки только если есть роль
        if (_userRole) {
            document.querySelectorAll('.admin-only').forEach(el => el.style.removeProperty('display'));
        }
        // Ролевая плашка в шторке
        applySidebarRole(_userRole);
    } catch (e) {
        console.error('Ошибка загрузки роли:', e);
        _roleLoaded = true;
    }
}

// Проверка что пользователь имеет нужный уровень доступа
function hasRole(minRole) {
    const levels = { moder: 1, admin: 2, owner: 3 };
    const myLevel = levels[_userRole] || 0;
    const required = levels[minRole] || 99;
    return myLevel >= required;
}

let unreadCountUnsubscribe = null;

// ── Браузерные уведомления о сообщениях ──
async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
}

function showChatNotification(count) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // не показываем если вкладка активна

    new Notification('Black Market', {
        body: `У вас ${count} непрочитанных сообщений`,
        icon: 'logo.svg',
        badge: 'logo.svg',
        tag: 'chat-notification', // заменяет предыдущее вместо стека
        silent: false
    });
}

let _prevUnreadCount = 0;

async function initChat() {
    try {
        // Запрашиваем разрешение на уведомления
        await requestNotificationPermission();

        const { subscribeToUnreadCount } = await import('./chat.js');
        unreadCountUnsubscribe = subscribeToUnreadCount((count) => {
            const badge = document.getElementById('chatCount');
            if (badge) {
                badge.textContent = count;
                badge.classList.toggle('hidden', count === 0);
            }

            // Показываем уведомление только если счётчик вырос
            if (count > _prevUnreadCount && _prevUnreadCount !== null) {
                showChatNotification(count);

                // Меняем title вкладки
                if (count > 0) {
                    document.title = `(${count}) Black Market`;
                } else {
                    document.title = 'Black Market';
                }
            }
            _prevUnreadCount = count;
        });
    } catch (e) {
        console.log('Chat not loaded:', e);
    }
}

// Сбрасываем счётчик в title когда вкладка снова активна
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (_prevUnreadCount > 0) {
            document.title = `(${_prevUnreadCount}) Black Market`;
        } else {
            document.title = 'Black Market';
        }
    }
});

// Отписываемся при уходе со страницы
window.addEventListener('beforeunload', () => {
    if (unreadCountUnsubscribe) unreadCountUnsubscribe();
});

window.startChat = async function(author, adId, adTitle) {
    try {
        const { createChat } = await import('./chat.js');
        const chatId = await createChat(author, adId, adTitle);
        if (chatId) {
            window.location.href = `chat.html?with=${encodeURIComponent(author)}&adId=${adId}&adTitle=${encodeURIComponent(adTitle)}`;
        }
    } catch (e) {
        console.error('Chat error:', e);
        showToast('Ошибка открытия чата', 'error');
    }
};

// ===== РАСШИРЕННЫЕ ФИЛЬТРЫ =====
let advancedFilters = {};
let filtersOpen = false;

const LOCATIONS = ['Арзамас', 'Батырево', 'Лыткарино', 'Южный', 'Нижегородск'];
const FIRMWARE_LIST = ['stock','drift','comfort+','sport','sport+'];
const FIRMWARE_NAMES = {stock:'Сток', drift:'Дрифт', 'comfort+':'Комфорт+', sport:'Спорт', 'sport+':'Спорт+'};
const UPGRADES_LIST = ['1/5','2/5','3/5','4/5','5/5'];
const BUSINESS_TYPES = {
    '247':'Магазин 24/7','gas':'АЗС','sk':'СК','tk':'ТК','ammo':'Амуниция',
    'accessories':'Аксессуары','clothes':'Одежда','workshop':'Мастерская',
    'pvz':'ПВЗ','fishing':'Рыболовный','sto':'СТО','techcenter':'Тех. центр',
    'snackbar':'Закусочная','club':'Клуб','taxi':'Такси','styling':'Стайлинг','tireshop':'Шиномонтаж'
};

function initAdvancedSearch() {
    const searchPanel = document.querySelector('.search-panel');
    if (!searchPanel || document.getElementById('advancedSearchBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'advancedSearchBtn';
    btn.innerHTML = '🔍 Фильтры';
    btn.style.cssText = 'padding: 12px 20px; background: rgba(255,30,30,0.1); border: 2px solid rgba(255,30,30,0.3); border-radius: 8px; color: #ff1e1e; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s;';
    btn.onclick = toggleFiltersPanel;
    searchPanel.appendChild(btn);
}

function toggleFiltersPanel() {
    const existing = document.getElementById('advFilters');
    if (existing) {
        existing.remove();
        filtersOpen = false;
        document.getElementById('advancedSearchBtn').style.background = 'rgba(255,30,30,0.1)';
        return;
    }
    filtersOpen = true;
    document.getElementById('advancedSearchBtn').style.background = 'rgba(255,30,30,0.25)';
    renderFiltersPanel();
}

function renderFiltersPanel() {
    const existing = document.getElementById('advFilters');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'advFilters';
    panel.style.cssText = 'background: rgba(13,13,13,0.98); border: 1px solid rgba(255,30,30,0.25); border-radius: 14px; padding: 20px; margin-top: 10px;';

    const cat = currentCategory;

    // Всегда: цена
    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
            <span style="color:#ff1e1e;font-weight:600;font-size:15px;">Фильтры</span>
            <button onclick="resetAllFilters()" style="background:none;border:1px solid rgba(255,255,255,0.15);color:#888;padding:5px 12px;border-radius:8px;font-size:12px;cursor:pointer;">Сбросить все</button>
        </div>
        <div class="filter-section">
            <div class="filter-label">💰 Цена</div>
            <div style="display:flex;gap:8px;align-items:center;">
                <input type="number" id="fPriceMin" placeholder="От" value="${advancedFilters.priceMin||''}"
                    style="flex:1;padding:10px 12px;background:rgba(34,34,34,0.8);border:1.5px solid rgba(255,255,255,0.1);border-radius:8px;color:white;font-size:14px;">
                <span style="color:#555;">—</span>
                <input type="number" id="fPriceMax" placeholder="До" value="${advancedFilters.priceMax||''}"
                    style="flex:1;padding:10px 12px;background:rgba(34,34,34,0.8);border:1.5px solid rgba(255,255,255,0.1);border-radius:8px;color:white;font-size:14px;">
            </div>
        </div>`;

    // Фильтры для машин
    if (cat === 'cars' || cat === 'all') {
        html += `
        <div class="filter-section" id="fCarSection">
            ${cat === 'all' ? '<div class="filter-label" style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Для машин</div>' : ''}
            <div class="filter-label">⚙️ Прошивка</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
                ${FIRMWARE_LIST.map(f => `
                    <button class="fchip ${advancedFilters.firmware===f?'active':''}" onclick="setFilter('firmware','${f}',this)">
                        ${FIRMWARE_NAMES[f]}
                    </button>`).join('')}
            </div>
            <div class="filter-label">🛣 Пробег</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
                ${[['0-10','До 10к'],['10-50','10–50к'],['50-100','50–100к'],['100+','100к+']].map(([v,l]) => `
                    <button class="fchip ${advancedFilters.mileage===v?'active':''}" onclick="setFilter('mileage','${v}',this)">
                        ${l}
                    </button>`).join('')}
            </div>
            <div class="filter-label">🔧 Подвеска</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
                <button class="fchip ${advancedFilters.suspension==='hydraulic'?'active':''}" onclick="setFilter('suspension','hydraulic',this)">Гидравлика</button>
                <button class="fchip ${advancedFilters.suspension==='pneumatic'?'active':''}" onclick="setFilter('suspension','pneumatic',this)">Пневма</button>
            </div>
            <div class="filter-label">✓ Наличие</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${[['tires','Шинка'],['clearance','Клиренс'],['launch','Лаунч'],['pdv','ПДВ'],['antiradar','Антирадар']].map(([k,l]) => `
                    <button class="fchip ${advancedFilters[k]==='yes'?'active':''}" onclick="toggleYesFilter('${k}',this)">
                        ${l}
                    </button>`).join('')}
            </div>
        </div>`;
    }

    // Фильтры для домов
    if (cat === 'houses' || cat === 'garages' || cat === 'business' || cat === 'all') {
        html += `
        <div class="filter-section" id="fLocationSection">
            ${cat === 'all' ? '<div class="filter-label" style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Расположение</div>' : '<div class="filter-label">📍 Расположение</div>'}
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
                ${LOCATIONS.map(loc => `
                    <button class="fchip ${advancedFilters.location===loc?'active':''}" onclick="setFilter('location','${loc}',this)">
                        ${loc}
                    </button>`).join('')}
            </div>
        </div>`;
    }

    // Улучшения для домов и гаражей
    if (cat === 'houses' || cat === 'garages') {
        html += `
        <div class="filter-section">
            <div class="filter-label">🏠 Улучшения</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${UPGRADES_LIST.map(u => `
                    <button class="fchip ${advancedFilters.upgrades===u?'active':''}" onclick="setFilter('upgrades','${u}',this)">
                        ${u}
                    </button>`).join('')}
            </div>
        </div>`;
    }

    // Бизнесы
    if (cat === 'business') {
        html += `
        <div class="filter-section">
            <div class="filter-label">🏪 Тип бизнеса</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${Object.entries(BUSINESS_TYPES).map(([v,l]) => `
                    <button class="fchip small ${advancedFilters.businessType===v?'active':''}" onclick="setFilter('businessType','${v}',this)">
                        ${l}
                    </button>`).join('')}
            </div>
        </div>`;
    }

    html += `<button onclick="applyFilters()" style="width:100%;margin-top:18px;padding:13px;background:linear-gradient(135deg,#ff1e1e,#cc0000);border:none;border-radius:10px;color:white;font-size:15px;font-weight:600;cursor:pointer;">
        Применить фильтры
    </button>`;

    panel.innerHTML = html;

    const searchPanel = document.querySelector('.search-panel');
    searchPanel.parentNode.insertBefore(panel, searchPanel.nextSibling);

    // Авто-применение при вводе цены
    ['fPriceMin','fPriceMax'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            advancedFilters.priceMin = document.getElementById('fPriceMin').value || null;
            advancedFilters.priceMax = document.getElementById('fPriceMax').value || null;
            renderAds();
        });
    });
}

window.setFilter = function(key, value, btn) {
    if (advancedFilters[key] === value) {
        delete advancedFilters[key];
        btn.classList.remove('active');
    } else {
        // Снимаем активность с других кнопок той же группы
        const parent = btn.closest('.filter-section') || btn.parentElement;
        parent.querySelectorAll(`.fchip[onclick*="setFilter('${key}'"]`).forEach(b => b.classList.remove('active'));
        advancedFilters[key] = value;
        btn.classList.add('active');
    }
    renderAds();
};

window.toggleYesFilter = function(key, btn) {
    if (advancedFilters[key] === 'yes') {
        delete advancedFilters[key];
        btn.classList.remove('active');
    } else {
        advancedFilters[key] = 'yes';
        btn.classList.add('active');
    }
    renderAds();
};

window.applyFilters = function() {
    advancedFilters.priceMin = document.getElementById('fPriceMin')?.value || null;
    advancedFilters.priceMax = document.getElementById('fPriceMax')?.value || null;
    _adsPage = 1;
    renderAds();
};

window.resetAllFilters = function() {
    advancedFilters = {};
    _adsPage = 1;
    renderFiltersPanel();
    renderAds();
};

// Обновляем панель при смене категории
const _origCatClick = document.getElementById('categoryList');
document.getElementById('categoryList')?.addEventListener('click', () => {
    if (filtersOpen) {
        setTimeout(renderFiltersPanel, 50);
    }
});

// --- СТАТИСТИКА ---
async function trackAdView(adId) {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    const statsRef = doc(db, 'adStats', adId.toString());

    try {
        const snap = await getDoc(statsRef);
        if (!snap.exists()) {
            await setDoc(statsRef, {
                adId: adId,
                totalViews: 1,
                uniqueViewers: [user.nickname],
                dailyViews: { [today]: 1 },
                favoritesCount: 0,
                favoritesUsers: [],
                dailyFavs: {},
                createdAt: new Date().toISOString()
            });
        } else {
            const data = snap.data();
            const viewers = data.uniqueViewers || [];
            // Считаем только уникальные просмотры
            if (!viewers.includes(user.nickname)) {
                const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                const daily = data.dailyViews || {};
                daily[today] = (daily[today] || 0) + 1;
                await updateDoc(statsRef, {
                    totalViews: (data.totalViews || 0) + 1,
                    uniqueViewers: [...viewers, user.nickname],
                    dailyViews: daily
                });
            }
        }
    } catch (e) {
        console.error('Track error:', e);
    }
}

// Оборачиваем openModal для трекинга просмотров
const _openModalOriginal = openModal;
window.openModal = async function(ad) {
    await trackAdView(ad.id);
    _openModalOriginal(ad);
};



// ===== ИНИЦИАЛИЗАЦИЯ =====
// (объединена в основной DOMContentLoaded выше)

// ═══════════════════════════════════════════
// 🐛 БАГ-РЕПОРТ
// ═══════════════════════════════════════════

function initBugReport() {
    const btn    = document.getElementById('bugReportBtn');
    const modal  = document.getElementById('bugReportModal');
    const close  = document.getElementById('bugModalClose');
    const cancel = document.getElementById('bugCancelBtn');
    const submit = document.getElementById('bugSubmitBtn');

    if (!btn || !modal) return;

    // Авто-выбор страницы в дропдауне по текущему URL
    const PAGE_MAP = {
        'index.html':      'Главная',
        'create-ad.html':  'Создание объявления',
        'profile.html':    'Профиль',
        'chat.html':       'Чат',
        'register.html':   'Регистрация / Вход',
        'servers.html':    'Выбор сервера',
        'stats.html':      'Статистика',
    };

    // Открытие
    btn.addEventListener('click', () => {
        // Авто-выбираем страницу
        const fileName = window.location.pathname.split('/').pop() || 'index.html';
        const humanPage = PAGE_MAP[fileName] || 'Главная';
        const pageSelect = document.getElementById('bugPage');
        if (pageSelect) {
            for (const opt of pageSelect.options) {
                if (opt.value === humanPage) { opt.selected = true; break; }
            }
        }
        modal.classList.remove('hidden');
        closeProfileMenu();
        document.getElementById('bugDescription')?.focus();
    });

    // Прикрепление фото
    const photoInput = document.getElementById('bugPhotoInput');
    const photoZone  = document.getElementById('bugPhotoZone');
    let bugPhotoBase64 = null;

    photoInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showToast('Файл слишком большой (максимум 5MB)', 'warning');
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            bugPhotoBase64 = ev.target.result;
            document.getElementById('bugPhotoPlaceholder').style.display = 'none';
            document.getElementById('bugPhotoPreview').style.display = 'block';
            document.getElementById('bugPhotoImg').src = bugPhotoBase64;
            document.getElementById('bugPhotoName').textContent = file.name;
            photoZone.style.borderColor = 'rgba(255,30,30,0.4)';
        };
        reader.readAsDataURL(file);
    });

    window.removeBugPhoto = function() {
        bugPhotoBase64 = null;
        photoInput.value = '';
        document.getElementById('bugPhotoPlaceholder').style.display = 'block';
        document.getElementById('bugPhotoPreview').style.display = 'none';
        photoZone.style.borderColor = 'rgba(255,255,255,0.12)';
    };

    // Drag & drop на зону
    photoZone?.addEventListener('dragover', e => { e.preventDefault(); photoZone.style.borderColor = 'rgba(255,30,30,0.5)'; });
    photoZone?.addEventListener('dragleave', () => { if (!bugPhotoBase64) photoZone.style.borderColor = 'rgba(255,255,255,0.12)'; });
    photoZone?.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            const dt = new DataTransfer();
            dt.items.add(file);
            photoInput.files = dt.files;
            photoInput.dispatchEvent(new Event('change'));
        }
    });

    // Закрытие
    const closeFn = () => {
        modal.classList.add('hidden');
        window.removeBugPhoto?.();
        document.getElementById('bugDescription').value = '';
    };
    close?.addEventListener('click', closeFn);
    cancel?.addEventListener('click', closeFn);
    modal.addEventListener('click', e => { if (e.target === modal) closeFn(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeFn(); });

    // Отправка
    submit?.addEventListener('click', async () => {
        const type = document.getElementById('bugType')?.value;
        const desc = document.getElementById('bugDescription')?.value.trim();
        const page = document.getElementById('bugPage')?.value;

        if (!desc) {
            showToast('Опишите проблему', 'warning');
            return;
        }

        submit.disabled = true;
        submit.textContent = '⏳ Отправляем...';

        try {
            const { db } = await import('./firebase-config.js');
            const { doc, getDoc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

            const ref = doc(db, 'data', 'reports');
            const snap = await getDoc(ref);
            const reports = snap.exists() ? snap.data().items || [] : [];

            reports.unshift({
                id: Date.now(),
                type,
                description: desc,
                page,
                photo: bugPhotoBase64 || null,
                author: currentUser?.nickname || 'anonymous',
                server: currentUser?.server || null,
                ua: navigator.userAgent.substring(0, 150),
                createdAt: new Date().toISOString(),
                status: 'new'
            });

            await setDoc(ref, { items: reports });

            showToast('Спасибо! Баг-репорт отправлен 🙌', 'success');
            closeFn();

        } catch (e) {
            console.error('Ошибка отправки баг-репорта:', e);
            showToast('Ошибка отправки. Попробуй снова', 'error');
        } finally {
            submit.disabled = false;
            submit.textContent = '📤 Отправить';
        }
    });
}
