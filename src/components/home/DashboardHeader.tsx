'use client';

import { motion } from 'framer-motion';

interface DashboardHeaderProps {
    avatarEmoji: string;
    userName: string;
    streak?: number;
    activeUsers?: number;
}

function getTimeGreeting(): { greeting: string; emoji: string } {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return { greeting: 'Günaydın', emoji: '☀️' };
    if (hour >= 12 && hour < 18) return { greeting: 'İyi çalışmalar', emoji: '🌤' };
    if (hour >= 18 && hour < 22) return { greeting: 'Akşam seansı zamanı', emoji: '🌙' };
    return { greeting: 'Gece kuşu modunda', emoji: '🦉' };
}

export function DashboardHeader({ avatarEmoji, userName, streak = 0, activeUsers = 0 }: DashboardHeaderProps) {
    const { greeting, emoji } = getTimeGreeting();

    return (
        <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-3 py-6 px-2"
        >
            {/* Top row: logo + avatar */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col leading-none">
                        <span className="text-2xl font-extrabold tracking-tight text-white">
                            Sessiz Ortak
                        </span>
                        <span className="text-[10px] text-white/40 tracking-widest uppercase mt-0.5">
                            by DMC
                        </span>
                    </div>
                    <div className="h-8 w-px bg-white/10" />
                    <div className="flex items-center gap-2">
                        <span className="text-lg">{avatarEmoji}</span>
                        <span className="text-white/60 text-sm font-medium">{userName}</span>
                    </div>
                </div>

                {/* Streak badge */}
                {streak > 0 && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.3 }}
                        className="flex items-center gap-1.5 bg-[#eea62b]/10 border border-[#eea62b]/20 rounded-full px-3 py-1.5"
                    >
                        <span className="text-base">🔥</span>
                        <span className="text-[#eea62b] text-sm font-bold">{streak}</span>
                    </motion.div>
                )}
            </div>

            {/* Greeting + live pulse */}
            <div className="flex items-center justify-between">
                <p className="text-white/60 text-sm font-medium">
                    {emoji} {greeting}, <span className="text-white/80">{userName}</span>!
                </p>
                {activeUsers > 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5 }}
                        className="flex items-center gap-1.5"
                    >
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-white/40 text-xs">
                            <span className="text-[#eea62b] font-semibold">{activeUsers}</span> kişi çalışıyor
                        </span>
                    </motion.div>
                )}
            </div>
        </motion.header>
    );
}
