export const dynamic = "force-dynamic";
export const revalidate = 0;

import TournamentStatusPanel from "@/components/tournaments/tournament-status-panel";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";
import { redirect } from "next/navigation";

const toISOStringOrNull = (value?: Date | null) => (value ? value.toISOString() : null);

export default async function TournamentStatusPage() {
  const session = await getServerSession();
  if (!session || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      league: { select: { id: true, name: true } },
      clubs: true,
      paymentReportedBy: { select: { id: true, name: true, email: true } },
      categories: {
        include: {
          category: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
              sport: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  const settings =
    (await prisma.globalSetting.findUnique({
      where: { id: "default" },
    })) ??
    (await prisma.globalSetting.create({
      data: { id: "default", paymentRateDefault: 0 },
    }));

  const serializedTournaments = tournaments.map((tournament) => ({
    id: tournament.id,
    name: tournament.name,
    sportId: tournament.sportId,
    address: tournament.address,
    rankingEnabled: tournament.rankingEnabled,
    status: tournament.status,
    paymentRate: tournament.paymentRate.toString(),
    paymentPaidAmount: tournament.paymentPaidAmount.toString(),
    paymentReportedAmount: tournament.paymentReportedAmount?.toString() ?? null,
    paymentReportedNote: tournament.paymentReportedNote ?? null,
    paymentReportedAt: toISOStringOrNull(tournament.paymentReportedAt),
    paymentReportedBy: tournament.paymentReportedBy
      ? {
          id: tournament.paymentReportedBy.id,
          name: tournament.paymentReportedBy.name,
          email: tournament.paymentReportedBy.email,
        }
      : null,
    leagueId: tournament.leagueId,
    league: tournament.league,
    startDate: toISOStringOrNull(tournament.startDate),
    endDate: toISOStringOrNull(tournament.endDate),
    registrationDeadline: toISOStringOrNull(tournament.registrationDeadline),
    rulesText: tournament.rulesText,
    playDays: Array.isArray(tournament.playDays)
      ? tournament.playDays.filter((day): day is string => typeof day === "string")
      : [],
    clubs: tournament.clubs,
    categories: tournament.categories.map((item) => ({
      categoryId: item.categoryId,
      category: item.category,
      price: item.price.toString(),
      secondaryPrice: item.secondaryPrice.toString(),
      siblingPrice: item.siblingPrice.toString(),
    })),
  }));

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_circle_at_10%_10%,rgba(99,102,241,0.18),transparent_60%),radial-gradient(900px_circle_at_90%_0%,rgba(14,165,233,0.16),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.2)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.2)_1px,transparent_1px)] bg-[size:64px_64px] opacity-30 [mask-image:radial-gradient(circle_at_top,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-120px] h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl admin-glow"
      />
      <div className="relative mx-auto w-full max-w-5xl">
        <section className="admin-fade-up relative overflow-hidden rounded-[32px] bg-white/75 p-6 sm:p-10 shadow-[0_35px_80px_-60px_rgba(15,23,42,0.5)] ring-1 ring-slate-200/70 backdrop-blur">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent" />
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-500/90">
            Panel de torneos
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight text-slate-900">
            <span className="admin-title bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-600 bg-clip-text text-transparent">
              Ver torneos y pagos
            </span>
          </h1>
          <p className="mt-3 text-base text-slate-600">
            Administra el estado y el monto por inscrito de cada torneo.
          </p>
          <div className="mt-10">
            <TournamentStatusPanel
              initialTournaments={serializedTournaments}
              paymentRateDefault={settings.paymentRateDefault.toString()}
              paymentQrUrl={settings.paymentQrUrl ?? ""}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

