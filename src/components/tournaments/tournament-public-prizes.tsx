"use client";

import { useMemo } from "react";
import { Trophy, Medal, Gift, Award, Info } from "lucide-react";
import type { Prize, Category } from "@/types/tournament-public";

interface TournamentPublicPrizesProps {
    prizes: Prize[];
}

const describePrizePlace = (placeFrom: number, placeTo?: number | null) => {
    const toValue = placeTo ?? placeFrom;
    if (placeFrom === toValue) {
        if (placeFrom === 1) return "1er Lugar";
        if (placeFrom === 2) return "2do Lugar";
        if (placeFrom === 3) return "3er Lugar";
        if (placeFrom === 4) return "4to Lugar";
        if (placeFrom === 5) return "5to Lugar";
        return `Lugar ${placeFrom}`;
    }
    if (placeFrom === 3 && toValue === 4) return "Semifinalistas";
    if (placeFrom === 5 && toValue === 8) return "Cuartofinalistas";
    if (placeFrom === 1 && toValue === 2) return "Finalistas";
    return `Lugares ${placeFrom} al ${toValue}`;
};

const getPlaceStyle = (placeFrom: number) => {
    switch (placeFrom) {
        case 1:
            return {
                container: "border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 dark:from-yellow-900/10 dark:to-yellow-800/5",
                iconBox: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-400",
                badge: "bg-yellow-100/50 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
                text: "text-yellow-800 dark:text-yellow-400",
                icon: Trophy,
            };
        case 2:
            return {
                container: "border-slate-400/30 bg-gradient-to-br from-slate-400/10 to-slate-500/5 dark:from-slate-700/10 dark:to-slate-600/5",
                iconBox: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                badge: "bg-slate-100/50 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300",
                text: "text-slate-700 dark:text-slate-300",
                icon: Medal,
            };
        case 3:
            return {
                container: "border-orange-700/30 bg-gradient-to-br from-orange-700/10 to-orange-800/5 dark:from-orange-900/10 dark:to-orange-800/5",
                iconBox: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
                badge: "bg-orange-100/50 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
                text: "text-orange-800 dark:text-orange-400",
                icon: Medal,
            };
        default:
            return {
                container: "border-[var(--border)] bg-[var(--surface-2)] dark:bg-slate-900/50",
                iconBox: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                text: "text-slate-700 dark:text-slate-200",
                icon: Award,
            };
    }
};

export default function TournamentPublicPrizes({
    prizes,
}: TournamentPublicPrizesProps) {
    const prizesByCategory = useMemo(() => {
        const map = new Map<
            string,
            { category: Category | null; prizes: Prize[] }
        >();
        prizes.forEach((prize) => {
            const category = prize.category ?? null;
            const key = prize.categoryId;
            const entry = map.get(key) ?? { category, prizes: [] };
            entry.prizes.push(prize);
            map.set(key, entry);
        });
        // Sort logic could go here if needed, currently relying on DB order or insertion order
        return Array.from(map.values());
    }, [prizes]);

    if (prizes.length === 0) {
        return (
            <section className="mt-8 flex flex-col items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 p-4 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    <Gift className="h-8 w-8" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Premios por Confirmar
                </h3>
                <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                    La organización aún está definiendo los premios para este torneo.
                    ¡Vuelve pronto para ver las novedades!
                </p>
            </section>
        );
    }

    return (
        <section className="mt-8 space-y-8">
            {prizesByCategory.map((entry, index) => (
                <div
                    key={`prize-category-${entry.category?.id ?? index}`}
                    className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
                >
                    <div className="border-b border-[var(--border)] bg-[var(--surface-2)]/50 px-6 py-4 backdrop-blur-sm">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">
                                        Categoria
                                    </span>
                                </div>
                                <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">
                                    {entry.category?.name ?? "Categoría General"}
                                </h3>
                                {entry.category?.abbreviation && (
                                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                        {entry.category.abbreviation}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-2)] border border-[var(--border)]">
                                    {entry.prizes.length}
                                </span>
                                Premios Disponibles
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
                        {entry.prizes.map((prize) => {
                            const style = getPlaceStyle(prize.placeFrom);
                            const Icon = style.icon;

                            return (
                                <div
                                    key={prize.id}
                                    className={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all hover:shadow-md ${style.container}`}
                                >
                                    <div>
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <p className={`text-sm font-bold uppercase tracking-wide ${style.text}`}>
                                                    {describePrizePlace(prize.placeFrom, prize.placeTo)}
                                                </p>
                                                <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                                                    {prize.amount ? `Bs ${prize.amount}` : "🏆"}
                                                </div>
                                            </div>
                                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.iconBox}`}>
                                                <Icon className="h-5 w-5" />
                                            </div>
                                        </div>

                                        {prize.prizeText && (
                                            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5">
                                                <div className="flex gap-2 text-sm text-slate-600 dark:text-slate-300">
                                                    <Gift className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 mt-0.5" />
                                                    <span>{prize.prizeText}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {prize.amount && (
                                        <div className="mt-4 flex justify-end">
                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${style.badge}`}>
                                                Efectivo
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-blue-700 dark:border-blue-900/30 dark:bg-blue-900/10 dark:text-blue-300">
                <Info className="h-5 w-5 shrink-0" />
                <p>
                    Los premios están sujetos a la cantidad mínima de inscritos por categoría y pueden variar según el reglamento del torneo.
                </p>
            </div>
        </section>
    );
}
