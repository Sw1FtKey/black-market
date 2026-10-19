// ===== SCROLL-LOCK — страница не прокручивается под открытыми окнами =====
// Подключается на страницах с модалками (главная, админка, профиль, статистика).
//
// Проблема: пока открыто окно (объявление, жалоба, редактирование профиля,
// окошко пароля, админские модалки…), свайп/колесо "пробивали" окно и
// крутили страницу ПОД ним. Блокировка была только у боковой шторки.
//
// Решение — один общий модуль вместо правок в каждом окне: он сам замечает,
// что на странице есть открытое окно-оверлей (fixed на весь экран, поверх
// всего, видимое), и пока оно есть — фиксирует прокрутку страницы.
//  • Все платформы: overflow:hidden на html и body (+ компенсация ширины
//    скроллбара на ПК, чтобы страница не "прыгала" вбок).
//  • iOS (Safari игнорирует overflow:hidden на body для касаний): дополнительно
//    замораживаем body через position:fixed и после закрытия возвращаем
//    позицию прокрутки на то же место.
//  • overscroll-behavior:contain на самих окнах — прокрутка внутри окна не
//    "протекает" в страницу на концах списка.

const LOCK_CLASS = 'bm-scroll-locked';
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS под видом Mac

let locked = false;
let savedScrollY = 0;
let savedBody = null;
let scanQueued = false;

(function injectStyle() {
    if (document.getElementById('bm-scroll-lock-style')) return;
    const style = document.createElement('style');
    style.id = 'bm-scroll-lock-style';
    style.textContent = `
        html.${LOCK_CLASS}, html.${LOCK_CLASS} body {
            overflow: hidden !important;
            overscroll-behavior: none !important;
        }
        [class*="overlay"], [class*="modal"] { overscroll-behavior: contain; }
    `;
    document.head.appendChild(style);
})();

// Открытое ли это окно-оверлей: fixed, почти на весь экран, видимое, кликабельное
function isOpenOverlay(el) {
    if (!(el instanceof HTMLElement)) return false;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed') return false;
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (parseFloat(cs.opacity) < 0.05) return false;        // закрыто/ещё не проявилось
    if (cs.pointerEvents === 'none') return false;           // декорация, не окно
    const z = parseInt(cs.zIndex, 10);
    if (!(z >= 10)) return false;                             // окна всегда поверх страницы
    const r = el.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
}

function anyOverlayOpen() {
    const seen = new Set();
    const candidates = [
        ...document.body.children,
        ...document.querySelectorAll('[class*="overlay"], [class*="modal"], [id*="odal"]')
    ];
    for (const el of candidates) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (isOpenOverlay(el)) return true;
    }
    return false;
}

function lock() {
    if (locked) return;
    locked = true;
    const html = document.documentElement, body = document.body;
    savedScrollY = window.scrollY;
    savedBody = {
        paddingRight: body.style.paddingRight, position: body.style.position,
        top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width
    };
    const scrollbar = window.innerWidth - html.clientWidth;   // 0 на телефонах (оверлейный скроллбар)
    html.classList.add(LOCK_CLASS);
    if (scrollbar > 0) body.style.paddingRight = scrollbar + 'px';
    if (IS_IOS) {
        body.style.position = 'fixed';
        body.style.top = `-${savedScrollY}px`;
        body.style.left = '0';
        body.style.right = '0';
        body.style.width = '100%';
    }
}

function unlock() {
    if (!locked) return;
    locked = false;
    const html = document.documentElement, body = document.body;
    html.classList.remove(LOCK_CLASS);
    if (savedBody) {
        body.style.paddingRight = savedBody.paddingRight;
        body.style.position = savedBody.position;
        body.style.top = savedBody.top;
        body.style.left = savedBody.left;
        body.style.right = savedBody.right;
        body.style.width = savedBody.width;
    }
    if (IS_IOS) window.scrollTo(0, savedScrollY);              // вернуть позицию на то же место
}

function scan() {
    scanQueued = false;
    if (!document.body) return;
    anyOverlayOpen() ? lock() : unlock();
}

// Проверять не чаще раза за кадр + контрольные проверки после анимаций
// (окна проявляются через opacity-transition: в момент добавления класса
// прозрачность ещё 0, и первая проверка могла бы счесть окно закрытым)
function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
    setTimeout(scan, 100);
    setTimeout(scan, 450);
}

function start() {
    queueScan();
    new MutationObserver(queueScan).observe(document.documentElement, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ['class', 'style', 'hidden']
    });
    document.addEventListener('transitionend', queueScan, true);
    document.addEventListener('animationend', queueScan, true);
    window.addEventListener('pageshow', e => { if (e.persisted) { unlock(); queueScan(); } });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
