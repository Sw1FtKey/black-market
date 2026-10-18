// ===== BUSINESS-DATA — справочник конкретных пронумерованных бизнесов =====
// Список составлен по данным вики esports.ru (biznesy-black-russia),
// один общий список на все сервера. Всего 109 записей.
//
// Формат строки:
//   { number, type, location, price, sourcePhoto }
// - number  — номер бизнеса (как в игре)
// - type    — ключ из businessCategory в create-ad.html
// - location — город/расположение (null, если в источнике не указано)
// - price   — гос. стоимость (для справки, не используется в форме
//   объявления напрямую, но может пригодиться позже)
// - sourcePhoto — ВРЕМЕННО прямая ссылка на фото с esports.ru. Используется
//   только как запасной вариант, если своего файла ещё нет. Как только
//   появится файл img/stock/business/{number}.jpg — он автоматически
//   станет приоритетнее (см. getStockPhotoCandidates в create-ad.js).
//   Ссылки на чужой сайт — не идеальный долгосрочный вариант (сайт может
//   их убрать/поменять), но рабочий, пока свои фото не скачаны.
export const BUSINESSES = [
    { number: 121, type: 'clothes', location: 'Нижегородск', price: 5000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-120.jpg' },
    { number: 120, type: 'accessories', location: 'Нижегородск', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-119.jpg' },
    { number: 119, type: 'ammo', location: null, price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-118.jpg' },
    { number: 118, type: 'larek', location: null, price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-117.jpg' },
    { number: 117, type: 'workshop', location: 'Рублевка', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-116.jpg' },
    { number: 112, type: '247', location: 'Нижегородск', price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-111.jpg' },
    { number: 111, type: 'larek', location: 'Нижегородск', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-110.jpg' },
    { number: 110, type: 'snackbar', location: 'Нижегородск', price: 1100000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-109.jpg' },
    { number: 109, type: '247', location: 'Нижегородск', price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-108.jpg' },
    { number: 108, type: '247', location: 'Нижегородск', price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-107.jpg' },
    { number: 107, type: '247', location: null, price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/image-220-1024x483.jpg' },
    { number: 106, type: '247', location: 'Нижегородск', price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-105.jpg' },
    { number: 105, type: 'ammo', location: 'Нижегородск', price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-104.jpg' },
    { number: 104, type: 'workshop', location: 'Нижегородск', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-103.jpg' },
    { number: 103, type: 'pvz', location: 'Нижегородск', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-102.jpg' },
    { number: 102, type: '247', location: 'Нижегородск', price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-101.jpg' },
    { number: 101, type: '247', location: 'Нижегородск', price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-100.jpg' },
    { number: 100, type: '247', location: null, price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-99.jpg' },
    { number: 99, type: '247', location: null, price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-98.jpg' },
    { number: 98, type: '247', location: 'Нижегородск', price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-97.jpg' },
    { number: 97, type: 'pvz', location: 'Рублевка', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-96.jpg' },
    { number: 96, type: 'pvz', location: 'Южный', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-95.jpg' },
    { number: 95, type: 'pvz', location: 'Южный', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-94.jpg' },
    { number: 94, type: 'pvz', location: 'Батырево', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-93.jpg' },
    { number: 93, type: 'pvz', location: 'Бусаево', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-92.jpg' },
    { number: 92, type: 'pvz', location: 'Лыткарино', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-91.jpg' },
    { number: 91, type: 'pvz', location: 'Арзамас', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-90.jpg' },
    { number: 90, type: 'pvz', location: 'Лыткарино', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-89.jpg' },
    { number: 89, type: 'pvz', location: 'Арзамас', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-88.jpg' },
    { number: 88, type: 'workshop', location: 'Южный', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-87.jpg' },
    { number: 87, type: 'workshop', location: 'Лыткарино', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-86.jpg' },
    { number: 86, type: 'workshop', location: 'Бусаево', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-85.jpg' },
    { number: 85, type: 'workshop', location: 'Батырево', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-84.jpg' },
    { number: 84, type: 'workshop', location: 'Арзамас', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-83.jpg' },
    { number: 83, type: '247', location: 'Корякино', price: 1300000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-82.jpg' },
    { number: 82, type: 'fishing', location: 'Лыткарино', price: 2000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-81.jpg' },
    { number: 81, type: 'fishing', location: 'Батырево', price: 2000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-80.jpg' },
    { number: 80, type: 'fishing', location: 'Арзамас', price: 2000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-79.jpg' },
    { number: 79, type: 'fishing', location: 'Южный', price: 2000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-78.jpg' },
    { number: 78, type: 'accessories', location: 'Батырево', price: 5000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-77.jpg' },
    { number: 77, type: 'ammo', location: 'Батырево', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-76.jpg' },
    { number: 76, type: 'carshop', location: 'Южный', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-75.jpg' },
    { number: 75, type: 'larek', location: null, price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-74.jpg' },
    { number: 74, type: 'ammo', location: null, price: 1000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-73.jpg' },
    { number: 73, type: 'clothes', location: null, price: 1000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-72.jpg' },
    { number: 72, type: '247', location: null, price: 1000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-71.jpg' },
    { number: 71, type: 'larek', location: 'Лыткарино', price: 300000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-70.jpg' },
    { number: 70, type: 'accessories', location: 'Лыткарино', price: 800000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-69.jpg' },
    { number: 69, type: 'snackbar', location: 'Лыткарино', price: 800000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-68.jpg' },
    { number: 68, type: 'clothes', location: 'Лыткарино', price: 800000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-67.jpg' },
    { number: 67, type: '247', location: 'Лыткарино', price: 800000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-66.jpg' },
    { number: 66, type: 'ammo', location: 'Лыткарино', price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-65.jpg' },
    { number: 65, type: '247', location: 'Береговой', price: 800000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-64.jpg' },
    { number: 64, type: '247', location: 'Бусаево', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-63.jpg' },
    { number: 63, type: 'club', location: 'Арзамас', price: 15000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-62.jpg' },
    { number: 62, type: 'taxi', location: 'Арзамас', price: 15000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-61.jpg' },
    { number: 61, type: 'taxi', location: 'Батырево', price: 15000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-60.jpg' },
    { number: 60, type: 'taxi', location: 'Южный', price: 15000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-59.jpg' },
    { number: 59, type: '247', location: 'Арзамас', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-58.jpg' },
    { number: 56, type: 'larek', location: 'Арзамас', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-55.jpg' },
    { number: 55, type: 'larek', location: 'Южный', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-54.jpg' },
    { number: 54, type: 'larek', location: 'Южный', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-53.jpg' },
    { number: 53, type: 'larek', location: 'Южный', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-52.jpg' },
    { number: 51, type: 'larek', location: 'Южный', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-50.jpg' },
    { number: 50, type: 'larek', location: 'Батырево', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-49.jpg' },
    { number: 49, type: 'larek', location: 'Батырево', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-48.jpg' },
    { number: 48, type: 'larek', location: 'Лыткарино', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-47.jpg' },
    { number: 47, type: 'larek', location: 'Арзамас', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-46.jpg' },
    { number: 46, type: 'larek', location: 'Арзамас', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-45.jpg' },
    { number: 45, type: 'larek', location: 'Арзамас', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-44.jpg' },
    { number: 44, type: 'larek', location: 'Арзамас', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-43.jpg' },
    { number: 43, type: 'larek', location: 'Арзамас', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-42.jpg' },
    { number: 42, type: 'carshop', location: 'Арзамас', price: 99999999, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-41.jpg' },
    { number: 41, type: '247', location: 'Батырево', price: 450000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-40.jpg' },
    { number: 40, type: '247', location: 'Южный', price: 450000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-39.jpg' },
    { number: 39, type: 'carshop', location: 'Нижегородск', price: 50000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-38.jpg' },
    { number: 38, type: 'snackbar', location: 'Арзамас', price: 700000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-37.jpg' },
    { number: 37, type: '247', location: 'Арзамас', price: 700000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-36.jpg' },
    { number: 36, type: 'tuning_stage', location: 'Арзамас', price: 70000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-35.jpg' },
    { number: 35, type: 'tuning_lowering', location: 'Батырево', price: 70000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-34.jpg' },
    { number: 34, type: 'tuning_tint', location: 'Южный', price: 70000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-33.jpg' },
    { number: 33, type: 'accessories', location: 'Арзамас', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-32.jpg' },
    { number: 32, type: 'accessories', location: 'Южный', price: 10000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-31.jpg' },
    { number: 31, type: 'casino', location: 'Батырево', price: 99999999, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-30.jpg' },
    { number: 29, type: 'carshop', location: 'Батырево', price: 99999999, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-28.jpg' },
    { number: 28, type: 'carshop', location: 'Арзамас', price: 99999999, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-27.jpg' },
    { number: 27, type: '247', location: 'Батырево', price: 450000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-26.jpg' },
    { number: 26, type: '247', location: 'Корякино', price: 450000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-25.jpg' },
    { number: 25, type: '247', location: 'Лыткарино', price: 350000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-24.jpg' },
    { number: 24, type: '247', location: 'Арзамас', price: 700000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-23.jpg' },
    { number: 22, type: '247', location: 'Южный', price: 450000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/image-219.jpg' },
    { number: 21, type: '247', location: 'Южный', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-20.jpg' },
    { number: 20, type: 'ammo', location: 'Южный', price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-19.jpg' },
    { number: 19, type: '247', location: 'Южный', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-18.jpg' },
    { number: 18, type: 'snackbar', location: 'Арзамас', price: 900000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-17.jpg' },
    { number: 17, type: '247', location: 'Батырево', price: 450000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-16.jpg' },
    { number: 16, type: '247', location: 'Батырево', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-15.jpg' },
    { number: 15, type: 'ammo', location: 'Арзамас', price: 1200000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-14.jpg' },
    { number: 13, type: 'snackbar', location: 'Арзамас', price: 1000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-12.jpg' },
    { number: 12, type: 'snackbar', location: 'Арзамас', price: 1000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-11.jpg' },
    { number: 10, type: 'clothes', location: 'Арзамас', price: 5000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-9.jpg' },
    { number: 9, type: '247', location: 'Арзамас', price: 1000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-8.jpg' },
    { number: 8, type: 'snackbar', location: 'Батырево', price: 650000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/image-218.jpg' },
    { number: 7, type: '247', location: 'Батырево', price: 650000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-6.jpg' },
    { number: 6, type: 'clothes', location: 'Батырево', price: 2000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-5.jpg' },
    { number: 5, type: 'snackbar', location: 'Батырево', price: 500000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-4.jpg' },
    { number: 4, type: '247', location: 'Южный', price: 700000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-3.jpg' },
    { number: 3, type: 'snackbar', location: 'Южный', price: 900000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-2.jpg' },
    { number: 2, type: 'clothes', location: 'Южный', price: 5000000, sourcePhoto: 'https://esports.ru/wp-content/uploads/2026/06/brbiz-1.jpg' },
];

export const BUSINESS_TYPE_NAMES = {
    '247': 'Магазин 24/7', gas: 'АЗС', sk: 'СК', tk: 'ТК', ammo: 'Магазин оружия',
    accessories: 'Магазин аксессуаров', clothes: 'Магазин одежды', workshop: 'Мастерская',
    pvz: 'Пункт выдачи заказов', fishing: 'Рыболовный магазин', sto: 'СТО',
    techcenter: 'Тех. центр', snackbar: 'Закусочная', club: 'Ночной клуб',
    taxi: 'Таксопарк', styling: 'Стайлинг центр', tireshop: 'Шиномонтаж',
    larek: 'Столовая (ларёк)', carshop: 'Автосалон', casino: 'Казино',
    tuning_stage: 'Тюнинг стейджа', tuning_lowering: 'Тюнинг занижения',
    tuning_tint: 'Тюнинг тонировки'
};

// Текст для поиска в автокомплите — "12 Мастерская Арзамас" и т.п.,
// чтобы можно было найти по номеру ИЛИ по типу/расположению.
export function businessSearchText(b) {
    return `${b.number} ${BUSINESS_TYPE_NAMES[b.type] || b.type} ${b.location || ''}`.toLowerCase();
}

// Локальный путь к фото бизнеса, если оно уже скачано (приоритет №1
// в цепочке кандидатов в create-ad.js), иначе — sourcePhoto как запасной.
export function businessPhotoCandidates(b) {
    return [
        `img/stock/business/${b.number}.jpg`,
        `img/stock/business/${b.type}.jpg`,
        b.sourcePhoto,
        'img/stock/business.jpg'
    ].filter(Boolean);
}
