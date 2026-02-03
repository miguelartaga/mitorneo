import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Image from "next/image";
import { Calendar, MapPin, Trophy } from "lucide-react";
import SearchInput from "@/components/ui/search-input";

const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("es-BO", {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(date);
};

const FALLBACK_PHOTOS = [
    "/hero/fotouno.jpeg",
    "/hero/fotodos.jpeg",
    "/hero/fototres.jpeg",
    "/hero/fotocuatro.jpeg",
];

const pickFallbackPhoto = (seed: string) => {
  if (!seed) return FALLBACK_PHOTOS[0];
  let total = 0;
  for (let i = 0; i < seed.length; i += 1) {
    total += seed.charCodeAt(i);
  }
  return FALLBACK_PHOTOS[total % FALLBACK_PHOTOS.length];
};

const getSportFolder = (name?: string | null) => {
  if (!name) return null;
  const normalized = name.toLowerCase().replace(/\s+/g, "");
  if (normalized === "racquetball" || normalized === "raquetball") return "raquet";
  if (normalized === "fronton") return "fronton";
  if (normalized === "padel") return "padel";
  if (normalized === "tenis") return "tenis";
  if (normalized === "squash") return "squash";
  return null;
};

const SPORT_FALLBACK_COUNTS: Record<string, number> = {
  raquet: 3,
  fronton: 2,
  padel: 1,
  squash: 1,
  tenis: 1,
};

const pickSportFallbackPhoto = (sportName?: string | null) => {
  const folder = getSportFolder(sportName);
  if (!folder) return null;
  const count = SPORT_FALLBACK_COUNTS[folder];
  if (!count) return null;
  const index = Math.floor(Math.random() * count) + 1;
  return `/sports/${folder}/${index}.jpg`;
};

export default async function TournamentsPage({
    searchParams,
}: {
    searchParams: Promise<{
        q?: string;
        status?: string;
        sport?: string;
        country?: string;
        region?: string;
    }>;
}) {
    const { q, status, sport, country, region } = await searchParams;
    const query = q || "";
    const statusFilter = status || "all";
    const sportFilter = sport || "all";
    const countryFilter = country || "all";
    const regionFilter = region || "all";

    const sports = await prisma.sport.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
    });

    const tournaments = await prisma.tournament.findMany({
        where: {
            ...(query ? { name: { contains: query } } : {}),
            ...(sportFilter !== "all" ? { sportId: sportFilter } : {}),
            ...(countryFilter !== "all" ? { countryName: countryFilter } : {}),
            ...(regionFilter !== "all" ? { regionName: regionFilter } : {}),
        },
        include: {
            sport: true,
            clubs: true,
            league: true,
        },
        orderBy: {
            startDate: "desc",
        },
    });

    const filteredTournaments = tournaments.filter((tournament) => {
        if (statusFilter === "live") return tournament.status === "ACTIVE";
        if (statusFilter === "upcoming") return tournament.status === "WAITING";
        if (statusFilter === "past") return tournament.status === "FINISHED";
        return true;
    });

    const countries = Array.from(
        new Set(
            tournaments
                .map((tournament) => tournament.countryName)
                .filter((value): value is string => Boolean(value && value.trim()))
        )
    ).sort((a, b) => a.localeCompare(b));

    const regions = Array.from(
        new Set(
            tournaments
                .filter((tournament) =>
                    countryFilter === "all"
                        ? Boolean(tournament.regionName)
                        : tournament.countryName === countryFilter
                )
                .map((tournament) => tournament.regionName)
                .filter((value): value is string => Boolean(value && value.trim()))
        )
    ).sort((a, b) => a.localeCompare(b));

    const resolveNext = <T,>(value: T | null | undefined, current: T) =>
        value === undefined ? current : value;

    const buildHref = (next: {
        status?: string | null;
        sport?: string | null;
        country?: string | null;
        region?: string | null;
    }) => {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        const nextStatus = resolveNext(next.status, statusFilter);
        const nextSport = resolveNext(next.sport, sportFilter);
        const nextCountry = resolveNext(next.country, countryFilter);
        const nextRegion = resolveNext(next.region, regionFilter);
        if (nextStatus && nextStatus !== "all") params.set("status", nextStatus);
        if (nextSport && nextSport !== "all") params.set("sport", nextSport);
        if (nextCountry && nextCountry !== "all") params.set("country", nextCountry);
        if (nextRegion && nextRegion !== "all") params.set("region", nextRegion);
        const qs = params.toString();
        return qs ? `/tournaments?${qs}` : "/tournaments";
    };

    return (
        <main className="min-h-screen bg-slate-50 py-12">
            <div className="container mx-auto px-6">
                <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Torneos</h1>
                        <p className="mt-2 text-slate-600">
                            Explora y encuentra tu próxima competencia
                        </p>
                    </div>

                    <SearchInput placeholder="Buscar por nombre..." />
                </div>

                <div className="mb-10 flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Estado
                        </span>
                        {[
                            { key: "all", label: "Todos" },
                            { key: "live", label: "En vivo" },
                            { key: "upcoming", label: "Futuros" },
                            { key: "past", label: "Anteriores" },
                        ].map((item) => {
                            const isActive = statusFilter === item.key;
                            return (
                                <Link
                                    key={item.key}
                                    href={buildHref({ status: item.key === "all" ? null : item.key })}
                                    className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${isActive
                                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                                        }`}
                                >
                                    {item.label}
                                </Link>
                            );
                        })}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Deporte
                        </span>
                        <Link
                            href={buildHref({ sport: null })}
                            className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${sportFilter === "all"
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                                }`}
                        >
                            Todos
                        </Link>
                        {sports.map((item) => {
                            const isActive = sportFilter === item.id;
                            return (
                                <Link
                                    key={item.id}
                                    href={buildHref({ sport: item.id })}
                                    className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${isActive
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                                        }`}
                                >
                                    {item.name}
                                </Link>
                            );
                        })}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Pais
                        </span>
                        <Link
                            href={buildHref({ country: null, region: null })}
                            className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${countryFilter === "all"
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                                }`}
                        >
                            Todos
                        </Link>
                        {countries.map((item) => {
                            const isActive = countryFilter === item;
                            return (
                                <Link
                                    key={item}
                                    href={buildHref({ country: item, region: null })}
                                    className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${isActive
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                                        }`}
                                >
                                    {item}
                                </Link>
                            );
                        })}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Departamento
                        </span>
                        <Link
                            href={buildHref({ region: null })}
                            className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${regionFilter === "all"
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                                }`}
                        >
                            Todos
                        </Link>
                        {regions.map((item) => {
                            const isActive = regionFilter === item;
                            return (
                                <Link
                                    key={item}
                                    href={buildHref({ region: item })}
                                    className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${isActive
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                                        }`}
                                >
                                    {item}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {filteredTournaments.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center">
                        <Trophy className="mb-4 h-12 w-12 text-slate-300" />
                        <h3 className="text-lg font-medium text-slate-900">
                            No se encontraron torneos
                        </h3>
                        <p className="text-slate-500">
                            Intenta con otra búsqueda o regresa más tarde.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {filteredTournaments.map((tournament) => {
                            const imageUrl =
                                tournament.photoUrl ||
                                tournament.league?.photoUrl ||
                                pickSportFallbackPhoto(tournament.sport?.name) ||
                                pickFallbackPhoto(tournament.id);

                            return (
                                <Link
                                    key={tournament.id}
                                    href={`/tournaments/${tournament.id}`}
                                    className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-lg hover:-translate-y-1"
                                >
                                    <div className="relative h-48 w-full bg-slate-100">
                                        <Image
                                            src={imageUrl}
                                            alt={tournament.name}
                                            fill
                                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent opacity-60" />
                                        <div className="absolute bottom-4 left-4 right-4">
                                            <span className="inline-block rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
                                                {tournament.sport?.name || "Deporte"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-1 flex-col p-6">
                                        <h3 className="mb-2 text-xl font-bold text-slate-900 line-clamp-2">
                                            {tournament.name}
                                        </h3>

                                        <div className="mt-auto space-y-3 text-sm text-slate-500">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-indigo-500" />
                                                <span>
                                                    {tournament.startDate
                                                        ? formatDate(tournament.startDate)
                                                        : "Fecha por definir"}
                                                </span>
                                            </div>
                                            {tournament.clubs.length > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <MapPin className="h-4 w-4 text-indigo-500" />
                                                    <span className="line-clamp-1">
                                                        {[
                                                            tournament.regionName,
                                                            tournament.countryName,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(", ") ||
                                                            tournament.clubs[0].name}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}
