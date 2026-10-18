// ===== PLATES-DATA — конфигурация форматов номерных знаков =====
// Единственный источник правды по форматам: разрешённые буквы, структура
// полей (порядок и длина), диапазон региона. Используется и формой
// создания/редактирования объявления (plate-render.js рисует знак и
// накладывает поля ввода), и фильтрами (feed.js), и валидацией (create-ad.js).
//
// ВАЖНО про валидацию:
// - Цифры — любые, без ограничений (в т.ч. одинаковые: "0000", "777" и т.д.)
// - Буквы — строго из списка letters ниже для страны, но в любом порядке
//   и с повторами (например "ООО" — валидно, если "О" есть в списке).
// - Структура полей (сколько букв/цифр и в каком порядке) — фиксированная,
//   меняется только между странами, не в рамках одной страны.

export const PLATE_FORMATS = {
    ru: {
        label: 'Россия',
        flagEmoji: '🇷🇺',
        letters: ['А','В','Е','К','М','Н','О','Р','С','Т','У','Х'],
        // Структура: 1 буква + 3 цифры + 2 буквы + регион (00-999)
        fields: [
            { key: 'l1',     type: 'letter', length: 1 },
            { key: 'd1',     type: 'digit',  length: 3 },
            { key: 'l2',     type: 'letter', length: 2 },
            { key: 'region', type: 'region', length: 3, min: 0, max: 999 }
        ],
        stripSide: 'right',
        stripColor: '#0039a6',
        stripLabel: 'RUS',
        // Готовая картинка бланка — координаты ниже промерены по пикселям
        // на самой картинке (866x288), не подобраны на глаз:
        // Промеры по реальным пикселям картинки (у неё прозрачные поля
        // вокруг — артефакт удаления фона, реальная рамка НЕ занимает
        // весь холст 866x288):
        // - видимая рамка:左 x=14, верх y=41, право x=852, низ y=240
        // - разделитель перед RUS-блоком: x≈681
        // - надпись "RUS" начинается на y≈171 (из 288)
        // regionY/regionHeight — зона под регион: от чуть ниже верхней
        // рамки (41) до чуть выше RUS (171). contentRight — правая
        // граница РЕАЛЬНОЙ рамки (852), не край холста (866) — иначе
        // регион по ширине уезжает в прозрачную пустоту за рамкой.
        bgImage: 'img/plates/ru.png',
        vbWidth: 866,
        vbHeight: 288,
        dividerX: 681,
        contentRight: 852,
        regionY: 49,
        regionHeight: 114
    },
    by: {
        label: 'Беларусь',
        flagEmoji: '🇧🇾',
        letters: ['А','В','Е','І','К','М','Н','О','Р','С','Т','Х'],
        // Структура: 4 цифры + 2 буквы + регион (0-7)
        fields: [
            { key: 'd1',     type: 'digit',  length: 4 },
            { key: 'l1',     type: 'letter', length: 2 },
            { key: 'region', type: 'region', length: 1, min: 0, max: 7 }
        ],
        stripSide: 'left',
        stripColor: '#007a3d',
        stripLabel: 'BY',
        // На картинке нет разделителя вообще (в отличие от RU/KZ) — регион
        // верстается в общей строке вместе с остальными символами, без
        // отдельного бокса, с тире перед ним ("1111 ВВ-7", regionDash).
        // Подпись "BY" напечатана в углу слева (x≈55-90) — резервируем
        // отступ, чтобы номер не наезжал на неё. Буквы и цифры здесь
        // одного размера (в отличие от РФ, где буквы мельче) —
        // letterSizeRatio:1 переопределяет общий LETTER_SIZE_RATIO.
        bgImage: 'img/plates/by.png',
        vbWidth: 866,
        vbHeight: 288,
        mergeRegionInline: true,
        regionDash: true,
        regionDashAfter: 'l1', // тире появляется только когда вторая буква (l1) введена целиком
        letterSizeRatio: 1,
        labelReserveLeft: 105
    },
    ua: {
        label: 'Украина',
        flagEmoji: '🇺🇦',
        letters: ['А','В','С','Е','Н','I','К','М','О','Р','Т','Х'],
        // Структура: 2 буквы + 4 цифры + 2 буквы (без отдельного региона)
        fields: [
            { key: 'l1', type: 'letter', length: 2 },
            { key: 'd1', type: 'digit',  length: 4 },
            { key: 'l2', type: 'letter', length: 2 }
        ],
        stripSide: 'left',
        stripColor: '#0057b7',
        stripLabel: 'UA',
        // Синяя полоса с "UA" на картинке доходит до x≈93 — резервируем
        // отступ слева, чтобы номер не наезжал на неё. Региона у Украины
        // нет по формату, разделитель не нужен. Буквы и цифры одного
        // размера (как у BY) — letterSizeRatio:1 переопределяет общий
        // LETTER_SIZE_RATIO (который мельчит буквы только у РФ).
        bgImage: 'img/plates/ua.png',
        vbWidth: 866,
        vbHeight: 288,
        labelReserveLeft: 108,
        letterSizeRatio: 1
    },
    kz: {
        label: 'Казахстан',
        flagEmoji: '🇰🇿',
        letters: ['A','B','C','D','E','H','J','K','M','N','R','X','Z'],
        // Структура: 3 цифры + 3 буквы + регион (00-999)
        fields: [
            { key: 'd1',     type: 'digit',  length: 3 },
            { key: 'l1',     type: 'letter', length: 3 },
            { key: 'region', type: 'region', length: 3, min: 0, max: 999 }
        ],
        stripSide: 'left',
        stripColor: '#00afca',
        stripLabel: 'KZ',
        // Разделитель на картинке x≈682, сам блок региона пустой (без
        // подписи внутри) — регион по центру блока. Подпись "KZ"
        // напечатана в углу слева (x≈55-95) — резервируем отступ.
        // У картинки, как и у RU/BY/UA, прозрачные поля вокруг (реальная
        // рамка не занимает весь холст): верх y≈41, низ y≈241, право
        // x≈852 — эти границы и берём, а не край холста 0/288/866.
        bgImage: 'img/plates/kz.png',
        vbWidth: 866,
        vbHeight: 288,
        dividerX: 682,
        contentRight: 852,
        regionY: 51,
        regionHeight: 180,
        labelReserveLeft: 110
    }
};

// Проверка одного символа на допустимость для конкретного поля страны
export function isCharAllowed(countryCode, field, char) {
    if (field.type === 'digit' || field.type === 'region') {
        return /[0-9]/.test(char);
    }
    if (field.type === 'letter') {
        const fmt = PLATE_FORMATS[countryCode];
        return fmt ? fmt.letters.includes(char.toUpperCase()) : false;
    }
    return false;
}
