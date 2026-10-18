// ===== MY-ADS — управление своими объявлениями: получение, удаление, редактирование =====
import { db } from '../firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast, escapeHtml, compressImage } from '../utils.js';
import { getAllAds, updateAd, deleteAd as deleteAdFromAPI } from '../api.js';
import { getFavorites, saveFavorites, updateFavCount, toggleFavorite } from './favorites.js';
import { getCurrentCategory, setCurrentCategory } from './state.js';
import { showConfirm } from './main.js';
import { closeModal } from './ad-modal.js';
import { createAdCard, createMyAdCard, renderAds } from './feed.js';

export async function getAds() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user?.server) return [];
    const allAds = await getAllAds();
    return allAds.filter(ad => ad.server === user.server);
}

export async function getMyAds() {
    const user = JSON.parse(localStorage.getItem('currentUser'));
    if (!user) return [];
    const allAds = await getAllAds();
    return allAds.filter(ad => ad.author === user.nickname && ad.server === user.server);
}

export function updateMyAdsCount() {
    getMyAds().then(myAds => {
        const count = myAds.length;
        const badge = document.getElementById('myAdsCount');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    });
}

export function deleteAd(adId) {
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
        closeModal();
        // Обновляем список: если был в "Мои объявления" — показываем его, иначе общую выдачу
        if (getCurrentCategory() === 'myads') {
            showMyAds();
        } else {
            await renderAds();
        }
    });
}

export async function editAd(adId) {
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
        const mileagePresets = ['100', '250', '500', '1000'];
        const mileageIsCustom = ad.mileage && !mileagePresets.includes(String(ad.mileage));
        extraFields = `
        <div class="car-row-2">
            <div class="form-group">
                <label>Пробег, км</label>
                <div class="toggle-group">
                    ${mileagePresets.map(v => `<button type="button" class="toggle-btn small single ${String(ad.mileage)===v?'active':''}" data-group="edit_mileage" data-value="${v}">${v}</button>`).join('')}
                    <button type="button" class="toggle-btn small single ${mileageIsCustom?'active':''}" data-group="edit_mileage" data-value="custom">Другое</button>
                </div>
                <input type="number" id="edit_mileageCustom" placeholder="Свой пробег, км" min="0"
                    class="${mileageIsCustom?'':'hidden'}" value="${mileageIsCustom?escapeHtml(String(ad.mileage)):''}"
                    style="margin-top:8px;width:100%;">
                <input type="hidden" id="edit_mileage" value="${escapeHtml(ad.mileage||'')}">
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
                ${toggleBtn('lights','underglow','<i data-lucide="lightbulb" width="16" height="16"></i> Подсветка', ug.has)}
                ${toggleBtn('lights','highbeam','<i data-lucide="sun" width="16" height="16"></i> Дальний свет', l.highBeam)}
                ${toggleBtn('lights','strobe','<i data-lucide="zap" width="16" height="16"></i> Стробоскопы', l.strobe?.has)}
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
                ${toggleBtn('edit_suspension','hydraulic','<i data-lucide="wrench" width="16" height="16"></i> Гидравлика', susp.includes('hydraulic'))}
                ${toggleBtn('edit_suspension','pneumatic','<i data-lucide="wind" width="16" height="16"></i> Пневма', susp.includes('pneumatic'))}
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
                        <i data-lucide="camera" width="16" height="16"></i> <span id="editPhotoLabel">Добавить фото (0/5)</span>
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
    if (window.lucide) lucide.createIcons();
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
            if (_editPhotos.length + files.length > 5) { showToast('Максимум 5 фотографий!', 'warning'); return; }
            files.forEach(file => {
                if (!file.type.startsWith('image/')) return;
                if (file.size > 5 * 1024 * 1024) { showToast('Файл слишком большой (макс. 5MB)', 'warning'); return; }
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    // Раньше тут была своя копия логики сжатия (canvas +
                    // toDataURL), хотя compressImage с тем же самым уже
                    // импортирован из utils.js — импорт висел неиспользуемым.
                    _editPhotos.push(await compressImage(ev.target.result, 800, 0.7));
                    _renderEditPhotos();
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

    modal.querySelectorAll('.toggle-btn[data-group="edit_mileage"]').forEach(btn => {
        btn.onclick = function() {
            modal.querySelectorAll('.toggle-btn[data-group="edit_mileage"]').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            const customInput = document.getElementById('edit_mileageCustom');
            if (this.dataset.value === 'custom') {
                customInput.classList.remove('hidden');
                customInput.focus();
                document.getElementById('edit_mileage').value = customInput.value || '';
            } else {
                customInput.classList.add('hidden');
                document.getElementById('edit_mileage').value = this.dataset.value;
            }
        };
    });
    document.getElementById('edit_mileageCustom')?.addEventListener('input', function() {
        document.getElementById('edit_mileage').value = this.value;
    });

    // Подвеска — независимые кнопки (можно выбрать обе или ни одной),
    // раньше висели на глобальном toggleCarBtn из create-ad.js, который
    // на index.html вообще не подключён (эта модалка открывается со
    // страницы объявлений, а не со страницы создания) — клик по кнопке
    // ничего не делал. Переопределяем так же, как остальные группы выше.
    modal.querySelectorAll('.toggle-btn[data-group="edit_suspension"]').forEach(btn => {
        btn.onclick = function() {
            this.classList.toggle('active');
        };
    });
}

export function closeEditModal() {
    const modal = document.querySelector('.edit-modal-overlay');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }
}

export async function saveEditAd(adId) {
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

export async function showMyAds() {
    setCurrentCategory('myads');
    const myAds = await getMyAds();
    const adsGrid = document.getElementById('adsGrid');
    
    document.querySelectorAll('#categoryList li').forEach(li => li.classList.remove('active'));
    
    if (myAds.length === 0) {
        adsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: #888;">
                <div style="margin-bottom: 10px; display:flex; justify-content:center;"><i data-lucide="inbox" width="28" height="28"></i></div>
                <p style="font-size: 18px; margin-bottom: 10px;">У вас нет объявлений</p>
                <p style="font-size: 14px;">Нажмите + чтобы создать первое</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }
    
    adsGrid.innerHTML = myAds.map(ad => createMyAdCard(ad)).join('');
    if (window.lucide) lucide.createIcons();
    
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

export async function showFavorites() {
    setCurrentCategory('favorites');
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
                <div class="empty-state-icon" style="display:flex; justify-content:center;"><i data-lucide="heart" width="32" height="32"></i></div>
                <p class="empty-state-title">Избранное пусто</p>
                <p class="empty-state-hint">Нажми <span class="empty-state-accent" style="display:inline-flex; vertical-align:middle;"><i data-lucide="heart" width="14" height="14"></i></span> на карточке объявления — оно появится здесь</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }
    
    adsGrid.innerHTML = favAds.map(ad => createAdCard(ad)).join('');
    if (window.lucide) lucide.createIcons();
    document.querySelectorAll('.listing-card').forEach(card => {
        card.addEventListener('click', async () => {
            const adId = parseInt(card.dataset.id);
            const ads = await getAllAds();
            const ad = ads.find(a => a.id === adId);
            if (ad) window.openModal(ad);
        });
    });
}

window.editAd = editAd;

window.closeEditModal = closeEditModal;

window.saveEditAd = saveEditAd;

window.deleteAd = deleteAd;