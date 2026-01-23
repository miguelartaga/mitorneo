/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient, Role } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const email = "miguel@gmail.com";
  const password = "prueba123";
  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: hashedPassword,
      name: "Demo User",
      emailVerified: new Date(),
      role: Role.ADMIN,
    },
    create: {
      email,
      name: "Demo User",
      passwordHash: hashedPassword,
      emailVerified: new Date(),
      role: Role.ADMIN,
    },
  });

  const sports = [
    { name: "Racquetball" },
    { name: "Squash" },
    { name: "Fronton" },
    { name: "Padel" },
    { name: "Tenis" },
  ];

  for (const sport of sports) {
    await prisma.sport.upsert({
      where: { name: sport.name },
      update: {},
      create: sport,
    });
  }

  console.log(
    `Seeded demo admin -> email: ${email} | password: ${password}`
  );
  console.log(
    "Seeded sports:",
    sports.map((s) => s.name).join(", ")
  );
}

main()
  .catch((err) => {
    console.error("Seeding error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
