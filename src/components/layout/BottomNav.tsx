'use client';

import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
    { path: '/dashboard', label: 'Ana Sayfa', icon: '🏠' },
    { path: '/focus-library', label: 'Kütüphane', icon: '📚' },
] as const;

export function BottomNav() {
    const pathname = usePathname();
    const router = useRouter();

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-40">
            <div className="max-w-sm mx-auto px-4 pb-4">
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-around py-2">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.path;
                        return (
                            <motion.button
                                key={item.path}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => router.push(item.path)}
                                className={`flex flex-col items-center gap-1 px-6 py-2 rounded-xl transition-colors ${
                                    isActive
                                        ? 'bg-[#ffcb77]/10'
                                        : 'hover:bg-white/5'
                                }`}
                            >
                                <span className="text-lg">{item.icon}</span>
                                <span className={`text-xs ${
                                    isActive ? 'text-[#ffcb77] font-medium' : 'text-gray-500'
                                }`}>
                                    {item.label}
                                </span>
                            </motion.button>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
}
