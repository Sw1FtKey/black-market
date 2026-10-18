// ===== PLATE-RENDER — номерные знаки (RU / BY / UA / KZ) =====
// Знак ПОЛНОСТЬЮ нарисован кодом (SVG + шрифт PlateFont), без картинок-бланков.
//
// Почему переписано с нуля (раньше знак лежал картинкой, а поля ввода
// накладывались сверху и их ширина считалась через canvas.measureText):
// шрифт грузится асинхронно, и замер до его загрузки шёл по запасному
// Arial — поля получались уже настоящих глифов, широкие буквы (О, М, А)
// обрезались. Теперь у каждого символа своя ячейка ФИКСИРОВАННОЙ ширины
// (в условных "мм" знака 520×112), геометрия не зависит от загрузки
// шрифта вообще. Один и тот же чертёж используется и для формы ввода, и
// для статичной карточки — они визуально идентичны.
//
// Формат значений прежний: { l1, d1, l2, region } — ключи из PLATE_FORMATS
// (plates-data.js), уже сохранённые объявления отображаются как раньше.
//
// Шрифт: цифры в PlateFont выше букв (0.94 em против 0.71 em), поэтому кегль
// цифр и букв подбирается ОТДЕЛЬНО — под одинаковую высоту символа.

import { PLATE_FORMATS } from './plates-data.js';

// Шрифт вшит (plate-font.woff2, ~7 КБ) — не зависит от пути /fonts/ и от
// того, как быстро сеть его отдаст.
const PLATE_FONT_B64 = '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';
const PLATE_FONT_STACK = "'PlateFont', Arial, Helvetica, sans-serif";

const VB_W = 520, VB_H = 112;
const DIGIT_CAP = 0.94, LETTER_CAP = 0.71;           // высота глифа / em (из plate-font.ttf)
const BOX = 1.2;                                      // высота поля ввода = 1.2 кегля (запас от обрезки)
const ASC = (BOX - 1.0048) / 2 + 0.9736;              // базовая линия от верха поля (при ascent-override)
const fsDigit  = h => h / DIGIT_CAP;
const fsLetter = h => h / LETTER_CAP;

// Визуально одинаковые кириллические/латинские буквы — человек печатает
// любой раскладкой, а в ячейку ложится тот символ, что разрешён в стране.
const LOOKALIKES = [
    ['А','A'], ['В','B'], ['Е','E'], ['К','K'], ['М','M'], ['Н','H'],
    ['О','O'], ['Р','P'], ['С','C'], ['Т','T'], ['У','Y'], ['Х','X'], ['І','I']
];

// ───────────────────────────────────────────────────────────
// ЧЕРТЁЖ ЗНАКОВ. Координаты в "мм" (холст 520×112).
// cells: [ключ поля из PLATE_FORMATS, индекс символа в поле, тип, x, ширина]
// ───────────────────────────────────────────────────────────
const DESIGN = {
    ru: {
        baseline: 84, h: 56,
        cells: [
            ['l1', 0, 'L', 22, 56],
            ['d1', 0, 'D', 94, 44], ['d1', 1, 'D', 138, 44], ['d1', 2, 'D', 182, 44],
            ['l2', 0, 'L', 244, 56], ['l2', 1, 'L', 300, 56]
        ],
        region: { key: 'region', x: 378, w: 132, baseline: 66, h: 44, max: 3 },
        deco: () => `
            <rect x="6" y="6" width="508" height="100" rx="8" fill="none" stroke="#111" stroke-width="3"/>
            <line x1="372" y1="6" x2="372" y2="106" stroke="#111" stroke-width="3"/>
            <text class="bm-deco" x="408" y="98" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="21" fill="#111" text-anchor="middle" letter-spacing=".5">RUS</text>
            ${flagRU(448, 82, 30, 20)}`
    },
    by: {
        baseline: 82, h: 52,
        cells: [
            ['d1', 0, 'D', 124, 40], ['d1', 1, 'D', 164, 40], ['d1', 2, 'D', 204, 40], ['d1', 3, 'D', 244, 40],
            ['l1', 0, 'L', 300, 52], ['l1', 1, 'L', 352, 52]
        ],
        region: { key: 'region', x: 438, w: 48, baseline: 82, h: 52, max: 1 },
        deco: () => `
            <rect x="6" y="6" width="508" height="100" rx="8" fill="none" stroke="#111" stroke-width="3"/>
            ${flagBY(24, 20, 34, 22)}
            <text class="bm-deco" x="41" y="92" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="22" fill="#111" text-anchor="middle">BY</text>
            <rect x="410" y="53" width="22" height="7" fill="#111"/>`
    },
    ua: {
        baseline: 82, h: 50,
        cells: [
            ['l1', 0, 'L', 120, 50], ['l1', 1, 'L', 170, 50],
            ['d1', 0, 'D', 234, 36], ['d1', 1, 'D', 270, 36], ['d1', 2, 'D', 306, 36], ['d1', 3, 'D', 342, 36],
            ['l2', 0, 'L', 392, 50], ['l2', 1, 'L', 442, 50]
        ],
        region: null,
        deco: (id) => `
            <clipPath id="${id}clip"><rect x="6" y="6" width="508" height="100" rx="8"/></clipPath>
            <g clip-path="url(#${id}clip)"><rect x="6" y="6" width="92" height="100" fill="#0a4fb0"/></g>
            <rect x="6" y="6" width="508" height="100" rx="8" fill="none" stroke="#111" stroke-width="3"/>
            ${flagUA(26, 20, 34, 23)}
            <text class="bm-deco" x="52" y="95" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="23" fill="#fff" text-anchor="middle">UA</text>`
    },
    kz: {
        baseline: 83, h: 52,
        cells: [
            ['d1', 0, 'D', 104, 38], ['d1', 1, 'D', 142, 38], ['d1', 2, 'D', 180, 38],
            ['l1', 0, 'L', 232, 49], ['l1', 1, 'L', 281, 49], ['l1', 2, 'L', 330, 49]
        ],
        region: { key: 'region', x: 392, w: 118, baseline: 83, h: 52, max: 3 },   // та же высота, что у основных цифр
        deco: () => `
            <rect x="6" y="6" width="508" height="100" rx="8" fill="none" stroke="#111" stroke-width="3"/>
            ${flagKZ(22, 20, 36, 24)}
            <text class="bm-deco" x="40" y="92" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="22" fill="#111" text-anchor="middle">KZ</text>
            <line x1="386" y1="6" x2="386" y2="106" stroke="#111" stroke-width="3"/>`
    }
};

// ───────── Флаги (упрощённые, но узнаваемые) ─────────
function flagRU(x, y, w, h) {
    const s = h / 3;
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${s}" fill="#fff"/>
        <rect x="${x}" y="${y + s}" width="${w}" height="${s}" fill="#0039a6"/>
        <rect x="${x}" y="${y + 2*s}" width="${w}" height="${s}" fill="#d52b1e"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#111" stroke-width="1.2"/></g>`;
}
function flagBY(x, y, w, h) {
    const strip = w * 0.16, fx = x + strip, fw = w - strip, red = h * 0.667;
    let orn = '';
    for (let i = 0; i < 4; i++) {
        const cy = y + h * (0.13 + i * 0.25);
        orn += `<path d="M${x + strip/2} ${cy - 3.2} L${x + strip - 0.6} ${cy} L${x + strip/2} ${cy + 3.2} L${x + 0.6} ${cy}Z" fill="#cf101a"/>`;
    }
    return `<g><rect x="${x}" y="${y}" width="${strip}" height="${h}" fill="#fff"/>${orn}
        <rect x="${fx}" y="${y}" width="${fw}" height="${red}" fill="#cf101a"/>
        <rect x="${fx}" y="${y + red}" width="${fw}" height="${h - red}" fill="#00873e"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#111" stroke-width="1"/></g>`;
}
function flagUA(x, y, w, h) {
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h/2}" fill="#0057b7"/>
        <rect x="${x}" y="${y + h/2}" width="${w}" height="${h/2}" fill="#ffd700"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#fff" stroke-width="1.2"/></g>`;
}
function flagKZ(x, y, w, h) {
    const cx = x + w * 0.55, cy = y + h * 0.42;
    let rays = '';
    for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8, r1 = h * 0.24, r2 = h * 0.36;
        rays += `<line x1="${cx + Math.cos(a) * r1}" y1="${cy + Math.sin(a) * r1}" x2="${cx + Math.cos(a) * r2}" y2="${cy + Math.sin(a) * r2}"/>`;
    }
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#00afca"/>
        <rect x="${x}" y="${y}" width="${w * 0.09}" height="${h}" fill="#fec50c"/>
        <circle cx="${cx}" cy="${cy}" r="${h * 0.2}" fill="#fec50c"/>
        <g stroke="#fec50c" stroke-width="1.1" stroke-linecap="round">${rays}</g>
        <path d="M${cx - w*0.28} ${y + h*0.80} Q${cx} ${y + h*0.60} ${cx + w*0.28} ${y + h*0.80} Q${cx} ${y + h*0.74} ${cx - w*0.28} ${y + h*0.80}Z" fill="#fec50c"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#111" stroke-width="1"/></g>`;
}

// ───────── Стили (один раз на страницу) ─────────
let stylesInjected = false;
function injectStyles() {
    if (stylesInjected || typeof document === 'undefined') return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
    @font-face {
        font-family: 'PlateFont';
        src: url(data:font/woff2;base64,${PLATE_FONT_B64}) format('woff2');
        font-weight: 400; font-style: normal; font-display: block;
        /* одинаковые вертикальные метрики во всех браузерах (из hhea шрифта) */
        ascent-override: 97.36%; descent-override: 3.12%; line-gap-override: 0%;
    }
    .plate-outer {
        position: relative; width: 100%; perspective: 1000px;
        container-type: inline-size; /* размеры в знаке считаются от ЕГО ширины (cqw) */
    }
    .plate-frame {
        position: relative; width: 100%; aspect-ratio: ${VB_W} / ${VB_H};
        filter: drop-shadow(0 3px 8px rgba(0,0,0,0.4));
        transition: transform .15s ease; backface-visibility: hidden;
    }
    .plate-frame > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    /* В base.css есть универсальное  *, *::before, *::after { font-family: Inter }  —
       оно применяется и к SVG-тексту и сильнее атрибута font-family, из-за чего
       символы статичного знака (карточки ленты/модалки) рисовались Inter вместо
       PlateFont. Задаём шрифт CSS-правилами с !important и повышенной специфичностью. */
    .plate-frame svg text.bm-ch {
        font-family: ${PLATE_FONT_STACK} !important; font-weight: 400 !important;
        font-style: normal !important; letter-spacing: 0 !important;
    }
    .plate-frame svg text.bm-deco {
        font-family: Arial, Helvetica, sans-serif !important; font-style: normal !important;
    }
    .bm-plate { --u: calc(100cqw / ${VB_W}); position: absolute; inset: 0; }
    /* Ячейки знака защищены от стилей сайта: в base.css есть глобальное
       input { font-family: Inter !important } и .form-group input { padding,
       border, background }, а на мобильных ещё width:100% !important и
       font-size:16px !important — без !important и повышенной специфичности
       шрифт PlateFont не применялся, и символы рисовались Arial. */
    .bm-plate input.bm-cell {
        position: absolute !important; margin: 0 !important; padding: 0 !important;
        border: 0 !important; outline: 0 !important; border-radius: calc(var(--u) * 4) !important;
        background: transparent !important; box-shadow: none !important;
        box-sizing: border-box !important; min-width: 0 !important; max-width: none !important;
        font-family: ${PLATE_FONT_STACK} !important; font-weight: 400 !important; font-style: normal !important;
        color: #0c0c0c !important; text-align: center !important; text-transform: uppercase !important;
        line-height: ${BOX} !important; letter-spacing: 0 !important; caret-color: #1a63ff;
        font-kerning: none; font-variant-ligatures: none;
        transition: background .12s ease, box-shadow .12s ease !important;
        -webkit-appearance: none; appearance: none;
    }
    .bm-plate input.bm-cell::placeholder { color: rgba(0,0,0,.13) !important; opacity: 1 !important; }
    .bm-plate input.bm-cell:focus {
        background: rgba(26,99,255,.10) !important;
        box-shadow: 0 0 0 calc(var(--u) * 1.2) rgba(26,99,255,.35) !important;
        border: 0 !important; outline: 0 !important;
    }
    .bm-plate input.bm-cell.bm-bad { animation: bmPlateShake .25s; }
    @keyframes bmPlateShake { 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
    `;
    document.head.appendChild(style);
}

let _uid = 0;
function escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Фон + рамка + флаги + подписи страны (без символов номера)
function plateBaseSvg(code, id) {
    const d = DESIGN[code];
    return `<defs><linearGradient id="${id}bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ececea"/></linearGradient></defs>
        <rect x="1" y="1" width="518" height="110" rx="12" fill="url(#${id}bg)" stroke="#222" stroke-width="2"/>
        ${d.deco(id)}`;
}

// ===== СТАТИЧНОЕ ОТОБРАЖЕНИЕ — для карточки ленты и модалки объявления =====
// values — например { l1:'А', d1:'123', l2:'ВС', region:'777' }
export function renderPlateSVG(countryCode, values = {}) {
    injectStyles();
    const d = DESIGN[countryCode];
    if (!d || !PLATE_FORMATS[countryCode]) return '';
    const id = `bmp${++_uid}`;
    const txt = (cx, baseline, fs, s) => s
        ? `<text class="bm-ch" x="${cx}" y="${baseline}" text-anchor="middle" font-family="${PLATE_FONT_STACK}" font-weight="400" font-size="${fs}" fill="#0c0c0c">${escapeXml(s)}</text>`
        : '';

    let chars = '';
    for (const [key, idx, type, x, w] of d.cells) {
        const ch = ((values[key] || '').toString().toUpperCase())[idx] || '';
        chars += txt(x + w / 2, d.baseline, type === 'L' ? fsLetter(d.h) : fsDigit(d.h), ch);
    }
    if (d.region) {
        const r = d.region;
        chars += txt(r.x + r.w / 2, r.baseline, fsDigit(r.h), (values[r.key] || '').toString().slice(0, r.max));
    }

    return `<div class="plate-outer"><div class="plate-frame">
        <svg viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg">${plateBaseSvg(countryCode, id)}${chars}</svg>
    </div></div>`;
}

// ===== ИНТЕРАКТИВНЫЙ РЕЖИМ — форма создания/редактирования =====
// containerId — id пустого <div>, куда вставится знак с полями ввода.
// onInput(values) — вызывается при каждом изменении с текущими значениями.
export function renderInteractivePlate(containerId, countryCode, initialValues = {}, onInput) {
    injectStyles();
    const container = document.getElementById(containerId);
    if (!container) return;
    const fmt = PLATE_FORMATS[countryCode];
    const d = DESIGN[countryCode];
    if (!fmt || !d) { container.innerHTML = ''; return; }

    const id = `bmp${++_uid}`;
    container.innerHTML = `<div class="plate-outer" id="${containerId}_outer"><div class="plate-frame">
        <svg viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg">${plateBaseSvg(countryCode, id)}</svg>
        <div class="bm-plate"></div>
    </div></div>`;
    const plate = container.querySelector('.bm-plate');

    const U = n => `calc(var(--u) * ${n})`;
    const inputs = [];   // { el, key, idx, type }

    const addInput = (key, idx, type, x, w, baseline, h, maxLen, ph) => {
        const fs = type === 'L' ? fsLetter(h) : fsDigit(h);
        const el = document.createElement('input');
        el.type = 'text'; el.autocomplete = 'off'; el.spellcheck = false;
        el.setAttribute('autocapitalize', 'characters');
        if (type !== 'L') el.inputMode = 'numeric';
        el.maxLength = maxLen; el.placeholder = ph;
        el.setAttribute('aria-label', `Номер: ${key}${maxLen === 1 ? ' ' + (idx + 1) : ''}`);
        el.className = 'bm-cell';
        // inline + important: побивает и обычные, и !important-правила сайта
        // (например мобильное "width:100% !important; font-size:16px !important")
        const setImp = (prop, val) => el.style.setProperty(prop, val, 'important');
        setImp('left', U(x)); setImp('width', U(w)); setImp('height', U(fs * BOX));
        setImp('top', U(baseline - ASC * fs)); setImp('font-size', U(fs));
        plate.appendChild(el);
        inputs.push({ el, key, idx, type });
        return el;
    };

    d.cells.forEach(([key, idx, type, x, w]) => {
        const el = addInput(key, idx, type, x, w, d.baseline, d.h, 1, type === 'L' ? fmt.letters[0] : '0');
        el.value = ((initialValues[key] || '').toString().toUpperCase())[idx] || '';
    });
    if (d.region) {
        const r = d.region;
        const el = addInput(r.key, 0, 'R', r.x, r.w, r.baseline, r.h, r.max, '0'.repeat(Math.min(2, r.max)));
        el.value = (initialValues[r.key] || '').toString().slice(0, r.max);
    }

    const allowed = new Set(fmt.letters);
    const normLetter = ch => {
        ch = ch.toUpperCase();
        if (allowed.has(ch)) return ch;
        const g = LOOKALIKES.find(p => p.includes(ch));
        return g ? (g.find(c => allowed.has(c)) || null) : null;
    };
    const filter = (type, s) => {
        let out = '';
        for (const c of s) {
            if (type === 'L') { const n = normLetter(c); if (n) out += n; }
            else if (/[0-9]/.test(c)) out += c;
        }
        return out;
    };
    const collect = () => {
        const o = {};
        fmt.fields.forEach(f => { o[f.key] = ''; });
        inputs.forEach(i => { o[i.key] += i.el.value; });
        return o;
    };
    const emit = () => { if (typeof onInput === 'function') onInput(collect()); };
    const focusAt = n => { const t = inputs[n]; if (t) { t.el.focus(); t.el.select(); } };

    inputs.forEach((item, n) => {
        const { el, type } = item;
        el.addEventListener('input', () => {
            const raw = el.value, f = filter(type, raw);
            if (f !== raw) { el.classList.remove('bm-bad'); void el.offsetWidth; el.classList.add('bm-bad'); }
            el.value = f.slice(0, el.maxLength);
            if (f.length && el.value.length >= el.maxLength) focusAt(n + 1);
            emit();
        });
        el.addEventListener('keydown', e => {
            if (e.key === 'Backspace' && !el.value) {
                e.preventDefault();
                if (inputs[n - 1]) { inputs[n - 1].el.value = ''; focusAt(n - 1); emit(); }
            } else if (e.key === 'ArrowLeft' && el.selectionStart === 0) {
                e.preventDefault(); focusAt(n - 1);
            } else if (e.key === 'ArrowRight' && el.selectionStart === el.value.length) {
                e.preventDefault(); focusAt(n + 1);
            }
        });
        el.addEventListener('focus', () => el.select());
        el.addEventListener('paste', e => {          // вставка целого номера "А123ВС77"
            e.preventDefault();
            const txt = (e.clipboardData || window.clipboardData).getData('text') || '';
            let k = n;
            for (const c of txt) {
                // ближайшая ячейка начиная с k, которой этот символ подходит
                let j = k;
                while (inputs[j] && !filter(inputs[j].type, c)) j++;
                const t = inputs[j];
                if (!t) continue;                       // символ никуда не подходит — пропускаем
                const ok = filter(t.type, c);
                if (t.type === 'R') {
                    if (t.el.value.length < t.el.maxLength) t.el.value += ok;
                    k = j;
                } else {
                    t.el.value = ok;
                    k = j + 1;
                }
            }
            emit();
        });
    });

    // Клик по пустому месту знака — в первую пустую ячейку
    plate.addEventListener('mousedown', e => {
        if (e.target.tagName === 'INPUT') return;
        e.preventDefault();
        const empty = inputs.findIndex(i => !i.el.value);
        focusAt(empty < 0 ? 0 : empty);
    });

    emit();
}

// ===== ПЕРЕКЛЮЧЕНИЕ СТРАНЫ С АНИМАЦИЕЙ ПЕРЕВОРОТА =====
// Используй вместо renderInteractivePlate, когда страна МЕНЯЕТСЯ — знак
// переворачивается "с ребра" на новый. При первом рендере — без анимации.
const FLIP_HALF_MS = 200;

export function flipPlateToCountry(containerId, countryCode, initialValues = {}, onInput) {
    const existingFrame = document.getElementById(`${containerId}_outer`)?.querySelector('.plate-frame');

    if (!existingFrame) {
        renderInteractivePlate(containerId, countryCode, initialValues, onInput);
        return;
    }

    existingFrame.style.transition = `transform ${FLIP_HALF_MS}ms ease-in`;
    existingFrame.style.transform = 'rotateY(90deg)';

    setTimeout(() => {
        renderInteractivePlate(containerId, countryCode, initialValues, onInput);

        const newFrame = document.getElementById(`${containerId}_outer`)?.querySelector('.plate-frame');
        if (!newFrame) return;

        newFrame.style.transition = 'none';
        newFrame.style.transform = 'rotateY(-90deg)';
        void newFrame.offsetWidth; // форсируем рефлоу, чтобы transition:none точно применился
        requestAnimationFrame(() => {
            newFrame.style.transition = `transform ${FLIP_HALF_MS}ms ease-out`;
            newFrame.style.transform = 'rotateY(0deg)';
        });
    }, FLIP_HALF_MS);
}

// Проверка, заполнены ли все поля знака полностью (для валидации перед отправкой формы)
export function isPlateComplete(countryCode, values = {}) {
    const fmt = PLATE_FORMATS[countryCode];
    if (!fmt) return false;
    return fmt.fields.every(f => {
        const len = (values[f.key] || '').length;
        // Регион бывает двух- и трёхзначным (77, 02, 777) — требовать у него
        // ровно максимальную длину значило браковать нормальные номера.
        // У Беларуси регион однозначный (length 1) — там по-прежнему ровно 1.
        if (f.type === 'region') return len >= Math.min(2, f.length) && len <= f.length;
        return len === f.length;
    });
}

// Собирает значения полей в единую строку номера для хранения/отображения
export function plateValuesToString(countryCode, values = {}) {
    const fmt = PLATE_FORMATS[countryCode];
    if (!fmt) return '';
    return fmt.fields.map(f => values[f.key] || '').join(' ').trim();
}
