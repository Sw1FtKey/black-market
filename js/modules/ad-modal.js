// ===== AD-MODAL — модалка просмотра объявления: галерея, продавец, отзывы, жалобы =====
import { showToast, escapeHtml, formatPrice, timeAgo, copyToClipboard } from '../utils.js';
import { getAllAds, getUsers, getReviews, saveReview } from '../api.js';
import { renderUserBadges } from './sidebar.js';
import { trackAdView } from './feed.js';
import { CATEGORY_BADGE_NAMES } from '../categories-data.js';
import { renderPlateSVG } from '../plate-render.js';

let currentPhotoIndex = 0;

let currentAdPhotos = [];

export async function openModal(ad) {
    await trackAdView(ad.id);
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
    if (window.lucide) lucide.createIcons();
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
        if (window.lucide) lucide.createIcons();
    } catch(e) {
        console.error('renderSellerBlock error:', e);
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

export function closeModal() {
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
    
    const categoryNames = CATEGORY_BADGE_NAMES;
    
    let galleryHtml = '';
    if (ad.category === 'plates' && ad.plateCountry) {
        galleryHtml = `
            <div class="modal-gallery" style="display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(255,255,255,0.02);">
                <div style="width:100%;max-width:360px;">${renderPlateSVG(ad.plateCountry, ad.plateValues || {})}</div>
            </div>
        `;
    } else if (ad.photos?.length > 0) {
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
                <i data-lucide="message-circle" width="16" height="16"></i> Написать продавцу
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
            <button class="report-btn" onclick="event.stopPropagation(); openReportModal(${ad.id})" title="Пожаловаться"><i data-lucide="flag" width="15" height="15"></i></button>
        </div>
        ${galleryHtml}
        <h2 class="modal-title">${escapeHtml(ad.title)}</h2>
        <p class="modal-price">${priceFormatted}</p>
        ${ad.description ? `<div class="modal-description"><h4>Описание</h4><p>${escapeHtml(ad.description)}</p></div>` : ''}
        ${detailsHtml}
        ${chatButtonHtml}
        <div class="modal-footer">
            <span style="color:#555;">${date}</span>
        </div>
    `;
}

function getFirmwareName(value) {
    const names = { stock: 'Сток', drift: 'Дрифт', 'comfort+': 'Комфорт+', sport: 'Спорт', 'sport+': 'Спорт+' };
    return escapeHtml(names[value] || String(value));
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
            <label for="star${s}" style="font-size:28px;cursor:pointer;color:${s <= rating ? '#ffd700' : '#444'};transition:color 0.15s;" 
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
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const isOwn = ad.author === currentUser?.nickname;

    // Грузим отзывы и пользователей параллельно
    const [reviews, allUsers] = await Promise.all([
        getReviews(ad.author).catch(() => []),
        getUsers().catch(() => [])
    ]);

    const rating = calcRating(reviews);
    const ratingHtml = rating
        ? `<span style="color:#ffd700;">${renderStars(rating)}</span> <span style="color:white;font-weight:600;">${rating}</span> <span style="color:#888;font-size:13px;">(${reviews.length})</span>`
        : `<span style="color:#555;font-size:13px;">Нет отзывов</span>`;

    // Бейджи продавца
    let sellerBadgesHtml = '';
    try {
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
            <i data-lucide="pen-line" width="14" height="14"></i> Оставить отзыв
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
                    <div style="font-weight:600;margin-bottom:4px;"><a href="profile.html?user=${encodeURIComponent(ad.author)}" style="color:white;text-decoration:none;display:inline-flex;align-items:center;gap:5px;" onmouseover="this.style.color='#ff6b6b'" onmouseout="this.style.color='white'"><i data-lucide="user" width="14" height="14"></i> ${escapeHtml(ad.author)}</a></div>
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
    if (window.lucide) lucide.createIcons();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
};

window.submitReview = async function(nickname) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) return;
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
    if (window.lucide) lucide.createIcons();
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
        <span style="font-size:13px;font-weight:600;color:${isYes ? '#66bb6a' : '#ef5350'};">${isYes ? '<i data-lucide="check" width="13" height="13"></i> Есть' : '<i data-lucide="x" width="13" height="13"></i> Нет'}</span>
    </div>`;
}

function section(title, content) {
    return `<div style="margin:16px 0;">
        <div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">${title}</div>
        ${content}
    </div>`;
}

function renderCarCard(ad) {
    const MILEAGE = {'0-10':'До 10 000 км','10-50':'10 — 50 тыс. км','50-100':'50 — 100 тыс. км','100+':'Более 100 000 км'}; // старые объявления (бакеты)
    const FIRMWARE = {stock:'Сток', drift:'Дрифт', 'comfort+':'Комфорт+', sport:'Спорт', 'sport+':'Спорт+'};
    const FIRMWARE_COLOR = {stock:'gray', drift:'blue', 'comfort+':'green', sport:'amber', 'sport+':'red'};
    const SUSPEND = {hydraulic:'<i data-lucide="wrench" width="13" height="13"></i> Гидравлика', pneumatic:'<i data-lucide="wind" width="13" height="13"></i> Пневма'};

    let html = '<div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:16px;margin-top:4px;">';

    // Строка 1: пробег + прошивка
    let row1 = '';
    if (ad.mileage) {
        const mileageLabel = MILEAGE[ad.mileage] || `${ad.mileage} км`;
        row1 += badge('<i data-lucide="milestone" width="13" height="13"></i> ' + mileageLabel, 'gray');
    }
    if (ad.firmware) row1 += badge('<i data-lucide="settings" width="13" height="13"></i> ' + (FIRMWARE[ad.firmware] || ad.firmware), FIRMWARE_COLOR[ad.firmware] || 'gray');
    if (row1) html += section('Основное', `<div style="display:flex;flex-wrap:wrap;gap:8px;">${row1}</div>`);

    // Строка 2: свет
    let lights = '';
    if (ad.lights?.underglow?.has) {
        const posNames = {bottom:'нижняя', left:'левая', right:'правая'};
        const pos = (ad.lights.underglow.positions||[]).map(p => posNames[p]||p).join(', ');
        lights += badge('<i data-lucide="lightbulb" width="13" height="13"></i> Подсветка' + (pos ? ` (${pos})` : ''), 'amber');
    }
    if (ad.lights?.highBeam) lights += badge('<i data-lucide="sun" width="13" height="13"></i> Дальний свет', 'amber');
    if (ad.lights?.strobe?.has) lights += badge('<i data-lucide="alert-circle" width="13" height="13"></i> Стробы' + (ad.lights.strobe.type === 'donate' ? ' (донат)' : ' (обычные)'), 'purple');
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
    if (ad.location) items += badge('<i data-lucide="map-pin" width="13" height="13"></i> ' + escapeHtml(ad.location), 'blue');
    if (ad.upgrades) items += badge('<i data-lucide="home" width="13" height="13"></i> Дом ' + escapeHtml(ad.upgrades), ad.upgrades === '5/5' ? 'green' : 'amber');
    if (ad.basement) items += badge('<i data-lucide="box" width="13" height="13"></i> Подвал ' + escapeHtml(ad.basement), ad.basement === '5/5' ? 'green' : 'amber');
    if (items) html += `<div style="display:flex;flex-wrap:wrap;gap:8px;">${items}</div>`;
    html += '</div>';
    return html;
}

function renderGarageCard(ad) {
    let html = '<div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:16px;margin-top:4px;">';
    let items = '';
    if (ad.location) items += badge('<i data-lucide="map-pin" width="13" height="13"></i> ' + escapeHtml(ad.location), 'blue');
    if (ad.upgrades) items += badge('<i data-lucide="wrench" width="13" height="13"></i> Улучшения ' + escapeHtml(ad.upgrades), ad.upgrades === '5/5' ? 'green' : 'amber');
    if (items) html += `<div style="display:flex;flex-wrap:wrap;gap:8px;">${items}</div>`;
    html += '</div>';
    return html;
}

function renderBusinessCard(ad) {
    let html = '<div style="border-top:1px solid rgba(255,255,255,0.07);padding-top:16px;margin-top:4px;">';
    let items = '';
    if (ad.businessCategoryName) items += badge('<i data-lucide="store" width="13" height="13"></i> ' + escapeHtml(ad.businessCategoryName), 'purple');
    if (ad.businessLocation) items += badge('<i data-lucide="map-pin" width="13" height="13"></i> ' + escapeHtml(ad.businessLocation), 'blue');
    if (ad.businessIncome) {
        const from = ad.businessIncome.from ? ad.businessIncome.from.toLocaleString('ru-RU') + '₽' : '';
        const to = ad.businessIncome.to ? ad.businessIncome.to.toLocaleString('ru-RU') + '₽' : '';
        const income = from && to ? `${from} — ${to}` : from ? `от ${from}` : `до ${to}`;
        if (income) items += badge('<i data-lucide="banknote" width="13" height="13"></i> ' + income + '/день', 'green');
    }
    if (items) html += `<div style="display:flex;flex-wrap:wrap;gap:8px;">${items}</div>`;
    html += '</div>';
    return html;
}

function renderLights(lights) { return ''; }

function renderSuspension(suspension) { return ''; }

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
    if (window.lucide) lucide.createIcons();
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
            ${ad.category === 'plates' && ad.plateCountry
                ? `<div style="width:60px;height:${Math.round(60*120/520)}px;flex-shrink:0;border-radius:6px;overflow:hidden;align-self:center;">${renderPlateSVG(ad.plateCountry, ad.plateValues || {})}</div>`
                : ad.photos?.[0]
                ? `<img src="${ad.photos[0]}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;flex-shrink:0;">`
                : `<div style="width:60px;height:60px;background:rgba(255,255,255,0.06);border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#555;"><i data-lucide="image" width="22" height="22"></i></div>`
            }
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;color:white;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(ad.title)}</div>
                <div style="color:#ff1e1e;font-weight:700;font-size:15px;">${formatPrice(ad.price)}</div>
                <div style="color:#555;font-size:12px;margin-top:2px;">${timeAgo(ad.createdAt)}</div>
            </div>
            <div style="color:#444;font-size:20px;">›</div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
};

// window.openModal нужен для вызовов через onclick="..." в динамическом HTML
window.openModal = openModal;