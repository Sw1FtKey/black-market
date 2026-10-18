// ===== Проверка авторизации =====
const currentUser = JSON.parse(localStorage.getItem('currentUser'));
if (!currentUser) {
    window.location.href = 'register.html';
}

// ===== Импорт Firebase =====
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast } from './utils.js';
import { getAllAds, saveAd, checkBanStatus } from './api.js';
import { flipPlateToCountry, isPlateComplete } from './plate-render.js';
import { BUSINESSES, BUSINESS_TYPE_NAMES, businessSearchText, businessPhotoCandidates } from './business-data.js';

// Ждём восстановления Firebase Auth сессии перед тем как давать публиковать
let _authReady = false;
onAuthStateChanged(auth, (user) => {
    _authReady = !!user;
});

// ===== TOAST =====

// getAllAds, saveAd — импортированы из api.js

// ===== Элементы формы =====
const categorySelect = document.getElementById('adCategory');
const carFields = document.getElementById('carFields');
const houseFields = document.getElementById('houseFields');
const garageFields = document.getElementById('garageFields');
const businessFields = document.getElementById('businessFields');
const plateFields = document.getElementById('plateFields');
const form = document.getElementById('createAdForm');

// ===== СОСТОЯНИЕ НОМЕРНОГО ЗНАКА =====
let plateCountry = null;
let plateValues = {};

// ===== МАССИВ ДЛЯ ХРАНЕНИЯ ФОТО =====
let selectedPhotos = [];

// ===== СТОКОВЫЕ ФОТО-ЗАГЛУШКИ (по категориям) =====
// Если у категории есть готовая картинка (сама картинка кладётся сюда
// вручную, этот код только предлагает её) — предлагаем пользователю
// использовать её вместо загрузки своего фото. Он может согласиться
// или оставить объявление без фото вообще (жёсткого требования на фото
// нет). Пока по одной картинке на категорию — легко расширить до
// массива вариантов на категорию позже (просто заменить строку на
// массив и добавить выбор нужного варианта).
const STOCK_PHOTOS = {
    houses:      'img/stock/houses.jpg',
    garages:     'img/stock/garages.jpg',
    cars:        'img/stock/cars.jpg',
    business:    'img/stock/business.jpg',
    accessories: 'img/stock/accessories.jpg',
    skins:       'img/stock/skins.jpg',
    other:       'img/stock/other.jpg'
    // 'plates' намеренно нет — у номеров вместо фото свой визуальный
    // рендер знака (plate-render.js), блок фото у них скрыт целиком.
};
let useStockPhoto = false;    // пользователь нажал "Использовать"
let stockPhotoDismissed = false; // пользователь нажал "Оставить без фото" — не показывать снова для этой категории

// ===== СОСТОЯНИЕ КНОПОК =====
const carState = {
    lights: new Set(),
    underglow: new Set(),
    suspension: new Set(),
    strobeType: null,
    yesNo: {
        tires: '',
        clearance: '',
        launch: '',
        pdv: '',
        antiradar: ''
    }
};

// ===== Показ/скрытие дополнительных полей =====
categorySelect.addEventListener('change', () => {
    const category = categorySelect.value;
    
    carFields.classList.add('hidden');
    houseFields.classList.add('hidden');
    garageFields.classList.add('hidden');
    businessFields.classList.add('hidden');
    plateFields.classList.add('hidden');
    
    if (category === 'cars') {
        carFields.classList.remove('hidden');
    } else if (category === 'houses') {
        houseFields.classList.remove('hidden');
    } else if (category === 'garages') {
        garageFields.classList.remove('hidden');
    } else if (category === 'business') {
        businessFields.classList.remove('hidden');
    } else if (category === 'plates') {
        plateFields.classList.remove('hidden');
    }

    if (category !== 'plates') {
        // Сбрасываем состояние номера при уходе с категории
        plateCountry = null;
        plateValues = {};
        document.getElementById('plateInteractiveGroup')?.classList.add('hidden');
        document.querySelectorAll('[data-plate-country]').forEach(b => b.classList.remove('active'));
    }
});

// ===== НОМЕРНОЙ ЗНАК: выбор страны и ввод символов прямо на знаке =====
window.selectPlateCountry = function(country, btn) {
    plateCountry = country;
    plateValues = {};

    document.querySelectorAll('[data-plate-country]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const group = document.getElementById('plateInteractiveGroup');
    group.classList.remove('hidden');

    flipPlateToCountry('plateInteractiveContainer', country, {}, (values) => {
        plateValues = values;
        updatePlateTitle();
    });
};

function updatePlateTitle() {
    const titleInput = document.getElementById('adTitle');
    if (!titleInput || !plateCountry) return;
    const parts = Object.values(plateValues).filter(Boolean);
    titleInput.value = parts.length
        ? `Номер ${parts.join(' ')} (${plateCountry.toUpperCase()})`
        : `Номерной знак (${plateCountry.toUpperCase()})`;
}

// ===== УНИВЕРСАЛЬНЫЙ TOGGLE ДЛЯ КНОПОК =====
window.toggleCarBtn = function(btn) {
    const group = btn.dataset.group;
    const value = btn.dataset.value;
    
    if (group === 'lights') {
        if (carState.lights.has(value)) {
            carState.lights.delete(value);
            btn.classList.remove('active');
        } else {
            carState.lights.add(value);
            btn.classList.add('active');
        }
        
        // Показать/скрыть подопции
        if (value === 'underglow') {
            document.getElementById('underglowOptions').classList.toggle('hidden', !carState.lights.has('underglow'));
        }
        if (value === 'strobe') {
            document.getElementById('strobeOptions').classList.toggle('hidden', !carState.lights.has('strobe'));
        }
    }
    
    else if (group === 'underglow') {
        if (carState.underglow.has(value)) {
            carState.underglow.delete(value);
            btn.classList.remove('active');
        } else {
            carState.underglow.add(value);
            btn.classList.add('active');
        }
    }
    
    else if (group === 'suspension') {
        if (carState.suspension.has(value)) {
            carState.suspension.delete(value);
            btn.classList.remove('active');
        } else {
            carState.suspension.add(value);
            btn.classList.add('active');
        }
    }
    
    // Обновить скрытые поля для совместимости
    updateHiddenFields();
};

window.selectCarBtn = function(btn) {
    const group = btn.dataset.group;
    const value = btn.dataset.value;
    
    // Снять active со всех в группе
    document.querySelectorAll(`[data-group="${group}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    if (group === 'strobe-type') {
        carState.strobeType = value;
        document.getElementById('strobeTypeHidden').value = value;
    }

    else if (group === 'mileage') {
        const customInput = document.getElementById('carMileageCustom');
        if (value === 'custom') {
            customInput.classList.remove('hidden');
            customInput.focus();
            document.getElementById('carMileage').value = customInput.value || '';
        } else {
            customInput.classList.add('hidden');
            document.getElementById('carMileage').value = value;
        }
    }
};

// Кастомный пробег — вводим число вручную, если выбрано "Другое"
document.getElementById('carMileageCustom')?.addEventListener('input', function() {
    document.getElementById('carMileage').value = this.value;
});

window.selectYesNo = function(btn) {
    const field = btn.dataset.field;
    const value = btn.dataset.value;
    
    // Снять active с обеих кнопок
    document.querySelectorAll(`[data-field="${field}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    carState.yesNo[field.replace('car', '').toLowerCase()] = value;
    document.getElementById(field).value = value;
};

function updateHiddenFields() {
    document.getElementById('hasUnderglow').value = carState.lights.has('underglow');
    document.getElementById('hasHighBeam').value = carState.lights.has('highbeam');
    document.getElementById('hasStrobe').value = carState.lights.has('strobe');
}

// ===== РАБОТА С ФОТО =====
const photoInput = document.getElementById('adPhotos');
const photoPreview = document.getElementById('photoPreview');

photoInput.addEventListener('change', function(e) {
    const files = Array.from(e.target.files);

    if (selectedPhotos.length + files.length > 5) {
        showToast('Максимум 5 фотографий!', 'warning');
        return;
    }

    // Если до этого выбрали стоковую заглушку, а теперь всё же
    // добавляют своё фото — заглушка больше не нужна, отменяем её,
    // чтобы не отправить и заглушку, и настоящее фото вместе.
    if (useStockPhoto) {
        useStockPhoto = false;
    }

    files.forEach(file => {
        if (!file.type.startsWith('image/')) {
            showToast('Можно загружать только изображения!', 'warning');
            return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
            showToast('Файл слишком большой! Максимум 5MB', 'warning');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(event) {
            selectedPhotos.push(event.target.result);
            renderPhotoPreview();
        };
        reader.readAsDataURL(file);
    });
    
    photoInput.value = '';
});

function renderPhotoPreview() {
    photoPreview.innerHTML = '';

    selectedPhotos.forEach((photo, index) => {
        const div = document.createElement('div');
        div.className = 'photo-preview-item';
        div.innerHTML = `
            <img src="${photo}" alt="Фото ${index + 1}">
            <button type="button" class="remove-photo" onclick="removePhoto(${index})">×</button>
        `;
        photoPreview.appendChild(div);
    });

    // Выбранная заглушка — в той же сетке, с такой же кнопкой удаления
    // (клик по ней просто отменяет выбор заглушки, а не трогает
    // selectedPhotos — это не настоящее загруженное фото).
    const stockCandidates = getStockPhotoCandidates(categorySelect.value);
    if (useStockPhoto && stockCandidates.length > 0) {
        const div = document.createElement('div');
        div.className = 'photo-preview-item photo-preview-stock';
        div.title = selectedBusiness ? `Фото бизнеса №${selectedBusiness.number}` : 'Стандартное фото категории';
        div.innerHTML = `
            <img alt="Стандартное фото">
            <button type="button" class="remove-photo" onclick="cancelStockPhoto()">×</button>
        `;
        photoPreview.appendChild(div);
        setImgWithFallbackChain(div.querySelector('img'), stockCandidates);
    }

    const uploadBtn = document.querySelector('.upload-btn');
    if (selectedPhotos.length >= 5) {
        uploadBtn.innerHTML = '<i data-lucide="check" width="16" height="16"></i> Максимум фото';
        uploadBtn.disabled = true;
        uploadBtn.style.opacity = '0.6';
    } else {
        uploadBtn.innerHTML = `<i data-lucide="camera" width="16" height="16"></i> Добавить фото (${selectedPhotos.length}/5)`;
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = '1';
    }

    if (window.lucide) lucide.createIcons();
    updateStockPhotoSuggestion();
}

window.removePhoto = removePhoto;
function removePhoto(index) {
    selectedPhotos.splice(index, 1);
    renderPhotoPreview();
}

// ===== СТОКОВАЯ ЗАГЛУШКА ФОТО =====
const stockSuggestBox = document.getElementById('stockPhotoSuggest');
const stockSuggestImg = document.getElementById('stockPhotoSuggestImg');

// Кандидаты стокового фото по приоритету: если выбран конкретный
// пронумерованный бизнес — сперва его личное фото, потом фото по типу
// бизнеса (свой номер или просто вручную выбранный тип), и только потом
// общая заглушка категории. У остальных категорий (не "business") — как
// раньше, одна общая заглушка.
// Кандидаты стокового фото по приоритету. У "business" вся логика
// (личное фото номера → фото типа → внешняя ссылка-источник → общая
// заглушка категории) теперь в business-data.js (businessPhotoCandidates) —
// категория у бизнеса больше не выбирается отдельно от номера, так что
// без выбранного конкретного бизнеса кандидатов для business просто нет.
function getStockPhotoCandidates(category) {
    if (category === 'business') {
        return selectedBusiness ? businessPhotoCandidates(selectedBusiness) : [];
    }
    return [STOCK_PHOTOS[category]].filter(Boolean);
}

// Проверить, реально ли существует картинка по этому пути — в браузере
// нет способа синхронно спросить файловую систему, поэтому просто
// пробуем загрузить и смотрим, получилось ли.
function imageExists(url) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
    });
}

// Для ПРЕВЬЮ (в форме) — не тратим лишний запрос на предварительную
// проверку, а просто перебираем кандидатов через onerror самого <img>:
// не загрузился первый — пробуем следующий, и так по цепочке.
function setImgWithFallbackChain(imgEl, candidates) {
    let i = 0;
    imgEl.onerror = () => {
        i++;
        if (i < candidates.length) imgEl.src = candidates[i];
        else imgEl.onerror = null; // ни один вариант не загрузился — сдаёмся
    };
    imgEl.src = candidates[0];
}

function updateStockPhotoSuggestion() {
    if (!stockSuggestBox) return;

    const category = categorySelect.value;
    const candidates = getStockPhotoCandidates(category);

    // Показываем только если: есть хотя бы один кандидат картинки,
    // свои фото не прикреплены, заглушка ещё не выбрана и пользователь
    // её не отклонял для текущей категории.
    const shouldShow = candidates.length > 0 && selectedPhotos.length === 0 && !useStockPhoto && !stockPhotoDismissed;

    stockSuggestBox.classList.toggle('hidden', !shouldShow);
    if (shouldShow) setImgWithFallbackChain(stockSuggestImg, candidates);
}

document.getElementById('stockPhotoUseBtn')?.addEventListener('click', () => {
    useStockPhoto = true;
    renderPhotoPreview(); // покажет плашку заглушки в сетке превью и заодно скроет само предложение
    showToast('Стандартное фото будет использовано', 'success');
});

document.getElementById('stockPhotoSkipBtn')?.addEventListener('click', () => {
    stockPhotoDismissed = true;
    updateStockPhotoSuggestion();
});

window.cancelStockPhoto = function() {
    useStockPhoto = false;
    stockPhotoDismissed = true; // отменил осознанно — повторно не предлагаем в этой же сессии формы
    renderPhotoPreview();
};

// ===== АВТОКОМПЛИТ БИЗНЕСА (номер/расположение) =====
// Та же идея, что у поиска марки авто (см. <script> в create-ad.html),
// но выбор конкретного бизнеса ещё и подставляет категорию, и (если
// найдётся) его собственное фото — не просто текст для заголовка.
let selectedBusiness = null; // { number, type, location } или null (ввели просто текст)

const businessDropdown = document.getElementById('businessDropdown');
const businessSearchInput = document.getElementById('businessSearch');

// Подпись бизнеса для выпадающего списка/бейджа/названия объявления —
// в одном месте, чтобы формат везде совпадал. location может быть null
// (в источнике данных не для всех бизнесов указано расположение).
function businessLabel(b) {
    const typeName = BUSINESS_TYPE_NAMES[b.type] || b.type;
    return b.location ? `${typeName} №${b.number}, ${b.location}` : `${typeName} №${b.number}`;
}

window.filterBusinesses = function(query) {
    const dropdown = businessDropdown;
    if (!dropdown) return;
    const q = query.toLowerCase().trim();
    if (q.length < 1) { dropdown.classList.add('hidden'); return; }

    // Ранжируем совпадения, а не просто фильтруем по подстроке — иначе
    // при вводе "8" запрос находил ВСЁ, что содержит "8" (18, 28, 88,
    // 108...) в произвольном порядке, и сам бизнес №8 мог затеряться
    // где-то в середине списка вместо того, чтобы быть первым.
    const isNumericQuery = /^\d+$/.test(q);

    function matchScore(b) {
        if (isNumericQuery) {
            const numStr = String(b.number);
            if (numStr === q) return 0;         // точное совпадение номера — выше всех
            if (numStr.startsWith(q)) return 1; // номер начинается с введённого (8 → 80..89)
            if (numStr.includes(q)) return 2;   // цифра встречается где-то внутри (18, 108...)
        }
        if (businessSearchText(b).includes(q)) return 3; // совпадение по типу/городу
        return null; // не подходит вовсе
    }

    const matches = BUSINESSES
        .map(b => ({ b, score: matchScore(b) }))
        .filter(x => x.score !== null)
        .sort((a, c) => a.score - c.score || a.b.number - c.b.number)
        .slice(0, 12)
        .map(x => x.b);

    if (!matches.length) { dropdown.classList.add('hidden'); return; }

    dropdown.innerHTML = matches.map(b =>
        `<div class="car-model-option" onclick="selectBusiness(${b.number})">
            <span>${escapeAttr(businessLabel(b))}</span>
        </div>`
    ).join('');
    dropdown.classList.remove('hidden');
};

function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
}

window.selectBusiness = function(number) {
    const b = BUSINESSES.find(x => x.number === number);
    if (!b) return;
    selectedBusiness = b;

    document.getElementById('businessNumber').value = b.number;
    document.getElementById('businessLocationValue').value = b.location || '';
    document.getElementById('businessCategory').value = b.type; // теперь скрытое поле, не select — категория больше не выбирается отдельно от номера
    businessSearchInput.value = '';
    businessDropdown.classList.add('hidden');

    const label = businessLabel(b);
    const selectedBadge = document.getElementById('businessSelected');
    selectedBadge.classList.remove('hidden');
    selectedBadge.innerHTML = `<span class="selected-model-badge">${escapeAttr(label)}
        <span onclick="clearSelectedBusiness()" style="cursor:pointer;margin-left:6px;">×</span></span>`;

    // Название объявления теперь тоже подставляется автоматически —
    // отдельного поля "Название" для категории "Бизнесы" больше нет.
    const titleInput = document.getElementById('adTitle');
    if (titleInput) titleInput.value = label;

    updateStockPhotoSuggestion();
};

window.clearSelectedBusiness = function() {
    selectedBusiness = null;
    document.getElementById('businessNumber').value = '';
    document.getElementById('businessLocationValue').value = '';
    document.getElementById('businessCategory').value = '';
    const titleInput = document.getElementById('adTitle');
    if (titleInput) titleInput.value = '';
    document.getElementById('businessSelected').classList.add('hidden');
    updateStockPhotoSuggestion();
};

document.addEventListener('click', (e) => {
    if (!e.target.closest('#businessDropdown') && e.target !== businessSearchInput) {
        businessDropdown?.classList.add('hidden');
    }
});

// При смене категории — сбрасываем выбор (у новой категории может не
// быть заглушки вообще, или она другая) и пересчитываем показ.
categorySelect.addEventListener('change', () => {
    useStockPhoto = false;
    stockPhotoDismissed = false;
    updateStockPhotoSuggestion();
});

// ===== СБОР ДАННЫХ =====
function getUnderglowData() {
    return Array.from(carState.underglow);
}

function getStrobeData() {
    return carState.strobeType;
}

function getSuspensionData() {
    return Array.from(carState.suspension);
}


// ===== СЖАТИЕ ФОТО =====
// Критично: base64 в Firestore, лимит ~1MB на весь документ со всеми объявлениями
// Цель: одно фото < 30KB base64, т.е. ~22KB бинарных данных
const PHOTO_MAX_WIDTH = 480;   // px — уменьшено с 800
const PHOTO_QUALITY   = 0.5;   // качество — уменьшено с 0.7
const PHOTO_MAX_B64   = 40000; // ~40KB base64 на одно фото — жёсткий лимит

function compressImage(base64, maxWidth = PHOTO_MAX_WIDTH, quality = PHOTO_QUALITY) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = Math.round(height * maxWidth / width);
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            let result = canvas.toDataURL('image/jpeg', quality);

            // Если всё ещё слишком большое — сжимаем ещё раз с меньшим качеством
            if (result.length > PHOTO_MAX_B64) {
                result = canvas.toDataURL('image/jpeg', 0.3);
            }
            // Последний шанс — уменьшаем размер вдвое
            if (result.length > PHOTO_MAX_B64) {
                const canvas2 = document.createElement('canvas');
                canvas2.width = Math.round(width / 2);
                canvas2.height = Math.round(height / 2);
                canvas2.getContext('2d').drawImage(canvas, 0, 0, canvas2.width, canvas2.height);
                result = canvas2.toDataURL('image/jpeg', 0.4);
            }

            resolve(result);
        };
        img.onerror = () => resolve(base64);
        img.src = base64;
    });
}

// ===== COOLDOWN / АНТИСПАМ =====
const COOLDOWN_MS     = 1 * 60 * 1000;  // 1 минута между объявлениями
const MAX_ADS_PER_DAY = 20;              // максимум 20 объявлений в день
const MAX_ACTIVE_ADS  = 20;             // максимум  активных объявлений

async function checkCooldown() {
    const nickname = currentUser.nickname;

    // 1. Пауза между объявлениями (localStorage — быстро)
    const lastAdTime = parseInt(localStorage.getItem(`lastAdTime_${nickname}`) || '0');
    const elapsed = Date.now() - lastAdTime;
    if (elapsed < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000 / 60);
        showToast(`Подождите ещё ${remaining} мин. перед следующим объявлением`, 'warning');
        return false;
    }

    // 2. Лимит объявлений в день + лимит активных (Firestore)
    try {
        const allAds = await getAllAds();
        const myAds  = allAds.filter(ad => ad.author === nickname);

        // Лимит активных
        if (myAds.length >= MAX_ACTIVE_ADS) {
            showToast(`У вас уже ${MAX_ACTIVE_ADS} активных объявлений. Удалите старые.`, 'warning');
            return false;
        }

        // Лимит в день
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayAds = myAds.filter(ad => new Date(ad.createdAt) >= todayStart);
        if (todayAds.length >= MAX_ADS_PER_DAY) {
            showToast(`Лимит ${MAX_ADS_PER_DAY} объявлений в день достигнут. Попробуйте завтра.`, 'warning');
            return false;
        }
    } catch (e) {
        console.error('Ошибка проверки cooldown:', e);
    }

    return true;
}

function saveCooldownTimestamp() {
    localStorage.setItem(`lastAdTime_${currentUser.nickname}`, Date.now().toString());
}

// ===== ОБНОВЛЕНИЕ СЧЁТЧИКА adCounters (для Firestore Rules) =====
async function updateAdCounter() {
    try {
        const ref = doc(db, 'adCounters', currentUser.nickname);
        const snap = await getDoc(ref);
        const current = snap.exists() ? (snap.data().activeCount || 0) : 0;
        await setDoc(ref, {
            activeCount: current + 1,
            lastAdAt: serverTimestamp()
        });
    } catch (e) {
        console.error('Ошибка обновления счётчика:', e);
    }
}

// ===== Отправка формы =====
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Ждём Firebase Auth если ещё не готов (макс 3 сек)
    if (!_authReady) {
        let waited = 0;
        while (!_authReady && waited < 3000) {
            await new Promise(r => setTimeout(r, 100));
            waited += 100;
        }
        if (!_authReady) {
            showToast('Ошибка авторизации. Перезайди на страницу.', 'error');
            return;
        }
    }

    // Проверка бана
    const banStatus = await checkBanStatus(currentUser.nickname);
    if (banStatus.banned) {
        if (banStatus.level === 'ban_perm') {
            showToast('Вы заблокированы навсегда. Создание объявлений недоступно.', 'error');
        } else {
            const hours = Math.ceil(banStatus.remaining / (1000 * 60 * 60));
            showToast(`Вы заблокированы на ${hours} ч. Создание объявлений недоступно.`, 'error');
        }
        return;
    }

    // Проверка cooldown / антиспам
    const allowed = await checkCooldown();
    if (!allowed) return;

    const priceInput = document.getElementById('adPrice').value;
    const price = parseInt(priceInput);
    
    if (!priceInput || isNaN(price) || price <= 0) {
        showToast('Введите корректную цену!', 'error');
        document.getElementById('adPrice').focus();
        return;
    }
    
    if (price > 999999999) {
        showToast('Цена слишком большая!', 'error');
        document.getElementById('adPrice').focus();
        return;
    }

    // Валидация номерного знака — до общей проверки названия,
    // т.к. само поле "Название" для этой категории скрыто и автозаполняется
    if (categorySelect.value === 'plates') {
        if (!plateCountry) {
            showToast('Выберите страну номера', 'error');
            return;
        }
        if (!isPlateComplete(plateCountry, plateValues)) {
            showToast('Заполните номерной знак полностью', 'error');
            return;
        }
    }

    // Для бизнеса название/тип/расположение теперь только через выбор
    // конкретного бизнеса из списка (своего поля "Название" у категории
    // больше нет) — без выбора не из чего собрать объявление.
    if (categorySelect.value === 'business' && !selectedBusiness) {
        showToast('Выберите бизнес из списка', 'error');
        return;
    }

    const title = document.getElementById('adTitle').value.trim();
    if (title.length < 3) {
        showToast('Название слишком короткое (минимум 3 символа)', 'error');
        return;
    }
    
    if (title.length > 100) {
        showToast('Название слишком длинное (максимум 100 символов)', 'error');
        return;
    }

    // Валидация описания
    const description = document.getElementById('adDescription').value.trim();
    if (description.length > 2000) {
        showToast('Описание слишком длинное (максимум 2000 символов)', 'error');
        return;
    }

    // Валидация контакта
    const contact = document.getElementById('adContact').value.trim().replace(/^@/, '');
    if (contact.length > 50) {
        showToast('Контакт слишком длинный (максимум 50 символов)', 'error');
        return;
    }
    if (contact && !/^[a-zA-Z0-9_]+$/.test(contact)) {
        showToast('Некорректный Telegram контакт', 'error');
        return;
    }

    // Сжимаем фото перед сохранением (max 480px, качество 0.5, жёсткий лимит 40KB/фото)
    const compressedPhotos = await Promise.all(
        selectedPhotos.map(photo => compressImage(photo, PHOTO_MAX_WIDTH, PHOTO_QUALITY))
    );

    // Стоковую заглушку НЕ сжимаем — это уже готовый статичный файл
    // проекта (не base64 с телефона пользователя), сжимать его заново
    // при каждой публикации объявления смысла нет. Реально проверяем,
    // какой из кандидатов (личное фото номера бизнеса → фото типа →
    // общая заглушка категории) на самом деле существует — на превью
    // это решает onerror у <img>, но здесь нужно значение для
    // СОХРАНЕНИЯ, поэтому проверяем по-настоящему через imageExists.
    let resolvedStockPhoto = null;
    if (useStockPhoto) {
        for (const url of getStockPhotoCandidates(categorySelect.value)) {
            if (await imageExists(url)) { resolvedStockPhoto = url; break; }
        }
    }
    const finalPhotos = resolvedStockPhoto
        ? [resolvedStockPhoto, ...compressedPhotos]
        : compressedPhotos;

    // Считаем суммарный размер фото — предупреждаем если слишком большой
    const totalPhotoSize = compressedPhotos.reduce((sum, p) => sum + p.length, 0);
    if (totalPhotoSize > 100000) { // >100KB на все фото — предупреждение
        console.warn(`[create-ad] Суммарный размер фото: ${(totalPhotoSize / 1024).toFixed(1)}KB`);
    }

    const ad = {
        id: Date.now(),
        author: currentUser.nickname,
        server: currentUser.server,
        category: categorySelect.value,
        title: title,
        price: price,
        description: description,
        contact: contact,
        photos: finalPhotos,
        createdAt: new Date().toISOString()
    };
    
    // Добавляем специфичные поля для машин
    if (ad.category === 'cars') {
        ad.mileage = document.getElementById('carMileage').value; // ← ИСПРАВЛЕНО: добавлен пробег
        ad.firmware = document.getElementById('carFirmware').value;
        ad.lights = {
            underglow: {
                has: carState.lights.has('underglow'),
                positions: getUnderglowData()
            },
            highBeam: carState.lights.has('highbeam'),
            strobe: {
                has: carState.lights.has('strobe'),
                type: getStrobeData()
            }
        };
        ad.suspension = getSuspensionData();
        ad.tires = carState.yesNo.tires;
        ad.clearance = carState.yesNo.clearance;
        ad.launch = carState.yesNo.launch;
        ad.pdv = carState.yesNo.pdv;
        ad.antiradar = carState.yesNo.antiradar;
        
    } else if (ad.category === 'houses') {
        ad.location = document.getElementById('houseLocation').value.trim();
        ad.upgrades = document.getElementById('houseUpgrades').value.trim();
        ad.basement = document.getElementById('houseBasement').value.trim();
        
    } else if (ad.category === 'garages') {
        ad.location = document.getElementById('garageLocation').value.trim();
        ad.upgrades = document.getElementById('garageUpgrades').value.trim();
        
    } else if (ad.category === 'business') {
        // businessCategory теперь скрытое поле (не <select>), заполняется
        // автоматически при выборе конкретного бизнеса — своего "text"
        // у options тут больше нет, берём название типа из общего словаря.
        ad.businessCategory = document.getElementById('businessCategory').value;
        ad.businessCategoryName = BUSINESS_TYPE_NAMES[ad.businessCategory] || ad.businessCategory;
        ad.location = document.getElementById('businessLocationValue').value.trim();
        ad.businessNumber = selectedBusiness ? selectedBusiness.number : null;
        const incomeFrom = document.getElementById('businessIncomeFrom').value;
        const incomeTo = document.getElementById('businessIncomeTo').value;
        if (incomeFrom) ad.businessIncomeFrom = Number(incomeFrom);
        if (incomeTo) ad.businessIncomeTo = Number(incomeTo);

    } else if (ad.category === 'plates') {
        ad.plateCountry = plateCountry;
        ad.plateValues = plateValues;
    }
    
    const success = await saveAd(ad);
    if (success) {
        saveCooldownTimestamp(); // запоминаем время публикации (localStorage)
        await updateAdCounter(); // обновляем счётчик в Firestore (для Rules)
        sessionStorage.setItem('adJustCreated', '1');
        showToast('Объявление опубликовано!', 'success');
        setTimeout(function() { window.location.href = 'index.html'; }, 1500);
    } else {
        showToast('Ошибка публикации! Попробуйте снова.', 'error');
    }
});