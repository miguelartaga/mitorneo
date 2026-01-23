"use client";

import { type TournamentPublicData } from "@/types/tournament-public";

type TournamentPublicInfoProps = {
    tournament: TournamentPublicData;
    formatDateLong: (value?: string | null) => string;
    formatDateShort: (value?: string | null) => string;
};

export default function TournamentPublicInfo({
    tournament,
    formatDateLong,
    formatDateShort,
}: TournamentPublicInfoProps) {
    return (
        <section className="mt-6 md:mt-8">
            <div className="grid gap-4 md:gap-6 lg:grid-cols-[1.2fr_1fr]">
                <div className="rounded-2xl md:rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 md:p-6">
                    <h2 className="text-lg font-semibold text-slate-900">Reglas</h2>
                    {tournament.rulesText ? (
                        <div
                            className="prose prose-slate dark:prose-invert mt-4 max-w-none break-words text-xs prose-p:text-xs prose-li:text-xs prose-headings:text-sm md:text-base md:prose-p:text-base md:prose-li:text-base md:prose-headings:text-lg"
                            dangerouslySetInnerHTML={{ __html: tournament.rulesText }}
                        />
                    ) : (
                        <p className="mt-4 text-sm text-slate-500">
                            Sin reglas publicadas.
                        </p>
                    )}
                </div>
                <div className="space-y-4 md:space-y-6">
                    <div className="rounded-2xl md:rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 md:p-6">
                        <h2 className="text-lg font-semibold text-slate-900">Fechas clave</h2>
                        <div className="mt-4 space-y-3 text-sm text-slate-500">
                            <p>Inicio: {formatDateLong(tournament.startDate)}</p>
                            <p>Fin: {formatDateLong(tournament.endDate)}</p>
                            <p>
                                Cierre inscripciones: {formatDateLong(tournament.registrationDeadline)}
                            </p>
                            <div>
                                <p className="mt-4 font-semibold text-slate-900">Dias de juego</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {tournament.playDays.map((day) => (
                                        <span
                                            key={day}
                                            className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs text-slate-600"
                                        >
                                            {formatDateShort(day)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl md:rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 md:p-6">
                        <h2 className="text-lg font-semibold text-slate-900">Sedes</h2>
                        <div className="mt-4 space-y-3 text-sm text-slate-500">
                            {tournament.clubs.map((club) => (
                                <div
                                    key={club.id}
                                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
                                >
                                    <p className="font-semibold text-slate-900">{club.name}</p>
                                    <p>{club.address ?? "Sin direccion"}</p>
                                    <p className="text-xs text-slate-500">
                                        Canchas habilitadas: {club.courtsCount ?? 1}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="rounded-2xl md:rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 md:p-6">
                        <h2 className="text-lg font-semibold text-slate-900">
                            Categorias disponibles
                        </h2>
                        <div className="mt-4 space-y-3 text-sm">
                            {tournament.categories.map((entry) => (
                                <div
                                    key={entry.categoryId}
                                    className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div>
                                        <p className="font-semibold text-slate-900">
                                            {entry.category.name}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                            {entry.category.abbreviation} - {entry.category.sport?.name ?? "N/D"}
                                        </p>
                                    </div>
                                    <div className="text-xs text-slate-500">
                                        <p>Precio 1: Bs {entry.price}</p>
                                        <p>Precio 2+: Bs {entry.secondaryPrice || entry.price}</p>
                                        <p>Precio hermano: Bs {entry.siblingPrice || entry.price}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
