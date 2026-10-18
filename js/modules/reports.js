// ===== REPORTS — жалобы на объявления =====
import { showToast, escapeHtml } from '../utils.js';
import { getAllAds, saveReport } from '../api.js';
import { currentUser } from './main.js';

window.openReportModal = async function(adId) {
    if (!currentUser) {
        showToast('Войдите, чтобы отправить жалобу', 'error');
        return;
    }

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
            <h2><i data-lucide="flag" width="16" height="16"></i> Пожаловаться на объявление</h2>
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
    if (window.lucide) lucide.createIcons();
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

// Жалобы теперь лежат в reports/{id} — отдельный документ на жалобу
// (см. подробное объяснение в api.js рядом с saveReport). Раньше это
// была read-modify-write операция над одним общим документом
// data/reports, а правила требовали право на ЧТЕНИЕ этого документа
// (isModer()) даже для обычного пользователя, который просто хочет
// пожаловаться — из-за этого отправка жалобы гарантированно ломалась
// с permission-denied, как только в документе накапливалось больше
// одной записи. Теперь create ничего не читает заранее.
window.submitReport = async function(adId) {
    const allAds = await getAllAds();
    const ad = allAds.find(a => a.id === adId);
    if (!ad) return;

    if (!currentUser) {
        showToast('Войдите, чтобы отправить жалобу', 'error');
        return;
    }
    
    const reason = document.querySelector('input[name="reportReason"]:checked')?.value || 'other';
    const comment = document.getElementById('reportComment')?.value.trim() || '';
    
    const report = {
        id: Date.now(),
        adId: adId,
        adTitle: ad.title,
        adAuthor: ad.author,
        reporter: currentUser.nickname,
        reason: reason,
        comment: comment,
        server: ad.server,
        status: 'new',
        createdAt: new Date().toISOString()
    };
    
    const success = await saveReport(report);
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
