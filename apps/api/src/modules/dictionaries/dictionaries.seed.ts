import { prisma } from "../../prisma";

// Default reference books created for every new organization.
// Users can rename, deactivate or extend any of these values from the admin
// panel, and create entirely new dictionary types ("sections") of their own.
const DEFAULT_DICTIONARIES: Array<{
  code: string;
  name: string;
  description: string;
  isSystem?: boolean;
  values: Array<{ code: string; name: string; color?: string }>;
}> = [
  {
    code: "operation_category",
    name: "Категории операций",
    description: "Категории доходных и расходных операций",
    values: [
      { code: "license_amocrm", name: "Лицензии amoCRM", color: "#2563eb" },
      { code: "license_wazzup", name: "Лицензии Wazzup", color: "#7c3aed" },
      { code: "license_nova", name: "Лицензии NOVA", color: "#0891b2" },
      { code: "client_work", name: "Работы по клиенту", color: "#16a34a" },
      { code: "client_support", name: "Сопровождение клиента", color: "#059669" },
      { code: "salary", name: "Зарплата / подрядчики", color: "#dc2626" },
      { code: "license_cost", name: "Закупка лицензий у поставщика", color: "#ea580c" },
      { code: "hosting_software", name: "Хостинг / ПО / сервисы", color: "#9333ea" },
      { code: "marketing", name: "Маркетинг и реклама", color: "#db2777" },
      { code: "office_admin", name: "Офис / администрирование", color: "#64748b" },
      { code: "taxes", name: "Налоги и сборы", color: "#78716c" },
      { code: "other", name: "Прочее", color: "#71717a" },
    ],
  },
  {
    code: "project_type",
    name: "Типы проектов",
    description: "Тип проекта / подпроекта",
    values: [
      { code: "license_amocrm", name: "Лицензия amoCRM", color: "#2563eb" },
      { code: "license_wazzup", name: "Лицензия Wazzup", color: "#7c3aed" },
      { code: "license_nova", name: "Лицензия NOVA", color: "#0891b2" },
      { code: "implementation", name: "Внедрение / работы", color: "#16a34a" },
      { code: "support", name: "Сопровождение", color: "#059669" },
    ],
  },
  {
    code: "payment_method",
    name: "Способы оплаты",
    description: "Как проведён платёж",
    values: [
      { code: "bank_account", name: "Расчётный счёт" },
      { code: "card", name: "Карта" },
      { code: "cash", name: "Наличные" },
      { code: "e_wallet", name: "Электронный кошелёк" },
    ],
  },
  {
    code: "request_type",
    name: "Типы заявок",
    description: "Тип заявки от клиента",
    values: [
      { code: "bug", name: "Ошибка" },
      { code: "feature", name: "Доработка" },
      { code: "consultation", name: "Консультация" },
      { code: "integration", name: "Интеграция" },
      { code: "training", name: "Обучение" },
    ],
  },
];

export async function seedDefaultDictionaries(organizationId: string) {
  for (const dict of DEFAULT_DICTIONARIES) {
    const type = await prisma.dictionaryType.create({
      data: {
        organizationId,
        code: dict.code,
        name: dict.name,
        description: dict.description,
        isSystem: true,
      },
    });
    await prisma.dictionaryValue.createMany({
      data: dict.values.map((v, index) => ({
        dictionaryTypeId: type.id,
        organizationId,
        code: v.code,
        name: v.name,
        color: v.color,
        sortOrder: index,
      })),
    });
  }
}
