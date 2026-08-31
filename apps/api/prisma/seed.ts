import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDefaultDictionaries } from "../src/modules/dictionaries/dictionaries.seed";

const prisma = new PrismaClient();

async function main() {
  const email = "owner@example.com";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Demo data already exists, skipping seed.");
    return;
  }

  const organization = await prisma.organization.create({
    data: { name: "Моя интеграторская компания" },
  });

  await seedDefaultDictionaries(organization.id);

  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.user.create({
    data: {
      organizationId: organization.id,
      email,
      passwordHash,
      name: "Владелец компании",
      role: "OWNER",
    },
  });

  const categories = await prisma.dictionaryValue.findMany({
    where: { organizationId: organization.id, dictionaryType: { code: "operation_category" } },
  });
  const cat = (code: string) => categories.find((c) => c.code === code)!.id;

  const projectTypes = await prisma.dictionaryValue.findMany({
    where: { organizationId: organization.id, dictionaryType: { code: "project_type" } },
  });
  const type = (code: string) => projectTypes.find((t) => t.code === code)!.id;

  const client = await prisma.client.create({
    data: {
      organizationId: organization.id,
      name: 'ООО "Ромашка"',
      legalName: 'ООО "Ромашка"',
      inn: "7701234567",
      contactPerson: "Иван Петров",
      contactEmail: "ivan@romashka.example",
      status: "ACTIVE",
    },
  });

  const parentProject = await prisma.project.create({
    data: {
      organizationId: organization.id,
      clientId: client.id,
      name: "Внедрение и сопровождение CRM",
      typeValueId: type("implementation"),
      hourlyRate: 2500,
    },
  });

  const licenseSubproject = await prisma.project.create({
    data: {
      organizationId: organization.id,
      clientId: client.id,
      parentId: parentProject.id,
      name: "Лицензия amoCRM (10 мест)",
      typeValueId: type("license_amocrm"),
    },
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 5);

  await prisma.operation.createMany({
    data: [
      {
        organizationId: organization.id,
        projectId: licenseSubproject.id,
        type: "INCOME",
        amount: 45000,
        accrualDate: monthStart,
        paymentDate: monthStart,
        categoryValueId: cat("license_amocrm"),
        counterparty: client.name,
        description: "Оплата лицензии amoCRM на 10 пользователей",
      },
      {
        organizationId: organization.id,
        projectId: licenseSubproject.id,
        type: "EXPENSE",
        amount: 30000,
        accrualDate: monthStart,
        paymentDate: monthStart,
        categoryValueId: cat("license_cost"),
        counterparty: "amoCRM (официальный партнёр)",
        description: "Закупка лицензий у поставщика",
      },
      {
        organizationId: organization.id,
        projectId: parentProject.id,
        type: "INCOME",
        amount: 80000,
        accrualDate: monthStart,
        paymentDate: monthStart,
        categoryValueId: cat("client_support"),
        counterparty: client.name,
        description: "Сопровождение CRM за месяц",
      },
    ],
  });

  const request = await prisma.request.create({
    data: {
      organizationId: organization.id,
      projectId: parentProject.id,
      title: "Настроить автоматическую воронку продаж",
      status: "DONE",
      priority: "HIGH",
    },
  });

  const owner = await prisma.user.findFirstOrThrow({ where: { organizationId: organization.id } });

  await prisma.timeEntry.create({
    data: {
      organizationId: organization.id,
      projectId: parentProject.id,
      requestId: request.id,
      userId: owner.id,
      date: monthStart,
      hours: 6,
      description: "Настройка воронки и автоматизаций",
    },
  });

  console.log("Seed complete. Login: owner@example.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
