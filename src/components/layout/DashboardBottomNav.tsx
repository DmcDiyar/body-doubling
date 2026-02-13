'use client';

import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

interface DashboardBottomNavProps {
    streak: number;
    dailyUsed: number;
    dailyLimit: number;
    isPremium: boolean;
    isFullscreen: boolean;
    isFullscreenSupported: boolean;
    onToggleFullscreen: () => void;
}

const NAV_ITEMS = [
    { path: '/city', icon: 'eco', label: 'Akış' },
    { path: '/dashboard', icon: 'home', label: 'Fokus' },
    { path: '/focus-library', icon: 'lightbulb', label: 'Kütüphane' },
] as const;

export function DashboardBottomNav({
    streak,
    dailyUsed,
    dailyLimit,
    isPremium,
    isFullscreen,
    isFullscreenSupported,
    onToggleFullscreen,
}: DashboardBottomNavProps) {
    const pathname = usePathname();
    const router = useRouter();

    return (
        <div className="fixed bottom-0 left-0 right-0 z-40">
            <div className="max-w-lg mx-auto px-4 pb-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-black/40 backdrop-blur-[6px] border border-white/[0.08]
                     px-5 py-3 rounded-2xl flex items-center shadow-2xl"
                >
                    {/* Left: Stats */}
                    <div className="flex items-center gap-4">
                        {/* Streak */}
                        <div className="flex items-center gap-1.5 text-[#eea62b]" aria-label={`${streak} günlük seri`}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 23c-3.6 0-8-3.12-8-8.59C4 9.8 9 3.32 11.33 1c.22-.22.54-.28.82-.15.28.13.47.42.47.73 0 .2.02 1.77.39 2.77C13.74 6.3 14.71 8 17 10c.11.1.2.22.24.35l.05.15c.44 1.5.71 3 .71 4.09C18 19.88 15.6 23 12 23z" />
                            </svg>
                            <span className="font-bold text-sm">{streak || 0}</span>
                        </div>

                        {/* Daily usage (non-premium only) */}
                        {!isPremium && (
                            <>
                                <div className="h-5 w-px bg-white/[0.08]" />
                                <div className="flex items-center gap-1.5 text-white/50" aria-label={`${dailyUsed}/${dailyLimit} seans kullanıldı`}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    <span className="text-xs font-semibold">{dailyUsed}/{dailyLimit}</span>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="h-5 w-px bg-white/[0.08] mx-4" />

                    {/* Center: Navigation */}
                    <nav className="flex items-center gap-5 flex-1 justify-center" aria-label="Ana navigasyon">
                        {NAV_ITEMS.map((item) => {
                            const isActive = pathname === item.path;
                            return (
                                <button
                                    key={item.path}
                                    onClick={() => router.push(item.path)}
                                    className={`transition-colors ${isActive ? 'text-[#eea62b]' : 'text-white/40 hover:text-white/70'
                                        }`}
                                    title={item.label}
                                    aria-label={item.label}
                                    aria-current={isActive ? 'page' : undefined}
                                >
                                    {item.icon === 'eco' && (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M2 22c1.25-1.67 2.7-3.17 4.3-4.5C8.9 15.17 12 14 15.5 14 19.5 14 22 11 22 9 22 5.69 18.31 2 15 2c-2 0-4.5 1-6 3-1 1.5-1.5 3-1.5 4.5 0 1 .5 2.5 1.5 4" />
                                            <path d="M2 22L9 13" />
                                        </svg>
                                    )}
                                    {item.icon === 'home' && (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill={isActive ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                            <polyline points="9 22 9 12 15 12 15 22" />
                                        </svg>
                                    )}
                                    {item.icon === 'lightbulb' && (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.73V17h8v-2.27A7 7 0 0 0 12 2z" />
                                        </svg>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="h-5 w-px bg-white/[0.08] mx-4" />

                    {/* Right: Actions */}
                    <div className="flex items-center gap-4">
                        {/* Stats */}
                        <button
                            onClick={() => router.push('/stats')}
                            className={`transition-colors ${pathname === '/stats' ? 'text-[#eea62b]' : 'text-white/40 hover:text-white/70'
                                }`}
                            title="Aynam"
                            aria-label="İstatistikler"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <line x1="3" y1="9" x2="21" y2="9" />
                                <line x1="9" y1="21" x2="9" y2="9" />
                            </svg>
                        </button>

                        {/* Fullscreen */}
                        {isFullscreenSupported && (
                            <button
                                onClick={onToggleFullscreen}
                                className="text-white/40 hover:text-white/70 transition-colors"
                                title={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
                                aria-label={isFullscreen ? 'Tam ekrandan çık' : 'Tam ekran'}
                            >
                                {isFullscreen ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                                    </svg>
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                                    </svg>
                                )}
                            </button>
                        )}
                    </div>
                </motion.div>

                <p className="text-[10px] text-center mt-2 text-white/30 font-semibold tracking-widest uppercase">
                    Fokus Modu
                </p>
            </div>
        </div>
    );
}
