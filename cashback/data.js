// Данные кэшбэков. Обновляются по скриншотам из банковских приложений.
// cards  — карты: id, bank, name, color (цвет карты), base (% на всё остальное),
//          limit (лимит кэшбэка в месяц, ₽), unit ("₽" по умолчанию или "баллы"/"мили").
// offers — повышенные категории: card (id карты), category, percent, note (необязательно).
window.CASHBACK = {
  demo: true,
  period: "Октябрь 2026",
  updated: "2026-09-27",
  cards: [
    { id: "tbank", bank: "Т-Банк", name: "Black", color: "#FFDD2D", base: 1, limit: 5000 },
    { id: "alfa", bank: "Альфа-Банк", name: "Альфа-Карта", color: "#EF3124", base: 1, limit: 5000 },
    { id: "sber", bank: "Сбер", name: "СберКарта", color: "#21A038", base: 0.5, unit: "бонусы Спасибо" },
    { id: "vtb", bank: "ВТБ", name: "Мультикарта", color: "#0A2896", base: 1, limit: 3000 },
    { id: "ozon", bank: "Озон Банк", name: "Ozon Карта", color: "#005BFF", base: 1 }
  ],
  offers: [
    { card: "tbank", category: "Аптеки", percent: 5 },
    { card: "tbank", category: "Кафе и рестораны", percent: 5 },
    { card: "tbank", category: "Такси", percent: 7 },
    { card: "tbank", category: "Супермаркеты", percent: 3 },
    { card: "alfa", category: "АЗС", percent: 5 },
    { card: "alfa", category: "Супермаркеты", percent: 5 },
    { card: "alfa", category: "Одежда и обувь", percent: 7 },
    { card: "alfa", category: "Кафе и рестораны", percent: 3 },
    { card: "sber", category: "Кино и театры", percent: 10 },
    { card: "sber", category: "Такси", percent: 5 },
    { card: "sber", category: "Аптеки", percent: 3 },
    { card: "vtb", category: "Транспорт", percent: 10, note: "метро, электрички, автобусы" },
    { card: "vtb", category: "АЗС", percent: 3 },
    { card: "vtb", category: "Красота", percent: 5 },
    { card: "ozon", category: "Маркетплейс Ozon", percent: 5 },
    { card: "ozon", category: "Супермаркеты", percent: 2 }
  ]
};
