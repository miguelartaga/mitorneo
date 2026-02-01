"use client";

import { useMemo, useState } from "react";
import { Users, Info } from "lucide-react";
import type { Registration, TournamentCategory, Category, Player } from "@/types/tournament-public";
import PlayerAvatar from "@/components/player-avatar";
type TournamentPublicGroupsProps = {
    registrations: Registration[];
    categories: TournamentCategory[];
};

const playerLabel = (player?: Player | null) =>
    player ? `${player.firstName} ${player.lastName}` : "Por definir";

const teamLabel = (registration?: Registration | null) => {
    if (!registration) return "Por definir";
    if (registration.teamName) return registration.teamName;
    const names = [
        registration.player,
        registration.partner,
        registration.partnerTwo,
    ]
        .filter(Boolean)
        .map((p) => playerLabel(p as Player));
    return names.join(" / ");
};

const teamMembersLabel = (registration?: Registration | null) => {
    if (!registration) return "";
    const members = [registration.player, registration.partner, registration.partnerTwo].filter(
        Boolean
    ) as Player[];
    return members.map((member) => `${member.firstName} ${member.lastName}`).join(" / ");
};

const TeamAvatars = ({ registration }: { registration: Registration }) => {
    const players = [
        registration.player,
        registration.partner,
        registration.partnerTwo
    ].filter(Boolean) as Player[];

    return (
        <div className="flex -space-x-2 overflow-hidden">
            {players.map((player) => (
                <div
                    key={player.id}
                    className="relative inline-block h-8 w-8 overflow-hidden rounded-full ring-2 ring-white dark:ring-slate-800"
                >
                    <PlayerAvatar player={player} />
                </div>
            ))}
        </div>
    );
};

export default function TournamentPublicGroups({
    registrations,
    categories,
}: TournamentPublicGroupsProps) {

    const categoriesById = useMemo(() => {
        const map = new Map<string, Category>();
        categories.forEach((entry) => {
            map.set(entry.categoryId, entry.category);
        });
        return map;
    }, [categories]);

    const groupSeedings = useMemo(() => {
        const map = new Map<
            string,
            { category: Category; groups: Map<string, Registration[]> }
        >();

        registrations.forEach((registration) => {
            const category =
                categoriesById.get(registration.categoryId) ??
                categories.find((entry) => entry.categoryId === registration.categoryId)?.category;

            if (!category) return;
            if (!registration.groupName) return;

            const entry = map.get(registration.categoryId) ?? {
                category,
                groups: new Map<string, Registration[]>(),
            };

            const groupKey = registration.groupName.trim() || "A";
            const list = entry.groups.get(groupKey) ?? [];
            list.push(registration);
            entry.groups.set(groupKey, list);
            map.set(registration.categoryId, entry);
        });

        const result = Array.from(map.values()).map((entry) => {
            const groups = Array.from(entry.groups.entries()).map(([key, list]) => {
                const sorted = [...list].sort((a, b) => {
                    const rankA = a.rankingNumber ?? Number.MAX_SAFE_INTEGER;
                    const rankB = b.rankingNumber ?? Number.MAX_SAFE_INTEGER;
                    if (rankA !== rankB) return rankA - rankB;
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                });
                return { key, list: sorted };
            });
            // Sort groups alphabetically (A, B, C...)
            groups.sort((a, b) => a.key.localeCompare(b.key));
            return { category: entry.category, groups };
        });

        // Sort categories by name (or logic if needed)
        result.sort((a, b) => a.category.name.localeCompare(b.category.name));

        return result;
    }, [registrations, categories, categoriesById]);

    if (groupSeedings.length === 0) {
        return (
            <section className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 p-4 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    <Users className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Sembrado no disponible
                </h3>
                <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                    Aún no se han definido los grupos para las categorías de este torneo.
                </p>
            </section>
        );
    }

    return (
        <section className="mt-8 space-y-10">
            {groupSeedings.map((entry) => (
                <div
                    key={`group-category-${entry.category.id}`}
                    className="space-y-6"
                >
                    {/* Category Header */}
                    <div className="flex items-center gap-4 border-b border-[var(--border)] pb-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
                            <span className="text-lg font-black">{entry.category.abbreviation?.substring(0, 2) || "CA"}</span>
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                                {entry.category.name}
                            </h3>
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                {entry.groups.length} Grupos definidos
                            </p>
                        </div>
                    </div>

                    {/* Groups Grid */}
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                        {entry.groups.map((group) => (
                            <div
                                key={`group-table-${entry.category.id}-${group.key}`}
                                className="group relative overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] transition-all hover:shadow-xl dark:bg-slate-900/50"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-5 transition-opacity group-hover:opacity-10">
                                    <span className="text-9xl font-black text-slate-900 dark:text-white">
                                        {group.key}
                                    </span>
                                </div>
                                <div className="relative flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-2)]/50 px-6 py-4 backdrop-blur-sm">
                                    <h4 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm text-white shadow-sm">
                                            {group.key}
                                        </span>
                                        Grupo
                                    </h4>
                                    <span className="rounded-full bg-slate-200/50 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700/50 dark:text-slate-300">
                                        {group.list.length} Equipos
                                    </span>
                                </div>

                                <div className="relative p-2">
                                    {group.list.map((registration, index) => (
                                        <div
                                            key={registration.id}
                                            className="group/item flex items-center gap-4 rounded-2xl p-3 transition-colors hover:bg-slate-100/80 dark:hover:bg-slate-800/50"
                                        >
                                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black shadow-sm ring-2 ring-inset ${(registration.rankingNumber ?? 999) <= 2
                                                ? "bg-yellow-100 text-yellow-700 ring-yellow-400/30 dark:bg-yellow-900/30 dark:text-yellow-400"
                                                : "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700"
                                                }`}>
                                                {registration.rankingNumber ?? (index + 1)}
                                            </div>

                                            <TeamAvatars registration={registration} />

                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-slate-900 dark:text-slate-100 leading-tight">
                                                    {teamLabel(registration)}
                                                </p>
                                                {registration.teamName && (
                                                    <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                                        {teamMembersLabel(registration)}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 text-sm text-blue-800 shadow-sm dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-200">
                <Info className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                <p className="font-medium">
                    Los horarios y cruces de la fase de grupos están disponibles en la pestaña de <strong className="font-bold text-blue-900 underline decoration-blue-400/30 decoration-2 underline-offset-2 dark:text-white">Fixture</strong>.
                </p>
            </div>
        </section>
    );
}
