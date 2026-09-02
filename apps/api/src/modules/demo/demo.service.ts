import { prisma } from "../../prisma";
import { billSubscription } from "../subscriptions/subscriptions.service";
import { recordSale } from "../sales/sales.service";

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

  // Product catalog ("товарная матрица") — a handful of licenses across the
  // vendors, with different durations and vendor-share/tax terms, so the
  // subscription feature has something realistic to bill from.
  const productAmoCRM = await prisma.licenseProduct.create({
    data: {
      organizationId,
      isDemo: true,
      name: "amoCRM Professional (10 мест)",
      categoryValueId: dict.category.license_amocrm ?? null,
      defaultPrice: 45000,
      defaultDurationMonths: 1,
      defaultVendorSharePercent: 50,
      defaultTaxable: true,
    },
  });
  const productWazzup = await prisma.licenseProduct.create({
    data: {
      organizationId,
      isDemo: true,
      name: "Wazzup Стандарт",
      categoryValueId: dict.category.license_wazzup ?? null,
      defaultPrice: 18000,
      defaultDurationMonths: 1,
      defaultVendorSharePercent: 50,
      defaultTaxable: true,
    },
  });
  const productNova = await prisma.licenseProduct.create({
    data: {
      organizationId,
      isDemo: true,
      name: "NOVA Годовая лицензия",
      categoryValueId: dict.category.license_nova ?? null,
      defaultPrice: 250000,
      defaultDurationMonths: 12,
      defaultVendorSharePercent: 50,
      defaultTaxable: true,
    },
  });
  const productWazzupCard = await prisma.licenseProduct.create({
    data: {
      organizationId,
      isDemo: true,
      name: "Wazzup Mini (доп. номер, оплата на карту)",
      categoryValueId: dict.category.license_wazzup ?? null,
      defaultPrice: 6000,
      defaultDurationMonths: 1,
      defaultVendorSharePercent: 50,
      defaultTaxable: false,
    },
  });

  // Bills `monthsOfHistory` worth of periods for a new subscription, reusing
  // the exact same billSubscription() the "Выставить следующий платёж"
  // button calls — so demo history and real usage can never disagree on
  // how the financial waterfall is computed.
  async function seedSubscription(
    clientId: string,
    projectId: string,
    product: { id: string; defaultPrice: unknown; defaultDurationMonths: number; defaultVendorSharePercent: unknown; defaultTaxable: boolean; name: string },
    monthsOfHistory: number,
    overrides: Partial<{ price: number; vendorSharePercent: number; taxable: boolean; durationMonths: number }> = {}
  ) {
    const durationMonths = overrides.durationMonths ?? product.defaultDurationMonths;
    const startDate = dateInPast(monthsOfHistory, 5);
    let subscription = await prisma.subscription.create({
      data: {
        organizationId,
        isDemo: true,
        clientId,
        projectId,
        licenseProductId: product.id,
        price: overrides.price ?? Number(product.defaultPrice),
        durationMonths,
        vendorSharePercent: overrides.vendorSharePercent ?? Number(product.defaultVendorSharePercent),
        taxable: overrides.taxable ?? product.defaultTaxable,
        startDate,
        nextBillingDate: startDate,
      },
      include: { client: true, licenseProduct: true },
    });

    const periods = Math.max(1, Math.floor(monthsOfHistory / durationMonths));
    let operationsCreated = 0;
    for (let i = 0; i < periods; i++) {
      const result = await billSubscription(subscription, subscription.nextBillingDate, userId);
      operationsCreated += result.expenseOperation ? 2 : 1;
      subscription = { ...subscription, nextBillingDate: result.subscription.nextBillingDate };
    }
    return operationsCreated;
  }

  let subscriptionOperationsCount = 0;
  subscriptionOperationsCount += await seedSubscription(clientRomashka.id, projectByKey.romashkaLicense, productAmoCRM, 6);
  subscriptionOperationsCount += await seedSubscription(clientSfera.id, projectByKey.sfera, productWazzup, 6);
  subscriptionOperationsCount += await seedSubscription(clientKuznetsov.id, projectByKey.kuznetsovLicense, productNova, 8);
  // Paid straight to a personal card: vendor still takes its 50%, but no tax reserve is set aside.
  subscriptionOperationsCount += await seedSubscription(clientTechnopark.id, projectByKey.technopark, productWazzupCard, 3);

  // One-off sales ("Продажи") — unlike a subscription, these book their
  // operations once, right away, with no billing cycle. `projectId: null`
  // is used deliberately below: a sale (like a subscription) always has a
  // clientId even without a project, and reporting must attribute it to
  // that client anyway (see getClientLTV's project/subscription/sale OR).
  async function seedSale(
    clientId: string,
    clientName: string,
    projectId: string | null,
    product: { id: string; defaultVendorSharePercent: unknown; defaultTaxable: boolean; categoryValueId: string | null; name: string },
    amount: number,
    monthsAgo: number,
    day: number
  ) {
    const result = await recordSale({
      organizationId,
      clientId,
      projectId,
      licenseProductId: product.id,
      amount,
      saleDate: dateInPast(monthsAgo, day),
      vendorSharePercent: Number(product.defaultVendorSharePercent),
      taxable: product.defaultTaxable,
      categoryValueId: product.categoryValueId,
      clientName,
      productName: product.name,
      userId,
      isDemo: true,
    });
    return result.expenseOperation ? 2 : 1;
  }

  let saleOperationsCount = 0;
  // No project at all: an extra license sold directly, outside any tracked project.
  saleOperationsCount += await seedSale(clientRomashka.id, clientRomashka.name, null, productAmoCRM, 45000, 2, 12);
  // Tied to a project: an upsell during the implementation itself.
  saleOperationsCount += await seedSale(clientTechnopark.id, clientTechnopark.name, projectByKey.technopark, productNova, 250000, 1, 18);
  // Untaxed "card" product, also project-less.
  saleOperationsCount += await seedSale(clientSfera.id, clientSfera.name, null, productWazzupCard, 6000, 0, 22);
  const salesCount = 3;

  // Monthly recurring income/expense streams. `monthsBack` = how many months
  // of history to generate, counting back from the current month.
  const streams: RevenueStream[] = [
    { projectKey: "romashkaMain", type: "INCOME", categoryCode: "client_support", baseAmount: 80000, jitter: 8000, monthsBack: 8, counterparty: 'ООО "Ромашка"', description: "Сопровождение CRM за месяц" },
    { projectKey: "kuznetsovMain", type: "INCOME", categoryCode: "client_support", baseAmount: 20000, jitter: 0, monthsBack: 3, counterparty: "ИП Кузнецов А.С.", description: "Сопровождение NOVA" },
    { projectKey: "technopark", type: "INCOME", categoryCode: "client_work", baseAmount: 150000, jitter: 30000, monthsBack: 5, counterparty: 'ООО "Технопарк Инвест"', description: "Работы по внедрению amoCRM" },
  ];

  // Company-level overhead, not tied to a single client/project.
  const overheadStreams: Array<Omit<RevenueStream, "projectKey">> = [
    { type: "EXPENSE", categoryCode: "salary", baseAmount: 110000, jitter: 0, monthsBack: 8, counterparty: "Штат сотрудников", description: "Заработная плата" },
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
    licenseProducts: 4,
    subscriptions: 4,
    sales: salesCount,
    operations: operationsToCreate.length + subscriptionOperationsCount + saleOperationsCount,
    requests: requests.length,
    timeEntries: timeEntries.length,
  };
}

export async function clearDemoData(organizationId: string) {
  // Sequential and in this order on purpose: children before parents, since
  // not every relation cascades on delete (Operation->Project/Subscription/
  // Sale are SetNull, not Cascade, and Sale/Subscription->LicenseProduct is
  // Restrict) and running these concurrently could race.
  const operations = await prisma.operation.deleteMany({ where: { organizationId, isDemo: true } });
  const timeEntries = await prisma.timeEntry.deleteMany({ where: { organizationId, isDemo: true } });
  const requests = await prisma.request.deleteMany({ where: { organizationId, isDemo: true } });
  const sales = await prisma.sale.deleteMany({ where: { organizationId, isDemo: true } });
  const subscriptions = await prisma.subscription.deleteMany({ where: { organizationId, isDemo: true } });
  const licenseProducts = await prisma.licenseProduct.deleteMany({ where: { organizationId, isDemo: true } });
  const projects = await prisma.project.deleteMany({ where: { organizationId, isDemo: true } });
  const clients = await prisma.client.deleteMany({ where: { organizationId, isDemo: true } });
  return {
    operations: operations.count,
    timeEntries: timeEntries.count,
    sales: sales.count,
    subscriptions: subscriptions.count,
    licenseProducts: licenseProducts.count,
    requests: requests.count,
    projects: projects.count,
    clients: clients.count,
  };
}

export async function getDemoStatus(organizationId: string) {
  const [clients, projects, operations, requests, timeEntries, subscriptions, licenseProducts, sales] = await Promise.all([
    prisma.client.count({ where: { organizationId, isDemo: true } }),
    prisma.project.count({ where: { organizationId, isDemo: true } }),
    prisma.operation.count({ where: { organizationId, isDemo: true } }),
    prisma.request.count({ where: { organizationId, isDemo: true } }),
    prisma.timeEntry.count({ where: { organizationId, isDemo: true } }),
    prisma.subscription.count({ where: { organizationId, isDemo: true } }),
    prisma.licenseProduct.count({ where: { organizationId, isDemo: true } }),
    prisma.sale.count({ where: { organizationId, isDemo: true } }),
  ]);
  const total = clients + projects + operations + requests + timeEntries + subscriptions + licenseProducts + sales;
  return {
    hasDemoData: total > 0,
    clients,
    projects,
    operations,
    requests,
    timeEntries,
    subscriptions,
    licenseProducts,
    sales,
  };
}
