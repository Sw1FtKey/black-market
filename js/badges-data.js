// ===== BADGES-DATA — единый список бейджей и ролей =====
// Раньше BADGES_CONFIG/RARITY_LABELS/ROLE_LABELS были задублированы в
// js/modules/sidebar.js и в profile.html — с теми же граблями, что
// раньше были со списком серверов (см. комментарий в servers-data.js):
// стоит добавить/поменять бейдж в одном месте — и он тут же расходится
// со вторым. Теперь один источник правды, импортируется в оба места.

export const BADGES_CONFIG = {
    // Этап 2 — Бейджи первой волны
    zbt_member:    { icon: '🔥', label: 'Участник ЗБТ',         desc: 'Принял участие в закрытом бета-тестировании Black Market',  rarity: 'rare',      color: '#ff6b35' },
    first_100:     { icon: '⚡', label: 'Первые 100',            desc: 'Вошёл в первые 100 пользователей платформы',               rarity: 'legendary', color: '#ffd700' },
    founder:       { icon: '👑', label: 'Основатель',            desc: 'Один из основателей сообщества Black Market',              rarity: 'legendary', color: '#ffd700' },
    administrator: { icon: '🛡️', label: 'Администратор',         desc: 'Администратор проекта Black Market',                       rarity: 'special',   color: '#e05fff' },
    moderator:     { icon: '🔨', label: 'Модератор',             desc: 'Модератор платформы Black Market',                         rarity: 'special',   color: '#5b9dff' },
    // Этап 3 — Репутационные
    veteran:       { icon: '⭐', label: 'Ветеран Black Market',   desc: 'Долгожитель платформы',                                    rarity: 'rare',      color: '#a8e063' },
    verified:      { icon: '🛡️', label: 'Проверенный продавец',  desc: 'Подтверждённый надёжный продавец',                         rarity: 'uncommon',  color: '#4ecdc4' },
    trusted:       { icon: '💎', label: 'Надёжный продавец',     desc: 'Высокий рейтинг и много положительных отзывов',            rarity: 'rare',      color: '#74b9ff' },
    top_seller:    { icon: '🏆', label: 'Топ продавец месяца',   desc: 'Лучший продавец по итогам месяца',                         rarity: 'legendary', color: '#ffd700' },
    // Этап 4 — Достижения сообщества
    bug_hunter:    { icon: '🐞', label: 'Охотник за багами',     desc: 'Нашёл и сообщил о важном баге',                            rarity: 'uncommon',  color: '#ff7675' },
    active_tester: { icon: '🏅', label: 'Активный тестер',       desc: 'Активно участвовал в тестировании платформы',              rarity: 'uncommon',  color: '#fdcb6e' },
    zbt_legend:    { icon: '🏆', label: 'Легенда ЗБТ',           desc: 'Внёс выдающийся вклад в развитие проекта во время ЗБТ',   rarity: 'legendary', color: '#ffd700' },
    early_bird:    { icon: '🚀', label: 'Ранний сторонник',      desc: 'Поддержал проект на самом раннем этапе',                   rarity: 'rare',      color: '#a29bfe' },
};

export const RARITY_LABELS = {
    uncommon:  { label: 'Необычный', color: '#4ecdc4' },
    rare:      { label: 'Редкий',    color: '#74b9ff' },
    legendary: { label: 'Легендарный', color: '#ffd700' },
    special:   { label: 'Особый',    color: '#e05fff' },
};

export const ROLE_LABELS = {
    owner: { text: 'Владелец', cls: 'owner' },
    admin: { text: 'Администратор', cls: 'admin' },
    moder: { text: 'Модератор', cls: 'moder' }
};
