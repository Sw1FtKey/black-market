// ===== STATE — общее изменяемое состояние между модулями =====
// currentCategory нужен и в feed.js (фильтрация по категориям),
// и в my-ads.js (showMyAds/showFavorites/deleteAd) — поэтому вынесен
// в отдельный модуль с геттером/сеттером, т.к. импортированные
// ES-module биндинги нельзя переприсваивать напрямую.

let currentCategory = 'all';

export function getCurrentCategory() {
    return currentCategory;
}

export function setCurrentCategory(value) {
    currentCategory = value;
}
