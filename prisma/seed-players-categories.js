/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const categoriesBySport = {
  Racquetball: [
    { name: "Open Varones", abbreviation: "OPENM", modality: "SINGLES", gender: "MALE" },
    { name: "Open Damas", abbreviation: "OPEND", modality: "SINGLES", gender: "FEMALE" },
    { name: "Dobles Mixto", abbreviation: "DMIX", modality: "DOUBLES", gender: "MIXED" },
    { name: "Senior 35", abbreviation: "S35", modality: "SINGLES", gender: "MALE" },
  ],
  Fronton: [
    { name: "Primera Varones", abbreviation: "PRIV", modality: null, gender: "MALE" },
    { name: "Segunda Varones", abbreviation: "SEGV", modality: null, gender: "MALE" },
    { name: "Damas Libre", abbreviation: "DLIB", modality: null, gender: "FEMALE" },
  ],
};

const players = [
  { firstName: "Carlos", lastName: "Suarez", documentNumber: "100001" },
  { firstName: "Maria", lastName: "Lopez", documentNumber: "100002" },
  { firstName: "Jose", lastName: "Mendoza", documentNumber: "100003" },
  { firstName: "Lucia", lastName: "Rojas", documentNumber: "100004" },
  { firstName: "Diego", lastName: "Vargas", documentNumber: "100005" },
  { firstName: "Ana", lastName: "Paredes", documentNumber: "100006" },
  { firstName: "Julio", lastName: "Torrez", documentNumber: "100007" },
  { firstName: "Rosa", lastName: "Castro", documentNumber: "100008" },
  { firstName: "Miguel", lastName: "Flores", documentNumber: "100009" },
  { firstName: "Elena", lastName: "Vega", documentNumber: "100010" },
  { firstName: "Andres", lastName: "Quiroga", documentNumber: "100011" },
  { firstName: "Paola", lastName: "Gomez", documentNumber: "100012" },
];

async function main() {
  const sports = await prisma.sport.findMany({
    select: { id: true, name: true },
  });

  for (const sport of sports) {
    const categories = categoriesBySport[sport.name];
    if (!categories) continue;
    for (const category of categories) {
      await prisma.category.upsert({
        where: {
          sportId_abbreviation: {
            sportId: sport.id,
            abbreviation: category.abbreviation,
          },
        },
        update: {
          name: category.name,
          modality: category.modality,
          gender: category.gender,
        },
        create: {
          name: category.name,
          abbreviation: category.abbreviation,
          modality: category.modality,
          gender: category.gender,
          sportId: sport.id,
        },
      });
    }
  }

  for (const player of players) {
    await prisma.player.upsert({
      where: {
        documentType_documentNumber: {
          documentType: "ID_CARD",
          documentNumber: player.documentNumber,
        },
      },
      update: {
        firstName: player.firstName,
        lastName: player.lastName,
      },
      create: {
        documentType: "ID_CARD",
        documentNumber: player.documentNumber,
        firstName: player.firstName,
        lastName: player.lastName,
        status: "CONFIRMED",
      },
    });
  }

  console.log("Seeded categories and players.");
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("Seed error:", error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
} else {
  // If imported, just export main (optional)
  module.exports = { main };
}
