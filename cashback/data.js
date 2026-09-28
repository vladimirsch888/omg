// Данные кэшбэков. Обновляются по скриншотам из банковских приложений.
// cards  — карты: id, bank, name, color (цвет карты), base (% на всё остальное),
//          baseNote (уточнение к базовому %), limit (лимит кэшбэка в месяц, ₽),
//          unit ("₽" по умолчанию или "баллы"/"мили"),
//          months ({ "ГГГГ-ММ": { base, baseNote } } — если базовый % меняется по месяцам).
// offers — категории: card (id карты), category, percent, note (необязательно),
//          month ("ГГГГ-ММ" — категория этого месяца; без него действует всегда),
//          until (последний день акции, ГГГГ-ММ-ДД; после него скрывается).
window.CASHBACK = {
  demo: false,
  updated: "2026-09-28",
  cards: [
    { id: "yandex-pay", bank: "Яндекс Банк", name: "Карта Пэй", color: "#7B4DFF", base: 1, baseNote: "покупки на кассе", unit: "баллы Плюса",
      months: { "2026-10": { base: 2, baseNote: "онлайн и на кассе" } } },
    { id: "alfa", bank: "Альфа-Банк", name: "Альфа-Карта", color: "#EF3124" },
    { id: "raif", bank: "Райффайзенбанк", name: "Карта с кэшбэком", color: "#FEE600", base: 1.5 },
    { id: "otp", bank: "ОТП Банк", name: "Карта", color: "#AEEA00", base: 1 },
    { id: "ozon", bank: "Озон Банк", name: "Карта", color: "#005BFF", base: 1 }
  ],
  offers: [
    // Яндекс Банк — сентябрь
    { card: "yandex-pay", month: "2026-09", category: "Кафе и рестораны", percent: 5, note: "кафе, бары и рестораны" },
    { card: "yandex-pay", month: "2026-09", category: "Медицина", percent: 5 },
    { card: "yandex-pay", month: "2026-09", category: "Спортивные товары", percent: 5 },
    { card: "yandex-pay", month: "2026-09", category: "Одежда и обувь", percent: 7, note: "не суммируется с категориями", until: "2026-09-30" },
    { card: "yandex-pay", month: "2026-09", category: "АЗС", percent: 3, note: "через Яндекс Заправки" },

    // Яндекс Банк — октябрь
    { card: "yandex-pay", month: "2026-10", category: "Одежда и обувь", percent: 5 },
    { card: "yandex-pay", month: "2026-10", category: "Электроника", percent: 5 },
    { card: "yandex-pay", month: "2026-10", category: "АЗС", percent: 3, note: "через Яндекс Заправки" },

    // Альфа-Банк — сентябрь
    { card: "alfa", month: "2026-09", category: "Кафе и рестораны", percent: 4 },
    { card: "alfa", month: "2026-09", category: "Одежда и обувь", percent: 5 },
    { card: "alfa", month: "2026-09", category: "Фастфуд", percent: 3 },

    // Альфа-Банк — октябрь
    { card: "alfa", month: "2026-10", category: "Еаптека", percent: 12, note: "онлайн-аптека" },
    { card: "alfa", month: "2026-10", category: "Кафе и рестораны", percent: 4 },
    { card: "alfa", month: "2026-10", category: "Продукты", percent: 1 },
    { card: "alfa", month: "2026-10", category: "Животные", percent: 5, note: "зоомагазины и ветклиники" },


    // ОТП Банк — сентябрь
    { card: "otp", month: "2026-09", category: "АЗС", percent: 5 },
    { card: "otp", month: "2026-09", category: "Медицина", percent: 5, note: "здоровье и медицина" },
    { card: "otp", month: "2026-09", category: "Аптеки", percent: 2 },

    // ОТП Банк — октябрь
    { card: "otp", month: "2026-10", category: "Цифровые товары", percent: 5 },
    { card: "otp", month: "2026-10", category: "Фастфуд", percent: 5 },
    { card: "otp", month: "2026-10", category: "Автозапчасти и аксессуары", percent: 5 },

    // Озон Банк — сентябрь
    { card: "ozon", month: "2026-09", category: "Медицина", percent: 5, note: "медицинские клиники" },
    { card: "ozon", month: "2026-09", category: "Кафе и рестораны", percent: 5, note: "только рестораны" },
    { card: "ozon", month: "2026-09", category: "Фитнес", percent: 5 }
  ]
};
