"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { type ParticipantRow } from "@/types/tournament-public";
import PlayerAvatar from "@/components/player-avatar";

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
    // 1. Consolidate rows by player ID
    const consolidatedParticipants = useMemo(() => {
        const map = new Map<
            string,
            {
                player: ParticipantRow["player"];
                location: string;
                entries: { category: ParticipantRow["category"]; teamName: string | null }[];
            }
        >();

        filteredParticipantRows.forEach((row) => {
            const existing = map.get(row.player.id);
            if (existing) {
                // Add new category/team entry if not already present (though unlikely to be duplicate in this context)
                existing.entries.push({
                    category: row.category,
                    teamName: row.teamName,
                });
            } else {
                map.set(row.player.id, {
                    player: row.player,
                    location: row.location,
                    entries: [{ category: row.category, teamName: row.teamName }],
                });
            }
        });

        // Convert back to array
        return Array.from(map.values());
    }, [filteredParticipantRows]);

    // 2. Sort by Last Name
    const sortedParticipants = useMemo(() => {
        return [...consolidatedParticipants].sort((a, b) =>
            a.player.lastName.localeCompare(b.player.lastName)
        );
    }, [consolidatedParticipants]);

    // 3. Group by Initial Letter
    const groupedParticipants = useMemo(() => {
        return sortedParticipants.reduce((acc, item) => {
            const letter = item.player.lastName.charAt(0).toUpperCase();
            if (!acc[letter]) {
                acc[letter] = [];
            }
            acc[letter].push(item);
            return acc;
        }, {} as Record<string, typeof sortedParticipants>);
    }, [sortedParticipants]);

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
                            {sortedParticipants.length} jugadores encontrados
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

                {sortedParticipants.length === 0 ? (
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
                                    {groupedParticipants[letter].map((item) => (
                                        <Link
                                            key={item.player.id}
                                            href={`/players/${item.player.id}`}
                                            className="flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-sm transition-shadow hover:shadow-md"
                                        >
                                            <div className="relative h-14 w-14 flex-shrink-0">
                                                <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--background)] text-lg font-bold text-slate-400">
                                                    <PlayerAvatar
                                                        player={item.player}
                                                        className="h-full w-full object-cover"
                                                        fallbackClassName="flex h-full w-full items-center justify-center bg-indigo-100 text-indigo-600 font-bold uppercase ring-2 ring-white dark:ring-slate-800"
                                                    />
                                                </div>
                                            </div>
                                            <div className="min-w-0 flex-1 pt-1">
                                                <p className="font-semibold text-slate-900 leading-snug">
                                                    {item.player.lastName} {item.player.firstName}
                                                </p>

                                                <div className="mt-2 flex flex-col gap-1.5">
                                                    {item.entries.map((entry, idx) => (
                                                        <div key={`${entry.category.id}-${idx}`} className="flex flex-col">
                                                            <span className="text-xs font-medium text-blue-600 dark:text-cyan-200">
                                                                {entry.category.name} ({entry.category.abbreviation})
                                                            </span>
                                                            {entry.teamName && (
                                                                <span className="text-xs text-slate-400">
                                                                    Equipo: {entry.teamName}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>

                                                <p className="mt-2 text-xs text-slate-500">
                                                    {item.location || "Sin ubicación"}
                                                </p>
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
