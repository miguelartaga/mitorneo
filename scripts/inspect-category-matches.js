const { PrismaClient } = require("@prisma/client");

const [tournamentId, categoryId] = process.argv.slice(2);
if (!categoryId) {
  console.error('Usage: node scripts/inspect-category-matches.js <tournamentId?> <categoryId>');
  process.exit(1);
}

const prisma = new PrismaClient();

(async () => {
  const where = {
    categoryId,
    stage: 'PLAYOFF',
    ...(tournamentId ? { tournamentId } : {}),
  };
  const matches = await prisma.tournamentMatch.findMany({
    where,
    orderBy: [{ roundNumber: 'asc' }, { orderHint: 'asc' }, { createdAt: 'asc' }],
  });

  console.table(
    matches.map((m) => ({
      id: m.id,
      round: m.roundNumber,
      orderHint: m.orderHint,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      isBronze: m.isBronzeMatch,
    }))
  );

  await prisma.$disconnect();
})();
