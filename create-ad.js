// ===== Проверка авторизации =====
const currentUser = JSON.parse(localStorage.getItem('currentUser'));
if (!currentUser) {
    window.location.href = 'register.html';
}

// ===== Импорт Firebase =====
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { showToast } from './utils.js';
import { getAllAds, saveAd } from './api.js';

// ===== TOAST =====

// getAllAds, saveAd — импортированы из api.js

// ===== Элементы формы =====
const categorySelect = document.getElementById('adCategory');
const carFields = document.getElementById('carFields');
const houseFields = document.getElementById('houseFields');
const garageFields = document.getElementById('garageFields');
const businessFields = document.getElementById('businessFields');
const form = document.getElementById('createAdForm');

// ===== МАССИВ ДЛЯ ХРАНЕНИЯ ФОТО =====
let selectedPhotos = [];

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
    
    if (category === 'cars') {
        carFields.classList.remove('hidden');
    } else if (category === 'houses') {
        houseFields.classList.remove('hidden');
    } else if (category === 'garages') {
        garageFields.classList.remove('hidden');
    } else if (category === 'business') {
        businessFields.classList.remove('hidden');
    }
});

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
};

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
    
    if (selectedPhotos.length + files.length > 3) {
        showToast('Максимум 3 фотографии!', 'warning');
        return;
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
    
    const uploadBtn = document.querySelector('.upload-btn');
    if (selectedPhotos.length >= 5) {
        uploadBtn.textContent = '✓ Максимум фото';
        uploadBtn.disabled = true;
        uploadBtn.style.opacity = '0.6';
    } else {
        uploadBtn.textContent = `📷 Добавить фото (${selectedPhotos.length}/5)`;
        uploadBtn.disabled = false;
        uploadBtn.style.opacity = '1';
    }
}

window.removePhoto = removePhoto;
function removePhoto(index) {
    selectedPhotos.splice(index, 1);
    renderPhotoPreview();
}

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
const COOLDOWN_MS     = 1 * 60 * 1000;  //  минут между объявлениями
const MAX_ADS_PER_DAY = 20;              // максимум  объявлений в день
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
        photos: compressedPhotos,
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
        ad.businessCategory = document.getElementById('businessCategory').value;
        ad.businessCategoryName = document.getElementById('businessCategory').options[document.getElementById('businessCategory').selectedIndex].text;
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