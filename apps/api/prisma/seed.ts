import bcrypt from "bcryptjs";
import { prisma } from "../src/prisma";
import { seedDefaultDictionaries } from "../src/modules/dictionaries/dictionaries.seed";
import { seedDemoData } from "../src/modules/demo/demo.service";

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
  const owner = await prisma.user.create({
    data: {
      organizationId: organization.id,
      email,
      passwordHash,
      name: "Владелец компании",
      role: "OWNER",
    },
  });

  await seedDemoData(organization.id, owner.id);

  console.log("Seed complete. Login: owner@example.com / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
