'use client';

import { motion } from 'framer-motion';

interface DashboardHeaderProps {
    avatarEmoji: string;
    userName: string;
}

export function DashboardHeader({ avatarEmoji, userName }: DashboardHeaderProps) {
    return (
        <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-between items-center py-6 px-2"
        >
            {/* Logo + User */}
            <div className="flex items-center gap-4">
                <div className="flex flex-col leading-none">
                    <span className="text-2xl font-extrabold tracking-tight text-white">
                        Sessiz Ortak
                    </span>
                    <span className="text-[10px] text-white/40 tracking-widest uppercase mt-0.5">
                        by DMC
                    </span>
                </div>

                {/* Divider */}
                <div className="h-8 w-px bg-white/10" />

                {/* User */}
                <div className="flex items-center gap-2">
                    <span className="text-lg">{avatarEmoji}</span>
                    <span className="text-white/60 text-sm font-medium">{userName}</span>
                </div>
            </div>

            {/* Motivational quote */}
            <div className="text-right hidden sm:block">
                <p className="text-white/50 italic font-light max-w-[200px] text-xs leading-relaxed">
                    &quot;Sessizlik, ilerlemenin g&ouml;r&uuml;nmeyen g&uuml;c&uuml;d&uuml;r.&quot;
                </p>
            </div>
        </motion.header>
    );
}
