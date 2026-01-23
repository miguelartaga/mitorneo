"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { type ParticipantRow } from "@/types/tournament-public";

type TournamentPublicParticipantsProps = {
    participantQuery: string;
    setParticipantQuery: (value: string) => void;
    filteredParticipantRows: ParticipantRow[];
};

export default function TournamentPublicParticipants({
    participantQuery,
    setParticipantQuery,
    filteredParticipantRows,
}: TournamentPublicParticipantsProps) {
    const sortedRows = [...filteredParticipantRows].sort((a, b) =>
        a.player.lastName.localeCompare(b.player.lastName)
    );

    const groupedParticipants = sortedRows.reduce((acc, row) => {
        const letter = row.player.lastName.charAt(0).toUpperCase();
        if (!acc[letter]) {
            acc[letter] = [];
        }
        acc[letter].push(row);
        return acc;
    }, {} as Record<string, ParticipantRow[]>);

    const sortedLetters = Object.keys(groupedParticipants).sort();

    return (
        <section className="mt-6 space-y-4 md:mt-8 md:space-y-6">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 md:rounded-3xl md:p-6">
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                            Lista de Inscritos
                        </h2>
                        <p className="text-sm text-slate-500">
                            {sortedRows.length} jugadores encontrados
                        </p>
                    </div>
                    <div className="w-full sm:w-72">
                        <div className="relative">
                            <input
                                type="text"
                                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Buscar jugador..."
                                value={participantQuery}
                                onChange={(e) => setParticipantQuery(e.target.value)}
                            />
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                <Search className="h-5 w-5 text-slate-400" />
                            </div>
                        </div>
                    </div>
                </div>

                {sortedRows.length === 0 ? (
                    <p className="mt-4 text-center text-sm text-slate-500">
                        No se encontraron participantes.
                    </p>
                ) : (
                    <div className="space-y-8">
                        {sortedLetters.map((letter) => (
                            <div key={letter}>
                                <div className="mb-4 flex items-center gap-4">
                                    <h3 className="text-2xl font-bold text-slate-400">
                                        {letter}
                                    </h3>
                                    <div className="h-px flex-1 bg-[var(--border)]" />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {groupedParticipants[letter].map((row) => (
                                        <Link
                                            key={row.id}
                                            href={`/players/${row.player.id}`}
                                            className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-sm transition-shadow hover:shadow-md"
                                        >
                                            <div className="relative h-14 w-14 flex-shrink-0">
                                                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--background)] text-lg font-bold text-slate-400">
                                                    {row.player.photoUrl ? (
                                                        <img
                                                            src={row.player.photoUrl}
                                                            alt={row.player.firstName}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center bg-indigo-100 text-indigo-600 font-bold uppercase ring-2 ring-white dark:ring-slate-800">
                                                            {row.player.lastName[0] || row.player.firstName[0]}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate font-semibold text-slate-900">
                                                    {row.player.lastName} {row.player.firstName}
                                                </p>
                                                <div className="mt-1 flex flex-wrap gap-x-2 text-xs">
                                                    <span className="text-blue-600 dark:text-cyan-200 font-medium">
                                                        {row.category.name} ({row.category.abbreviation})
                                                    </span>
                                                </div>
                                                <p className="mt-0.5 truncate text-xs text-slate-500">
                                                    {row.location || "Sin ubicacion"}
                                                </p>
                                                {row.teamName && (
                                                    <p className="mt-0.5 truncate text-xs text-slate-400">
                                                        Equipo: {row.teamName}
                                                    </p>
                                                )}
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
