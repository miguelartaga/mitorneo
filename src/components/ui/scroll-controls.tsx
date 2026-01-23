"use client";

import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

export default function ScrollControls() {
    const [showTop, setShowTop] = useState(false);
    const [showBottom, setShowBottom] = useState(false);

    const handleScroll = () => {
        // Safety check for window
        if (typeof window === "undefined") return;

        const scrolled = window.scrollY;
        const viewportHeight = window.innerHeight;
        const fullHeight = document.documentElement.scrollHeight;

        // Show TOP button if scrolled down more than 300px
        setShowTop(scrolled > 300);

        // Show BOTTOM button if not near the bottom (allow 300px + viewport buffer)
        // We check if current scroll position + view height is significantly less than total height
        setShowBottom(scrolled + viewportHeight < fullHeight - 300);
    };

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    const scrollToBottom = () => {
        window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "smooth",
        });
    };

    useEffect(() => {
        window.addEventListener("scroll", handleScroll);
        // Initial check
        handleScroll();

        // Also check on resize as page height might change
        window.addEventListener("resize", handleScroll);

        // Check periodically in case content loads dynamically (like fixtures)
        const interval = setInterval(handleScroll, 1000);

        return () => {
            window.removeEventListener("scroll", handleScroll);
            window.removeEventListener("resize", handleScroll);
            clearInterval(interval);
        };
    }, []);

    // If neither is visible, render nothing
    if (!showTop && !showBottom) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
            {showTop && (
                <button
                    onClick={scrollToTop}
                    className="rounded-full bg-blue-600 p-3 text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600 animate-in fade-in slide-in-from-bottom-2 duration-300"
                    aria-label="Ir Arriba"
                    title="Ir Arriba"
                >
                    <ArrowUp className="h-6 w-6" />
                </button>
            )}
            {showBottom && (
                <button
                    onClick={scrollToBottom}
                    className="rounded-full bg-blue-600 p-3 text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600 animate-in fade-in slide-in-from-bottom-2 duration-300"
                    aria-label="Ir Abajo"
                    title="Ir Abajo"
                >
                    <ArrowDown className="h-6 w-6" />
                </button>
            )}
        </div>
    );
}
