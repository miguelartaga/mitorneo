import PublicRankings from "@/components/rankings/public-rankings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RankingsPage() {
  const [sports, leagues, seasons, categories, tournaments] = await Promise.all([
    prisma.sport.findMany({ orderBy: { name: "asc" } }),
    prisma.league.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, sportId: true, photoUrl: true },
    }),
    prisma.season.findMany({ orderBy: [{ leagueId: "asc" }, { startDate: "desc" }] }),
    prisma.category.findMany({
      orderBy: [{ sport: { name: "asc" } }, { name: "asc" }],
      include: { sport: { select: { id: true, name: true } } },
    }),
    prisma.tournament.findMany({
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        sportId: true,
        leagueId: true,
        startDate: true,
      },
    }),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-2 py-6 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-500/90">
            Rankings
          </p>
          <h1 className="mt-3 text-4xl font-bold text-slate-900">
            Ranking de jugadores
          </h1>
          <p className="mt-3 text-slate-600">
            Explora rankings por deporte, liga y temporada. Filtra por torneo si
            necesitas ver un evento especifico.
          </p>
        </div>

        <PublicRankings
          sports={sports}
          leagues={leagues}
          seasons={seasons.map((season) => ({
            id: season.id,
            name: season.name,
            leagueId: season.leagueId,
            startDate: season.startDate.toISOString(),
            endDate: season.endDate.toISOString(),
          }))}
          categories={categories}
          tournaments={tournaments.map((item) => ({
            id: item.id,
            name: item.name,
            sportId: item.sportId,
            leagueId: item.leagueId,
            startDate: item.startDate ? item.startDate.toISOString() : null,
          }))}
        />
      </div>
    </main>
  );
}
