"use client";

import { useState } from "react";
import type { Player } from "@/types/tournament-public";

type PlayerAvatarProps = {
    player: Player;
    className?: string;
    fallbackClassName?: string;
};

export default function PlayerAvatar({ player, className, fallbackClassName }: PlayerAvatarProps) {
    const [imgError, setImgError] = useState(false);

    if (player.photoUrl && !imgError) {
        return (
            <img
                className={className || "h-full w-full object-cover"}
                src={player.photoUrl}
                alt={`${player.firstName} ${player.lastName}`}
                onError={() => setImgError(true)}
            />
        );
    }

    return (
        <div className={fallbackClassName || "flex h-full w-full items-center justify-center bg-slate-200 text-[10px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-400"}>
            {player.firstName[0]}
            {player.lastName[0]}
        </div>
    );
}
