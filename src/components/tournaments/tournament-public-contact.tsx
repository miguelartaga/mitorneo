"use client";

import { Mail, MapPin, User, Building } from "lucide-react";

type TournamentContactProps = {
    leagueName?: string;
    ownerName?: string | null;
    ownerEmail?: string | null;
    address?: string | null;
};

export default function TournamentPublicContact({
    leagueName,
    ownerName,
    ownerEmail,
    address,
}: TournamentContactProps) {
    return (
        <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Contacto</h2>
                <div className="mt-6 space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                            <Building className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-200">Organiza</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{leagueName ?? "N/D"}</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400">
                            <User className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-200">Responsable</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{ownerName ?? "Sin nombre"}</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                            <Mail className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-200">Correo Electrónico</p>
                            <a
                                href={`mailto:${ownerEmail ?? ""}`}
                                className="text-sm text-slate-500 hover:text-blue-600 hover:underline dark:text-slate-400 dark:hover:text-blue-400"
                            >
                                {ownerEmail ?? "Sin correo"}
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ubicación Principal</h2>
                <div className="mt-6 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                        <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-200">Dirección</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{address ?? "Sin dirección especificada"}</p>
                    </div>
                </div>

                <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-100">
                    <p>
                        Para ver las sedes específicas de los partidos, consulta la sección de <strong className="font-semibold text-blue-900 dark:text-white">Info</strong>.
                    </p>
                </div>
            </div>
        </section>
    );
}
