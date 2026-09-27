// Данные кэшбэков. Обновляются по скриншотам из банковских приложений.
// cards  — карты: id, bank, name, color (цвет карты), base (% на всё остальное),
//          baseNote (уточнение к базовому %), limit (лимит кэшбэка в месяц, ₽),
//          unit ("₽" по умолчанию или "баллы"/"мили").
// offers — повышенные категории: card (id карты), category, percent,
//          note (необязательно), until (последний день акции, ГГГГ-ММ-ДД; после него скрывается).
window.CASHBACK = {
  demo: false,
  period: "Сентябрь 2026",
  updated: "2026-09-27",
  cards: [
    { id: "yandex-pay", bank: "Яндекс Банк", name: "Карта Пэй", color: "#FC3F1D", base: 1, baseNote: "покупки на кассе", unit: "баллы Плюса" }
  ],
  offers: [
    { card: "yandex-pay", category: "Кафе и рестораны", percent: 5, note: "кафе, бары и рестораны" },
    { card: "yandex-pay", category: "Медицина", percent: 5 },
    { card: "yandex-pay", category: "Спортивные товары", percent: 5 },
    { card: "yandex-pay", category: "Одежда и обувь", percent: 7, note: "не суммируется с категориями", until: "2026-09-30" },
    { card: "yandex-pay", category: "АЗС", percent: 3, note: "через Яндекс Заправки" },
    { card: "yandex-pay", category: "Л'Этуаль", percent: 25, note: "не суммируется с категориями", until: "2026-09-30" },
    { card: "yandex-pay", category: "Луми", percent: 100, note: "Свои Плюсы недели", until: "2026-10-03" }
  ]
};
