// ===== UTILS.JS — общие вспомогательные функции =====
// Импортируй нужное: import { showToast, escapeHtml } from './utils.js';

// ─────────────────────────────────────────────
// 🔔 TOAST УВЕДОМЛЕНИЯ
// ─────────────────────────────────────────────
export function showToast(message, type = 'info') {
    document.querySelectorAll('.bm-toast-global').forEach(t => t.remove());

    const cfg = {
        success: { border: '#4caf50', icon: '✓' },
        error:   { border: '#f44336', icon: '✕' },
        warning: { border: '#ff9800', icon: '!' },
        info:    { border: '#2196f3', icon: 'i' }
    };
    const c = cfg[type] || cfg.info;

    const t = document.createElement('div');
    t.className = 'bm-toast-global';
    t.style.cssText = `
        position: fixed; bottom: 30px; left: 50%;
        transform: translateX(-50%) translateY(80px);
        background: rgba(17,17,17,0.97);
        border: 1px solid ${c.border}40;
        border-left: 3px solid ${c.border};
        color: white; padding: 14px 20px; border-radius: 12px;
        z-index: 99999; font-size: 14px; font-weight: 500;
        display: flex; align-items: center; gap: 10px;
        min-width: 240px; max-width: 90vw;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease;
        opacity: 0; pointer-events: none;
    `;
    t.innerHTML = `
        <span style="width:20px;height:20px;border-radius:50%;background:${c.border};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;flex-shrink:0;">${c.icon}</span>
        <span>${message}</span>
    `;
    document.body.appendChild(t);

    requestAnimationFrame(() => {
        t.style.transform = 'translateX(-50%) translateY(0)';
        t.style.opacity = '1';
    });

    const duration = (type === 'error' || type === 'warning') ? 3500 : 2500;
    setTimeout(() => {
        t.style.transform = 'translateX(-50%) translateY(80px)';
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 350);
    }, duration);
}

// ─────────────────────────────────────────────
// 🛡️ ЗАЩИТА ОТ XSS
// ─────────────────────────────────────────────
export function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ─────────────────────────────────────────────
// 💰 ФОРМАТИРОВАНИЕ ЦЕНЫ
// ─────────────────────────────────────────────
export function formatPrice(price) {
    if (!price && price !== 0) return '—';
    return Number(price).toLocaleString('ru-RU') + ' ₽';
}

// ─────────────────────────────────────────────
// ⏰ ФОРМАТИРОВАНИЕ ВРЕМЕНИ
// ─────────────────────────────────────────────
export function timeAgo(dateString) {
    if (!dateString) return '';
    const now = new Date();
    const date = new Date(dateString);
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60)   return 'только что';
    if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} д назад`;

    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function formatDate(dateString) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

export function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────
// 📋 КОПИРОВАНИЕ В БУФЕР
// ─────────────────────────────────────────────
export function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => showToast('Скопировано!', 'success'))
        .catch(() => showToast('Не удалось скопировать', 'error'));
}

// ─────────────────────────────────────────────
// 🔧 ПРОЧИЕ УТИЛИТЫ
// ─────────────────────────────────────────────

// Debounce — задержка вызова функции
export function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// Сжатие изображения
export function compressImage(base64, maxWidth = 800, quality = 0.7) {
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
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(base64);
        img.src = base64;
    });
}
