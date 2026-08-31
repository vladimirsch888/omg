import { prisma } from "../../prisma";

/**
 * Demo data lives entirely behind the `isDemo` flag on Client, Project,
 * Operation, Request and TimeEntry. This is the single place that defines
 * what a "demo company" looks like — the /admin/settings "Наполнить
 * демо-данными" button and the local `prisma/seed.ts` dev script both call
 * `seedDemoData` so the two can never drift apart.
 *
 * MAINTENANCE POLICY: whenever a new feature is added that introduces a new
 * model, category, or report dimension, extend this file so a fresh demo
 * seed exercises it too — the goal is that demo data is never empty or
 * flat for any feature currently in the product.
 */

function dateInPast(monthsAgo: number, day: number): Date {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(day);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function loadDictionaryMaps(organizationId: string) {
  const types = await prisma.dictionaryType.findMany({
    where: { organizationId },
    include: { values: true },
  });
  const maps: Record<string, Record<string, string>> = {};
  for (const type of types) {
    maps[type.code] = {};
    for (const value of type.values) {
      maps[type.code][value.code] = value.id;
    }
  }
  return {
    category: maps.operation_category ?? {},
    projectType: maps.project_type ?? {},
    paymentMethod: maps.payment_method ?? {},
    requestType: maps.request_type ?? {},
  };
}

interface RevenueStream {
  projectKey: string;
  type: "INCOME" | "EXPENSE";
  categoryCode: string;
  baseAmount: number;
  jitter: number;
  monthsBack: number;
  counterparty: string;
  description: string;
}

export async function seedDemoData(organizationId: string, userId: string) {
  const dict = await loadDictionaryMaps(organizationId);

  const clientRomashka = await prisma.client.create({
    data: {
      organizationId,
      isDemo: true,
      name: 'ООО "Ромашка"',
      legalName: 'ООО "Ромашка"',
      inn: "7701234567",
      contactPerson: "Иван Петров",
      contactEmail: "ivan@romashka.example",
      status: "ACTIVE",
    },
  });
  const clientSfera = await prisma.client.create({
    data: {
      organizationId,
      isDemo: true,
      name: 'ООО "Сфера Логистик"',
      legalName: 'ООО "Сфера Логистик"',
      inn: "7802345678",
      contactPerson: "Марина Соколова",
      contactEmail: "sokolova@sfera-log.example",
      status: "ACTIVE",
    },
  });
  const clientKuznetsov = await prisma.client.create({
    data: {
      organizationId,
      isDemo: true,
      name: "ИП Кузнецов А.С.",
      contactPerson: "Алексей Кузнецов",
      contactEmail: "kuznetsov@example.com",
      status: "PAUSED",
      notes: "Приостановил подписку три месяца назад",
    },
  });
  const clientTechnopark = await prisma.client.create({
    data: {
      organizationId,
      isDemo: true,
      name: 'ООО "Технопарк Инвест"',
      legalName: 'ООО "Технопарк Инвест"',
      inn: "7703456789",
      contactPerson: "Дарья Волкова",
      contactEmail: "volkova@technopark-invest.example",
      status: "ACTIVE",
    },
  });

  const projectRomashkaMain = await prisma.project.create({
    data: {
      organizationId,
      isDemo: true,
      clientId: clientRomashka.id,
      name: "Внедрение и сопровождение CRM",
      typeValueId: dict.projectType.implementation ?? null,
      hourlyRate: 2500,
    },
  });
  const projectRomashkaLicense = await prisma.project.create({
    data: {
      organizationId,
      isDemo: true,
      clientId: clientRomashka.id,
      parentId: projectRomashkaMain.id,
      name: "Лицензия amoCRM (10 мест)",
      typeValueId: dict.projectType.license_amocrm ?? null,
    },
  });
  const projectSfera = await prisma.project.create({
    data: {
      organizationId,
      isDemo: true,
      clientId: clientSfera.id,
      name: "Лицензия Wazzup",
      typeValueId: dict.projectType.license_wazzup ?? null,
    },
  });
  const projectKuznetsovMain = await prisma.project.create({
    data: {
      organizationId,
      isDemo: true,
      clientId: clientKuznetsov.id,
      name: "Сопровождение NOVA",
      typeValueId: dict.projectType.support ?? null,
      status: "PAUSED",
    },
  });
  const projectKuznetsovLicense = await prisma.project.create({
    data: {
      organizationId,
      isDemo: true,
      clientId: clientKuznetsov.id,
      parentId: projectKuznetsovMain.id,
      name: "Лицензия NOVA",
      typeValueId: dict.projectType.license_nova ?? null,
      status: "PAUSED",
    },
  });
  const projectTechnopark = await prisma.project.create({
    data: {
      organizationId,
      isDemo: true,
      clientId: clientTechnopark.id,
      name: "Внедрение amoCRM",
      typeValueId: dict.projectType.implementation ?? null,
      hourlyRate: 3000,
    },
  });

  const projectByKey: Record<string, string> = {
    romashkaMain: projectRomashkaMain.id,
    romashkaLicense: projectRomashkaLicense.id,
    sfera: projectSfera.id,
    kuznetsovMain: projectKuznetsovMain.id,
    kuznetsovLicense: projectKuznetsovLicense.id,
    technopark: projectTechnopark.id,
  };

  // Monthly recurring income/expense streams. `monthsBack` = how many months
  // of history to generate, counting back from the current month.
  const streams: RevenueStream[] = [
    { projectKey: "romashkaLicense", type: "INCOME", categoryCode: "license_amocrm", baseAmount: 45000, jitter: 5000, monthsBack: 8, counterparty: 'ООО "Ромашка"', description: "Оплата лицензии amoCRM на 10 пользователей" },
    { projectKey: "romashkaLicense", type: "EXPENSE", categoryCode: "license_cost", baseAmount: 30000, jitter: 0, monthsBack: 8, counterparty: "amoCRM (официальный партнёр)", description: "Закупка лицензий у поставщика" },
    { projectKey: "romashkaMain", type: "INCOME", categoryCode: "client_support", baseAmount: 80000, jitter: 8000, monthsBack: 8, counterparty: 'ООО "Ромашка"', description: "Сопровождение CRM за месяц" },
    { projectKey: "sfera", type: "INCOME", categoryCode: "license_wazzup", baseAmount: 18000, jitter: 2000, monthsBack: 6, counterparty: 'ООО "Сфера Логистик"', description: "Оплата лицензии Wazzup" },
    { projectKey: "sfera", type: "EXPENSE", categoryCode: "license_cost", baseAmount: 12000, jitter: 0, monthsBack: 6, counterparty: "Wazzup (поставщик)", description: "Закупка лицензии Wazzup" },
    { projectKey: "kuznetsovLicense", type: "INCOME", categoryCode: "license_nova", baseAmount: 25000, jitter: 0, monthsBack: 3, counterparty: "ИП Кузнецов А.С.", description: "Оплата лицензии NOVA" },
    { projectKey: "kuznetsovMain", type: "INCOME", categoryCode: "client_support", baseAmount: 20000, jitter: 0, monthsBack: 3, counterparty: "ИП Кузнецов А.С.", description: "Сопровождение NOVA" },
    { projectKey: "technopark", type: "INCOME", categoryCode: "client_work", baseAmount: 150000, jitter: 30000, monthsBack: 5, counterparty: 'ООО "Технопарк Инвест"', description: "Работы по внедрению amoCRM" },
  ];

  // Company-level overhead, not tied to a single client/project.
  const overheadStreams: Array<Omit<RevenueStream, "projectKey">> = [
    { type: "EXPENSE", categoryCode: "salary", baseAmount: 220000, jitter: 0, monthsBack: 8, counterparty: "Штат сотрудников", description: "Заработная плата" },
    { type: "EXPENSE", categoryCode: "hosting_software", baseAmount: 9000, jitter: 1000, monthsBack: 8, counterparty: "Various SaaS", description: "Хостинг и корпоративное ПО" },
    { type: "EXPENSE", categoryCode: "marketing", baseAmount: 25000, jitter: 10000, monthsBack: 5, counterparty: "Рекламное агентство", description: "Продвижение и реклама" },
    { type: "EXPENSE", categoryCode: "office_admin", baseAmount: 15000, jitter: 0, monthsBack: 8, counterparty: "Аренда офиса", description: "Аренда и административные расходы" },
  ];

  const operationsToCreate: any[] = [];
  function pushOperationsForStream(stream: RevenueStream | Omit<RevenueStream, "projectKey">, projectId: string | null) {
    for (let m = stream.monthsBack; m >= 1; m--) {
      const amount = stream.baseAmount + (stream.jitter ? Math.round((Math.random() - 0.5) * 2 * stream.jitter) : 0);
      const accrualDate = dateInPast(m, 5);
      operationsToCreate.push({
        organizationId,
        isDemo: true,
        projectId,
        type: stream.type,
        status: "ACTUAL",
        amount: Math.max(amount, 1000),
        accrualDate,
        paymentDate: accrualDate,
        categoryValueId: dict.category[stream.categoryCode] ?? null,
        paymentMethodValueId: dict.paymentMethod.bank_account ?? null,
        counterparty: stream.counterparty,
        description: stream.description,
        createdById: userId,
      });
    }
  }
  for (const stream of streams) pushOperationsForStream(stream, projectByKey[stream.projectKey]);
  for (const stream of overheadStreams) pushOperationsForStream(stream, null);

  // One planned (not yet paid) operation, to demonstrate PnL vs. ДДС diverging.
  operationsToCreate.push({
    organizationId,
    isDemo: true,
    projectId: projectByKey.technopark,
    type: "INCOME",
    status: "PLANNED",
    amount: 90000,
    accrualDate: dateInPast(0, 20),
    paymentDate: null,
    categoryValueId: dict.category.client_work ?? null,
    counterparty: 'ООО "Технопарк Инвест"',
    description: "Второй этап внедрения (ожидает оплаты)",
    createdById: userId,
  });

  await prisma.operation.createMany({ data: operationsToCreate });

  const requests = await Promise.all([
    prisma.request.create({
      data: {
        organizationId,
        isDemo: true,
        projectId: projectByKey.romashkaMain,
        title: "Настроить автоматическую воронку продаж",
        status: "DONE",
        priority: "HIGH",
        requestTypeValueId: dict.requestType.integration ?? null,
        closedAt: dateInPast(1, 15),
      },
    }),
    prisma.request.create({
      data: {
        organizationId,
        isDemo: true,
        projectId: projectByKey.romashkaMain,
        title: "Обучить менеджеров работе с amoCRM",
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        requestTypeValueId: dict.requestType.training ?? null,
      },
    }),
    prisma.request.create({
      data: {
        organizationId,
        isDemo: true,
        projectId: projectByKey.sfera,
        title: "Ошибка синхронизации сообщений Wazzup",
        status: "OPEN",
        priority: "HIGH",
        requestTypeValueId: dict.requestType.bug ?? null,
      },
    }),
    prisma.request.create({
      data: {
        organizationId,
        isDemo: true,
        projectId: projectByKey.technopark,
        title: "Добавить кастомное поле в карточку сделки",
        status: "DONE",
        priority: "LOW",
        requestTypeValueId: dict.requestType.feature ?? null,
        closedAt: dateInPast(2, 10),
      },
    }),
  ]);

  const timeEntries: any[] = [];
  const [reqDone, reqInProgress, , reqFeature] = requests;
  const timeEntryPlan: Array<{ projectId: string; requestId?: string; hours: number; monthsAgo: number; day: number; description: string }> = [
    { projectId: projectByKey.romashkaMain, requestId: reqDone.id, hours: 6, monthsAgo: 1, day: 14, description: "Настройка воронки и автоматизаций" },
    { projectId: projectByKey.romashkaMain, requestId: reqInProgress.id, hours: 3, monthsAgo: 0, day: 3, description: "Первая сессия обучения менеджеров" },
    { projectId: projectByKey.romashkaMain, hours: 2, monthsAgo: 0, day: 10, description: "Плановая консультация по CRM" },
    { projectId: projectByKey.technopark, requestId: reqFeature.id, hours: 5, monthsAgo: 2, day: 8, description: "Доработка карточки сделки" },
    { projectId: projectByKey.technopark, hours: 8, monthsAgo: 1, day: 20, description: "Внедрение второго этапа" },
    { projectId: projectByKey.sfera, hours: 1.5, monthsAgo: 0, day: 5, description: "Диагностика ошибки синхронизации" },
  ];
  for (const entry of timeEntryPlan) {
    timeEntries.push({
      organizationId,
      isDemo: true,
      projectId: entry.projectId,
      requestId: entry.requestId ?? null,
      userId,
      date: dateInPast(entry.monthsAgo, entry.day),
      hours: entry.hours,
      description: entry.description,
    });
  }
  await prisma.timeEntry.createMany({ data: timeEntries });

  return {
    clients: 4,
    projects: 6,
    operations: operationsToCreate.length,
    requests: requests.length,
    timeEntries: timeEntries.length,
  };
}

export async function clearDemoData(organizationId: string) {
  // Sequential and in this order on purpose: Operation and TimeEntry->Request
  // relations aren't all cascading deletes, so deleting parents first could
  // race with child cleanup if run concurrently.
  const operations = await prisma.operation.deleteMany({ where: { organizationId, isDemo: true } });
  const timeEntries = await prisma.timeEntry.deleteMany({ where: { organizationId, isDemo: true } });
  const requests = await prisma.request.deleteMany({ where: { organizationId, isDemo: true } });
  const projects = await prisma.project.deleteMany({ where: { organizationId, isDemo: true } });
  const clients = await prisma.client.deleteMany({ where: { organizationId, isDemo: true } });
  return {
    operations: operations.count,
    timeEntries: timeEntries.count,
    requests: requests.count,
    projects: projects.count,
    clients: clients.count,
  };
}

export async function getDemoStatus(organizationId: string) {
  const [clients, projects, operations, requests, timeEntries] = await Promise.all([
    prisma.client.count({ where: { organizationId, isDemo: true } }),
    prisma.project.count({ where: { organizationId, isDemo: true } }),
    prisma.operation.count({ where: { organizationId, isDemo: true } }),
    prisma.request.count({ where: { organizationId, isDemo: true } }),
    prisma.timeEntry.count({ where: { organizationId, isDemo: true } }),
  ]);
  const total = clients + projects + operations + requests + timeEntries;
  return { hasDemoData: total > 0, clients, projects, operations, requests, timeEntries };
}
