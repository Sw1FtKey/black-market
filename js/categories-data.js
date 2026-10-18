// ===== CATEGORIES-DATA — единый список категорий объявлений =====
// Раньше список (имя категории + цвет) был задублирован в 8 файлах,
// причём дважды даже внутри одного feed.js. Теперь один источник правды —
// импортируется везде, где нужен цвет/название/порядок категорий.

export const CATEGORIES = [
    { key: 'houses',      sidebarLabel: 'Дома',        badgeLabel: 'Дом',        color: '#4ecdc4', icon: 'home' },
    { key: 'garages',     sidebarLabel: 'Гаражи',       badgeLabel: 'Гараж',      color: '#45b7d1', icon: 'parking-circle' },
    { key: 'cars',        sidebarLabel: 'Машины',       badgeLabel: 'Транспорт',  color: '#ff6b6b', icon: 'car' },
    { key: 'plates',      sidebarLabel: 'Номера',       badgeLabel: 'Номерной знак', color: '#ffd700', icon: 'rectangle-horizontal' },
    { key: 'business',    sidebarLabel: 'Бизнесы',      badgeLabel: 'Бизнес',     color: '#f9ca24', icon: 'building-2' },
    { key: 'accessories', sidebarLabel: 'Аксессуары',   badgeLabel: 'Аксессуар',  color: '#a55eea', icon: 'gem' },
    { key: 'skins',       sidebarLabel: 'Скины',        badgeLabel: 'Скин',       color: '#26de81', icon: 'shirt' },
    { key: 'other',       sidebarLabel: 'Разное',       badgeLabel: 'Разное',     color: '#778ca3', icon: 'package' },
];

// Быстрые словари-хелперы (производные от CATEGORIES, не дублировать вручную)
export const CATEGORY_COLORS = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]));
export const CATEGORY_BADGE_NAMES = Object.fromEntries(CATEGORIES.map(c => [c.key, c.badgeLabel]));
export const CATEGORY_SIDEBAR_NAMES = Object.fromEntries(CATEGORIES.map(c => [c.key, c.sidebarLabel]));
export const CATEGORY_ICONS = Object.fromEntries(CATEGORIES.map(c => [c.key, c.icon]));
