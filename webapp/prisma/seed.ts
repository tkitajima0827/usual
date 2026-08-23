import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma from "../src/lib/prisma";

async function main() {
  const business = await prisma.business.upsert({
    where: { code: "hamaguri" },
    update: {},
    create: {
      name: "蛤覚合同会社",
      code: "hamaguri",
    },
  });

  await prisma.fiscalPeriod.upsert({
    where: { businessId_label: { businessId: business.id, label: "26.02月期" } },
    update: {},
    create: {
      businessId: business.id,
      label: "26.02月期",
      startDate: new Date("2025-03-01"),
      endDate: new Date("2026-02-28"),
    },
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "kitajima@stella-l.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "北島智行",
      passwordHash,
      isAdmin: true,
    },
  });

  await prisma.membership.upsert({
    where: { userId_businessId: { userId: admin.id, businessId: business.id } },
    update: { role: "ADMIN" },
    create: {
      userId: admin.id,
      businessId: business.id,
      role: "ADMIN",
    },
  });

  console.log("Seeded business:", business.name);
  console.log("Seeded admin user:", admin.email, "(password:", adminPassword, ")");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
