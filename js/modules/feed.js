// ===== FEED — лента объявлений: фильтры, поиск, сортировка, карточки =====
import { db } from '../firebase-config.js';
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast, escapeHtml, timeAgo } from '../utils.js';
import { getAllAds } from '../api.js';
import { isFavorite } from './favorites.js';
import { CATEGORY_COLORS, CATEGORY_BADGE_NAMES, CATEGORY_ICONS } from '../categories-data.js';
import { renderPlateSVG } from '../plate-render.js';
import { PLATE_FORMATS } from '../plates-data.js';
import { getMyAds, getAds } from './my-ads.js';
import { getCurrentCategory, setCurrentCategory } from './state.js';

let currentSearch = '';

let currentSort = 'newest';

document.getElementById('categoryList')?.addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
        document.querySelectorAll('#categoryList li').forEach(li => li.classList.remove('active'));
        e.target.classList.add('active');
        setCurrentCategory(e.target.dataset.category);
        _adsPage = 1;
        
        if (getCurrentCategory() !== 'myads' && getCurrentCategory() !== 'favorites') {
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

export function filterAndSortAds(ads) {
    let filtered = ads;

    if (getCurrentCategory() !== 'all' && getCurrentCategory() !== 'myads' && getCurrentCategory() !== 'favorites') {
        filtered = ads.filter(ad => ad.category === getCurrentCategory());
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
    if (advancedFilters.mileage) filtered = filtered.filter(ad => Number(ad.mileage) > 0 && Number(ad.mileage) <= Number(advancedFilters.mileage));
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
    if (advancedFilters.plateCountry) filtered = filtered.filter(ad => ad.plateCountry === advancedFilters.plateCountry);

    const sorted = [...filtered];
    switch (currentSort) {
        case 'newest': sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
        case 'oldest': sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)); break;
        case 'price_asc': sorted.sort((a, b) => a.price - b.price); break;
        case 'price_desc': sorted.sort((a, b) => b.price - a.price); break;
    }
    return sorted;
}

// Единый превью-блок в карточке — раньше высота карточки "гуляла" в
// зависимости от категории: у "Номеров" была картинка знака, у всех
// остальных категорий никакого превью не было вообще (только текст),
// из-за чего карточки в одном ряду ленты были разной высоты. Теперь у
// всех категорий один и тот же блок фиксированной высоты:
// 1. Номера — SVG знака (как раньше)
// 2. Есть фото — первое фото объявления
// 3. Фото нет — иконка категории на градиенте её цвета (не пустота)
function renderCardPreview(ad) {
    if (ad.category === 'plates' && ad.plateCountry) {
        return `<div class="item-card-preview plate-card-preview">${renderPlateSVG(ad.plateCountry, ad.plateValues || {})}</div>`;
    }
    if (ad.photos?.length) {
        return `<div class="item-card-preview"><img src="${ad.photos[0]}" alt="" loading="lazy"></div>`;
    }
    const color = CATEGORY_COLORS[ad.category] || '#888';
    const icon = CATEGORY_ICONS[ad.category] || 'package';
    return `<div class="item-card-preview item-card-preview-empty" style="background:linear-gradient(135deg, ${color}22, ${color}08);">
        <i data-lucide="${icon}" width="40" height="40" style="color:${color};opacity:0.55;"></i>
    </div>`;
}

export function createAdCard(ad) {
    const priceFormatted = ad.price.toLocaleString('ru-RU') + ' ₽';
    const date = new Date(ad.createdAt).toLocaleDateString('ru-RU');
    
    const categoryColors = CATEGORY_COLORS;
    const categoryNames = CATEGORY_BADGE_NAMES;
    
    const catColor = categoryColors[ad.category] || '#888';
    const catName = escapeHtml(categoryNames[ad.category]) || escapeHtml(String(ad.category));
    const isFav = isFavorite(ad.id);
    const photoBadge = ad.photos?.length ? `<span class="photo-badge"><i data-lucide="camera" width="12" height="12"></i> ${ad.photos.length}</span>` : '';
    const plateSvg = renderCardPreview(ad);
    
    return `
        <div class="listing-card" data-id="${ad.id}">
            <div class="item-header">
                <span class="item-category" style="background: ${catColor}20; color: ${catColor}; border: 1px solid ${catColor}40;">
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
            ${plateSvg}
            <h3 class="item-title">${escapeHtml(ad.title)}</h3>
            <p class="item-price">${priceFormatted}</p>
            <p class="item-desc">${escapeHtml(ad.description || 'Нет описания')}</p>
            <div class="item-footer">
                <span class="item-author seller-link" onclick="event.stopPropagation(); window.location.href='profile.html?user=${encodeURIComponent(ad.author)}'">${escapeHtml(ad.author)}</span>
               <span class="ad-date" title="${new Date(ad.createdAt).toLocaleString('ru-RU')}">${timeAgo(ad.createdAt)}</span>
            </div>
            <p class="ad-hint">Нажмите для подробностей</p>
        </div>
    `;
}

export function createMyAdCard(ad) {
    const priceFormatted = ad.price.toLocaleString('ru-RU') + ' ₽';
    const date = new Date(ad.createdAt).toLocaleDateString('ru-RU');
    const updated = ad.updatedAt ? ' (ред.)' : '';
    
    const categoryColors = CATEGORY_COLORS;
    const categoryNames = CATEGORY_BADGE_NAMES;
    
    const catColor = categoryColors[ad.category] || '#888';
    const catName = categoryNames[ad.category] || ad.category;
    const photoBadge = ad.photos?.length ? `<span class="photo-badge"><i data-lucide="camera" width="12" height="12"></i> ${ad.photos.length}</span>` : '';
    const plateSvg = renderCardPreview(ad);
    
    return `
        <div class="listing-card my-listing-card" data-id="${ad.id}">
            <div class="item-header">
                <span class="item-category" style="background: ${catColor}20; color: ${catColor}; border: 1px solid ${catColor}40;">
                    ${catName}
                </span>
                ${photoBadge}
            </div>
            ${plateSvg}
            <h3 class="item-title">${escapeHtml(ad.title)}</h3>
            <p class="item-price">${priceFormatted}</p>
            <p class="item-desc">${escapeHtml(ad.description || 'Нет описания')}</p>
            <div class="item-footer">
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

let _adsPage = 1;

let _adsTotalFiltered = 0;

export async function renderAds() {
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
                <div style="margin-bottom:16px;color:#555;"><i data-lucide="frown" width="48" height="48"></i></div>
                <p style="font-size:18px;color:#ff1e1e;margin-bottom:8px;">Не удалось загрузить объявления</p>
                <p style="font-size:14px;color:#888;margin-bottom:20px;">Проверьте интернет-соединение и попробуйте снова</p>
                <button onclick="renderAds()" style="padding:10px 24px;background:linear-gradient(135deg,#ff1e1e,#cc0000);
                    color:white;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;">
                    <i data-lucide="refresh-cw" width="14" height="14"></i> Обновить
                </button>
            </div>`;
        if (window.lucide) lucide.createIcons();
        return;
    }

    const ads = filterAndSortAds(serverAds);
    _adsTotalFiltered = ads.length;
    const user = JSON.parse(localStorage.getItem('currentUser'));

    if (ads.length === 0) {
        adsGrid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="clipboard-list" width="40" height="40"></i></div>
                <p class="empty-state-title">На сервере <span style="color:#ff1e1e">${escapeHtml(user?.server || '')}</span> пока нет объявлений</p>
                <p class="empty-state-hint">Будьте первым — создайте объявление и найдите покупателя!</p>
                <a href="create-ad.html" class="empty-state-btn">+ Создать объявление</a>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    // Показываем только первые _adsPage * ADS_PER_PAGE объявлений
    const visibleAds = ads.slice(0, _adsPage * ADS_PER_PAGE);
    const hasMore = visibleAds.length < ads.length;

    adsGrid.innerHTML = visibleAds.map(ad => createAdCard(ad)).join('');
    if (window.lucide) lucide.createIcons();

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

window.loadMoreAds = function() {
    _adsPage++;
    renderAds();
    // Скролл к новым карточкам — к кнопке «Показать ещё» которая была
    const btn = document.getElementById('loadMoreBtn');
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

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

export function initAdvancedSearch() {
    const searchPanel = document.querySelector('.search-panel');
    if (!searchPanel || document.getElementById('advancedSearchBtn')) return;

    const btn = document.createElement('button');
    btn.id = 'advancedSearchBtn';
    btn.innerHTML = '<i data-lucide="search" width="15" height="15"></i> Фильтры';
    btn.style.cssText = 'padding: 12px 20px; background: rgba(255,30,30,0.1); border: 2px solid rgba(255,30,30,0.3); border-radius: 8px; color: #ff1e1e; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s;';
    btn.onclick = toggleFiltersPanel;
    searchPanel.appendChild(btn);
}

export function toggleFiltersPanel() {
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

export function renderFiltersPanel() {
    const existing = document.getElementById('advFilters');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'advFilters';
    panel.style.cssText = 'background: rgba(13,13,13,0.98); border: 1px solid rgba(255,30,30,0.25); border-radius: 14px; padding: 20px; margin-top: 10px;';

    const cat = getCurrentCategory();

    // Всегда: цена
    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
            <span style="color:#ff1e1e;font-weight:600;font-size:15px;">Фильтры</span>
            <button onclick="resetAllFilters()" style="background:none;border:1px solid rgba(255,255,255,0.15);color:#888;padding:5px 12px;border-radius:8px;font-size:12px;cursor:pointer;">Сбросить все</button>
        </div>
        <div class="filter-section">
            <div class="filter-label"><i data-lucide="banknote" width="14" height="14"></i> Цена</div>
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
            <div class="filter-label"><i data-lucide="settings" width="14" height="14"></i> Прошивка</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
                ${FIRMWARE_LIST.map(f => `
                    <button class="fchip ${advancedFilters.firmware===f?'active':''}" onclick="setFilter('firmware','${f}',this)">
                        ${FIRMWARE_NAMES[f]}
                    </button>`).join('')}
            </div>
            <div class="filter-label"><i data-lucide="milestone" width="14" height="14"></i> Пробег, до км</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;align-items:center;">
                ${[100,250,500,1000].map(v => `
                    <button class="fchip ${Number(advancedFilters.mileage)===v?'active':''}" onclick="setMileageFilter(${v})">
                        ${v}
                    </button>`).join('')}
                <input type="number" id="mileageFilterCustom" placeholder="Своё" min="0"
                    value="${advancedFilters.mileage && ![100,250,500,1000].includes(Number(advancedFilters.mileage)) ? advancedFilters.mileage : ''}"
                    style="width:70px;padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;font-size:13px;"
                    onchange="setMileageFilter(this.value)">
            </div>
            <div class="filter-label"><i data-lucide="wrench" width="14" height="14"></i> Подвеска</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
                <button class="fchip ${advancedFilters.suspension==='hydraulic'?'active':''}" onclick="setFilter('suspension','hydraulic',this)">Гидравлика</button>
                <button class="fchip ${advancedFilters.suspension==='pneumatic'?'active':''}" onclick="setFilter('suspension','pneumatic',this)">Пневма</button>
            </div>
            <div class="filter-label"><i data-lucide="check" width="14" height="14"></i> Наличие</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${[['tires','Шинка'],['clearance','Клиренс'],['launch','Лаунч'],['pdv','ПДВ'],['antiradar','Антирадар']].map(([k,l]) => `
                    <button class="fchip ${advancedFilters[k]==='yes'?'active':''}" onclick="toggleYesFilter('${k}',this)">
                        ${l}
                    </button>`).join('')}
            </div>
        </div>`;
    }

    // Фильтр по стране номерного знака
    if (cat === 'plates' || cat === 'all') {
        html += `
        <div class="filter-section" id="fPlateSection">
            ${cat === 'all' ? '<div class="filter-label" style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Номерные знаки</div>' : '<div class="filter-label"><i data-lucide="rectangle-horizontal" width="14" height="14"></i> Страна номера</div>'}
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${Object.entries(PLATE_FORMATS).map(([code, fmt]) => `
                    <button class="fchip ${advancedFilters.plateCountry===code?'active':''}" onclick="setFilter('plateCountry','${code}',this)">
                        ${fmt.flagEmoji} ${fmt.label}
                    </button>`).join('')}
            </div>
        </div>`;
    }

    // Фильтры для домов
    if (cat === 'houses' || cat === 'garages' || cat === 'business' || cat === 'all') {
        html += `
        <div class="filter-section" id="fLocationSection">
            ${cat === 'all' ? '<div class="filter-label" style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Расположение</div>' : '<div class="filter-label"><i data-lucide="map-pin" width="14" height="14"></i> Расположение</div>'}
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
            <div class="filter-label"><i data-lucide="home" width="14" height="14"></i> Улучшения</div>
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
            <div class="filter-label"><i data-lucide="store" width="14" height="14"></i> Тип бизнеса</div>
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
    if (window.lucide) lucide.createIcons();

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

window.setMileageFilter = function(value) {
    const num = Number(value);
    if (!num || num <= 0 || Number(advancedFilters.mileage) === num) {
        delete advancedFilters.mileage;
    } else {
        advancedFilters.mileage = num;
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
    // Закрываем панель фильтров
    const panel = document.getElementById('advFilters');
    if (panel) { panel.remove(); filtersOpen = false; }
    const btn = document.getElementById('advancedSearchBtn');
    if (btn) btn.style.background = 'rgba(255,30,30,0.1)';
};

window.resetAllFilters = function() {
    advancedFilters = {};
    _adsPage = 1;
    renderFiltersPanel();
    renderAds();
};

const _origCatClick = document.getElementById('categoryList');

document.getElementById('categoryList')?.addEventListener('click', () => {
    if (filtersOpen) {
        setTimeout(renderFiltersPanel, 50);
    }
});

export async function trackAdView(adId) {
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
                const { updateDoc, increment, arrayUnion, FieldPath } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
                // Атомарно: increment/arrayUnion вместо "прочитал → посчитал →
                // записал весь объект обратно". Так два зрителя одновременно
                // не затирают друг друга и не упираются в правило "счётчик
                // просмотров не может уменьшиться" устаревшим значением.
                await updateDoc(
                    statsRef,
                    'totalViews', increment(1),
                    'uniqueViewers', arrayUnion(user.nickname),
                    new FieldPath('dailyViews', today), increment(1)
                );
            }
        }
    } catch (e) {
        console.error('Track error:', e);
    }
}

window.renderAds = renderAds; // для onclick="renderAds()" в шаблоне (кнопка сброса фильтров)