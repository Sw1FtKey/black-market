// ===== OBT-NOTICE — окно «Открытое бета-тестирование» =====
// Показывается на главной после входа: объясняет, что идёт ОБТ, и как
// отправить баг-репорт (через сайт или через Telegram-бота).
//
// Когда показывается:
//   • один раз за сессию (вкладку/визит) — не мешает, если вернуться на главную;
//   • пока человек не поставил галочку «Больше не показывать» (хранится в
//     localStorage этого устройства);
//   • только если человек вошёл и выбрал сервер (чтобы не мелькало перед редиректом).
//
// Удобно знать:
//   • главная?obt=1 — показать окно принудительно (проверка, игнорирует галочку);
//   • window.showObtNotice() — то же самое из консоли;
//   • сменишь NOTICE_VERSION на 'v2' — окно снова увидят все, кто нажал «Больше не показывать»
//     (например, когда изменится текст или бот будет доделан).

const NOTICE_VERSION = 'v1';
const HIDE_KEY    = `bm_obt_notice_hide_${NOTICE_VERSION}`;
const SESSION_KEY = `bm_obt_notice_seen_${NOTICE_VERSION}`;
const SHOW_DELAY_MS = 600; // небольшая пауза: сначала грузится лента и проходит проверка бана

const TELEGRAM_BOT_URL  = 'https://t.me/bm_market_zbt_bot';
const TELEGRAM_BOT_NAME = '@bm_market_zbt_bot';

// Скриншоты лежат в img/obt/ (порядок: аватар → значок ⚠ → форма)
const STEPS = [
    {
        img: 'img/obt/step1.webp',
        alt: 'Главная страница: круглая кнопка профиля в правом верхнем углу',
        title: 'Нажмите на свой аватар',
        text: 'Круглая кнопка профиля в правом верхнем углу экрана.'
    },
    {
        img: 'img/obt/step2.webp',
        alt: 'Шторка профиля: значок предупреждения рядом с крестиком',
        title: 'Нажмите на значок ⚠',
        text: 'В открывшейся шторке профиля — значок предупреждения справа вверху, рядом с крестиком.'
    },
    {
        img: 'img/obt/step3.webp',
        alt: 'Окно «Сообщить об ошибке»',
        title: 'Заполните форму и отправьте',
        text: 'Выберите тип проблемы, опишите, что произошло и как это повторить, укажите, где это случилось. ' +
              'Если можете — приложите скриншот. Затем нажмите «Отправить».'
    }
];

// ─────────────────────────────────────────────
// Хранилище (в приватном режиме браузера localStorage может быть недоступен)
// ─────────────────────────────────────────────
const safeStore = (kind) => ({
    get(key) { try { return window[kind].getItem(key); } catch { return null; } },
    set(key, val) { try { window[kind].setItem(key, val); } catch { /* нет доступа — не страшно */ } }
});
const local = safeStore('localStorage');
const session = safeStore('sessionStorage');

function getUser() {
    try { return JSON.parse(localStorage.getItem('currentUser')); } catch { return null; }
}

function forcedByUrl() {
    try { return new URLSearchParams(location.search).get('obt') === '1'; } catch { return false; }
}

function shouldShow() {
    if (forcedByUrl()) return true;
    if (local.get(HIDE_KEY) === '1') return false;
    if (session.get(SESSION_KEY) === '1') return false;
    const u = getUser();
    return !!(u && u.nickname && u.server);
}

// ─────────────────────────────────────────────
// Стили (вставляются один раз)
// ─────────────────────────────────────────────
function injectStyle() {
    if (document.getElementById('bm-obt-style')) return;
    const style = document.createElement('style');
    style.id = 'bm-obt-style';
    style.textContent = `
    .obt-overlay {
        position: fixed; inset: 0; z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
        background: rgba(0,0,0,0.82); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
        opacity: 0; transition: opacity .25s ease;
    }
    .obt-overlay.show { opacity: 1; }
    .obt-card {
        width: 100%; max-width: 560px;
        max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px);
        display: flex; flex-direction: column;
        background: #111; color: #eee;
        border: 1px solid rgba(255,30,30,0.3); border-radius: 18px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(255,30,30,0.08);
        transform: translateY(14px) scale(.98); transition: transform .25s ease;
        font-family: inherit;
    }
    .obt-overlay.show .obt-card { transform: none; }

    .obt-head { display: flex; align-items: center; gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid rgba(255,255,255,0.07); }
    .obt-tag { background: linear-gradient(135deg,#ff1e1e,#cc0000); color: #fff; font-weight: 800; font-size: 12px; letter-spacing: .08em; padding: 5px 10px; border-radius: 8px; flex-shrink: 0; }
    .obt-title { margin: 0; flex: 1; font-size: 18px; font-weight: 700; color: #fff; line-height: 1.25; }
    .obt-x { flex-shrink: 0; width: 34px; height: 34px; border: 0; border-radius: 50%; background: rgba(255,255,255,0.08); color: #bbb; font-size: 20px; line-height: 1; cursor: pointer; }
    .obt-x:hover { background: rgba(255,255,255,0.15); color: #fff; }

    .obt-body { padding: 16px 20px; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
    .obt-body p { margin: 0 0 12px; font-size: 14.5px; line-height: 1.6; color: #cfcfcf; }
    .obt-body h3 { margin: 20px 0 10px; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #ff6b6b; }
    .obt-sub { margin: 14px 0 10px; font-size: 15px; font-weight: 700; color: #fff; }

    .obt-step { display: flex; gap: 12px; align-items: flex-start; padding: 12px; margin-bottom: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; }
    .obt-num { flex-shrink: 0; width: 26px; height: 26px; border-radius: 50%; background: rgba(255,30,30,0.18); border: 1px solid rgba(255,30,30,0.5); color: #ff6b6b; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center; }
    .obt-step-text { flex: 1; min-width: 0; }
    .obt-step-title { font-size: 14.5px; font-weight: 600; color: #fff; margin-bottom: 4px; }
    .obt-step-desc { font-size: 13.5px; line-height: 1.5; color: #aaa; }
    .obt-shot { flex-shrink: 0; width: 88px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); cursor: zoom-in; display: block; background: #000; }
    .obt-hint { font-size: 12px; color: #777; margin: -2px 0 10px; }

    .obt-tg { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px 16px; margin-top: 4px; border-radius: 12px; border: 1px solid rgba(34,158,217,0.5); background: rgba(34,158,217,0.1); color: #5cc3f0; font-size: 14.5px; font-weight: 600; text-decoration: none; box-sizing: border-box; }
    .obt-tg:hover { background: rgba(34,158,217,0.18); }
    .obt-note { font-size: 12.5px; color: #888; margin-top: 14px; }

    .obt-foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; padding: 14px 20px 16px; border-top: 1px solid rgba(255,255,255,0.07); }
    .obt-check { display: inline-flex; align-items: center; gap: 9px; font-size: 14px; color: #bbb; cursor: pointer; user-select: none; }
    .obt-check input { width: 19px; height: 19px; accent-color: #ff1e1e; cursor: pointer; margin: 0; }
    .obt-ok { padding: 12px 28px; border: 0; border-radius: 12px; background: linear-gradient(135deg,#ff1e1e,#cc0000); color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; }
    .obt-ok:hover { opacity: .9; }

    .obt-zoom { position: fixed; inset: 0; z-index: 10001; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.92); cursor: zoom-out; }
    .obt-zoom img { max-width: 100%; max-height: 100%; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,.7); }

    @media (max-width: 420px) {
        .obt-head { padding: 14px 14px 12px; }
        .obt-body { padding: 14px; }
        .obt-foot { padding: 12px 14px 14px; flex-direction: column; align-items: stretch; }
        .obt-ok { width: 100%; }
        .obt-title { font-size: 16.5px; }
    }`;
    document.head.appendChild(style);
}

// ─────────────────────────────────────────────
// Разметка (весь текст статический — пользовательских данных тут нет)
// ─────────────────────────────────────────────
function buildHtml() {
    const steps = STEPS.map((s, i) => `
        <div class="obt-step">
            <div class="obt-num">${i + 1}</div>
            <div class="obt-step-text">
                <div class="obt-step-title">${s.title}</div>
                <div class="obt-step-desc">${s.text}</div>
            </div>
            <img class="obt-shot" src="${s.img}" alt="${s.alt}" loading="lazy" data-zoom="${s.img}">
        </div>`).join('');

    return `
    <div class="obt-card" role="dialog" aria-modal="true" aria-labelledby="obtTitle">
        <div class="obt-head">
            <span class="obt-tag">ОБТ</span>
            <h2 class="obt-title" id="obtTitle">Открытое бета-тестирование</h2>
            <button type="button" class="obt-x" aria-label="Закрыть" data-obt-close>×</button>
        </div>

        <div class="obt-body">
            <p>Привет! Black Market сейчас проходит <b>открытое бета-тестирование</b>. Сайт уже работает,
               но мы продолжаем его дорабатывать, поэтому возможны <b>баги, сбои и неожиданное поведение</b>.
               Что-то может измениться или работать не так, как задумано — для этапа теста это нормально.</p>
            <p>Нашли ошибку? <b>Сообщите нам</b> — так мы исправим её быстрее. Чем подробнее описание
               (что делали, что ожидали и что получилось), тем лучше.</p>

            <h3>Как отправить баг-репорт</h3>

            <div class="obt-sub">Способ 1 — на сайте</div>
            ${steps}
            <div class="obt-hint">Нажмите на скриншот, чтобы увеличить.</div>

            <div class="obt-sub">Способ 2 — через Telegram-бота</div>
            <p>Сообщить о проблеме можно и через нашего бота в Telegram.</p>
            <a class="obt-tg" href="${TELEGRAM_BOT_URL}" target="_blank" rel="noopener noreferrer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.3 18.7 19.5c-.2 1-.8 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.4-4.8 8.7-7.9c.4-.3-.1-.5-.6-.2L6.7 13.4l-4.6-1.4c-1-.3-1-1 .2-1.5L20.2 3.5c.8-.3 1.6.2 1.7.8z"/></svg>
                Открыть бота ${TELEGRAM_BOT_NAME}
            </a>

            <div class="obt-note">Пожалуйста, не указывайте в репортах пароли и другие личные данные. Спасибо, что вы с нами!</div>
        </div>

        <div class="obt-foot">
            <label class="obt-check"><input type="checkbox" id="obtDontShow"> Больше не показывать</label>
            <button type="button" class="obt-ok" id="obtOk">Понятно</button>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────
// Показ / закрытие
// ─────────────────────────────────────────────
let overlay = null;
let zoomEl = null;
let lastFocus = null;

function closeZoom() {
    if (zoomEl) { zoomEl.remove(); zoomEl = null; }
}

function openZoom(src) {
    closeZoom();
    zoomEl = document.createElement('div');
    zoomEl.className = 'obt-zoom';
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Скриншот';
    zoomEl.appendChild(img);
    zoomEl.addEventListener('click', closeZoom);
    overlay.appendChild(zoomEl);
}

function closeNotice() {
    if (!overlay) return;
    const box = overlay.querySelector('#obtDontShow');
    if (box && box.checked) local.set(HIDE_KEY, '1');
    document.removeEventListener('keydown', onKeydown, true);
    const el = overlay;
    overlay = null;
    zoomEl = null;
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
    if (lastFocus && typeof lastFocus.focus === 'function') { try { lastFocus.focus(); } catch { /* элемент мог исчезнуть */ } }
}

function onKeydown(e) {
    if (!overlay) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (zoomEl) closeZoom(); else closeNotice();
        return;
    }
    // Не даём Tab уйти за пределы окна
    if (e.key === 'Tab') {
        const items = [...overlay.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')]
            .filter(el => !el.disabled && el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
}

export function showObtNotice() {
    if (overlay) return;
    injectStyle();
    lastFocus = document.activeElement;

    overlay = document.createElement('div');
    overlay.className = 'obt-overlay';
    overlay.innerHTML = buildHtml();
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { closeNotice(); return; }
        if (e.target.closest('[data-obt-close]') || e.target.id === 'obtOk') { closeNotice(); return; }
        const shot = e.target.closest('[data-zoom]');
        if (shot) openZoom(shot.dataset.zoom);
    });
    document.addEventListener('keydown', onKeydown, true);

    requestAnimationFrame(() => overlay && overlay.classList.add('show'));
    const ok = overlay.querySelector('#obtOk');
    if (ok) ok.focus({ preventScroll: true });
}

window.showObtNotice = showObtNotice;

function init() {
    if (!shouldShow()) return;
    setTimeout(() => {
        // за время паузы человека могли разлогинить (бан) — перепроверяем
        if (!forcedByUrl() && !getUser()?.nickname) return;
        session.set(SESSION_KEY, '1'); // «уже показывали в этой сессии» — только в момент реального показа
        showObtNotice();
    }, SHOW_DELAY_MS);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
