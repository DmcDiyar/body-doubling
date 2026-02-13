'use client';

import { motion } from 'framer-motion';
import { useRecentMatches } from '@/hooks/useRitualFlow';

function timeAgo(seconds: number): string {
    if (seconds < 60) return `${seconds} saniye önce`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins} dakika önce`;
    return `${Math.floor(mins / 60)} saat önce`;
}

export default function RecentMatchesFeed() {
    const { matches } = useRecentMatches(5);

    if (matches.length === 0) return null;

    return (
        <div className="w-full space-y-2.5">
            <p className="text-xs uppercase tracking-widest text-[#eea62b]/40 font-semibold">
                Son Eşleşmeler
            </p>
            <div className="space-y-2">
                {matches.map((match, i) => (
                    <motion.div
                        key={match.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center gap-3 bg-white/[0.03] border border-[#eea62b]/10 rounded-lg px-3 py-2.5"
                    >
                        <span className={`material-icons-round text-lg ${match.state === 'active' ? 'text-green-500' : 'text-[#eea62b]/40'
                            }`}>
                            link
                        </span>
                        <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${i === 0 ? 'text-white/80' : 'text-white/50'
                                }`}>
                                <strong className={i === 0 ? 'text-[#eea62b]' : 'text-[#eea62b]/70'}>
                                    {match.userA}
                                </strong>
                                {' + '}
                                <strong className={i === 0 ? 'text-[#eea62b]' : 'text-[#eea62b]/70'}>
                                    {match.userB}
                                </strong>
                                {' eşleşti'}
                            </p>
                            <p className={`text-xs ${i === 0 ? 'text-[#eea62b]/40' : 'text-[#eea62b]/25'}`}>
                                {match.duration}dk seans · {timeAgo(match.secondsAgo)}
                            </p>
                        </div>
                        {match.state === 'active' && (
                            <span className="text-xs text-green-500/70 font-medium">Canlı</span>
                        )}
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
