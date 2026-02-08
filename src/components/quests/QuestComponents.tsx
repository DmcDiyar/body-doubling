'use client';

import { motion } from 'framer-motion';

// Quest Types
export interface DailyQuest {
    id: string;
    progress: number;
    target: number;
    completed: boolean;
    day_index: number;
    last_reset: string;
}

export interface WeeklyQuest {
    id: string;
    progress: number;
    target: number;
    completed: boolean;
    week_index: number;
    week_start: string;
}

export interface HiddenQuest {
    id: string;
    title: string;
    description: string;
    reward_xp: number;
    reward_trust: number;
}

// Quest Catalog
export const DAILY_QUEST_INFO: Record<string, { title: string; description: string }> = {
    daily_ritual_1: { title: 'Ritüelle Basla', description: 'Bugün ritüel ile bir seans tamamla' },
    daily_pomodoro_25: { title: 'Derin Odak', description: '25+ dakikalik 2 seans tamamla' },
    daily_cooldown: { title: 'Bilinçli Kapanis', description: 'Cooldown\'u atlama' },
};

export const WEEKLY_QUEST_INFO: Record<string, { title: string; description: string }> = {
    weekly_streak_3: { title: '3 Günlük Seri', description: '3 gün üst üste seans yap' },
    weekly_sessions_5: { title: 'Haftalik Hedef', description: 'Bu hafta 5 seans tamamla' },
    weekly_duration_mix: { title: 'Süre Çesitliligi', description: '2 farkli süre dene' },
};

export const HIDDEN_QUEST_INFO: Record<string, HiddenQuest> = {
    hidden_first_ritual: {
        id: 'hidden_first_ritual',
        title: 'Ilk Ritüel ğŸŒ…',
        description: 'Bilinçli baslangicin ilk adimi.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_first_50: {
        id: 'hidden_first_50',
        title: 'Derin Dalis ğŸŒŠ',
        description: '50 dakika odaklandin!',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_first_90: {
        id: 'hidden_first_90',
        title: 'Maraton ğŸ†',
        description: '90 dakikalik bir odak maratonu.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_no_skip_day: {
        id: 'hidden_no_skip_day',
        title: 'Tam Gün âœ¨',
        description: 'Bugün hiçbir sey atlamadin.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_late_night: {
        id: 'hidden_late_night',
        title: 'Gece Kusu ğŸ¦‰',
        description: 'Gece geç saatte çalistin.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_comeback: {
        id: 'hidden_comeback',
        title: 'Geri Döndün ğŸ”„',
        description: 'Ara verdikten sonra geri geldin.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_ritual_streak_3: {
        id: 'hidden_ritual_streak_3',
        title: 'Ritüel Ustasi ğŸ§˜',
        description: '3 gün üst üste ritüel tamamladin.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_duration_mix: {
        id: 'hidden_duration_mix',
        title: 'Çesitlilik ğŸ¨',
        description: '7 günde 3 farkli süre denedin.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_streak_save: {
        id: 'hidden_streak_save',
        title: 'Son Dakika â°',
        description: 'Seriyi son anda kurtardin.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_3_sessions_day: {
        id: 'hidden_3_sessions_day',
        title: 'Üçlü Güç ğŸ’ª',
        description: 'Bir günde 3 seans tamamladin.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_5_sessions_week: {
        id: 'hidden_5_sessions_week',
        title: 'Hafta Yildizi â­',
        description: 'Bir haftada 5 seans tamamladin.',
        reward_xp: 10,
        reward_trust: 1,
    },
};

// ============================================================
// DAILY QUEST CARD
// ============================================================
interface DailyQuestCardProps {
    quest: DailyQuest | null;
}

export function DailyQuestCard({ quest }: DailyQuestCardProps) {
    if (!quest) return null;

    const info = DAILY_QUEST_INFO[quest.id];
    if (!info) return null;

    const progress = Math.min(quest.progress / quest.target, 1);

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 rounded-2xl p-4 border border-white/10"
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                    Bugünün Odagi
                </span>
                {quest.completed && (
                    <span className="text-xs text-green-400">âœ“ Tamamlandi</span>
                )}
            </div>

            <h3 className="text-white font-medium mb-1">{info.title}</h3>
            <p className="text-gray-400 text-sm mb-3">{info.description}</p>

            {/* Progress bar */}
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className={`h-full rounded-full ${quest.completed ? 'bg-green-500' : 'bg-[#ffcb77]'
                        }`}
                />
            </div>

            <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{quest.progress} / {quest.target}</span>
                <span>+5 XP</span>
            </div>
        </motion.div>
    );
}

// ============================================================
// WEEKLY QUEST PANEL
// ============================================================
interface WeeklyQuestPanelProps {
    quest: WeeklyQuest | null;
}

export function WeeklyQuestPanel({ quest }: WeeklyQuestPanelProps) {
    if (!quest) return null;

    const info = WEEKLY_QUEST_INFO[quest.id];
    if (!info) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 rounded-2xl p-4 border border-white/10"
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                    Bu Hafta
                </span>
                {quest.completed && (
                    <span className="text-xs text-green-400">âœ“ Tamamlandi</span>
                )}
            </div>

            <h3 className="text-white font-medium mb-1">{info.title}</h3>
            <p className="text-gray-400 text-sm mb-3">{info.description}</p>

            {/* Progress indicator */}
            <div className="flex gap-1">
                {Array.from({ length: quest.target }).map((_, i) => (
                    <div
                        key={i}
                        className={`flex-1 h-2 rounded-full ${i < quest.progress
                            ? quest.completed
                                ? 'bg-green-500'
                                : 'bg-[#ffcb77]'
                            : 'bg-white/10'
                            }`}
                    />
                ))}
            </div>

            <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{quest.progress} / {quest.target}</span>
                <span>+15 XP, +1 Trust</span>
            </div>
        </motion.div>
    );
}

// ============================================================
// HIDDEN QUEST MODAL
// ============================================================
interface HiddenQuestModalProps {
    questId: string | null;
    onClose: () => void;
}

export function HiddenQuestModal({ questId, onClose }: HiddenQuestModalProps) {
    if (!questId) return null;

    const quest = HIDDEN_QUEST_INFO[questId];
    if (!quest) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center p-4 bg-black/60"
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-sm bg-gradient-to-b from-[#1a1a2e] to-[#0f3460] rounded-t-3xl p-6 border border-white/10"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Celebration */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.2 }}
                    className="text-center mb-4"
                >
                    <span className="text-5xl">ğŸ‰</span>
                </motion.div>

                <h2 className="text-xl font-bold text-white text-center mb-2">
                    {quest.title}
                </h2>
                <p className="text-gray-400 text-center mb-6">
                    {quest.description}
                </p>

                {/* Rewards */}
                <div className="flex justify-center gap-4 mb-6">
                    <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
                        <span className="text-[#ffcb77] font-bold">+{quest.reward_xp}</span>
                        <span className="text-gray-400 text-sm ml-1">XP</span>
                    </div>
                    <div className="bg-white/10 rounded-xl px-4 py-2 text-center">
                        <span className="text-green-400 font-bold">+{quest.reward_trust}</span>
                        <span className="text-gray-400 text-sm ml-1">Trust</span>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-full bg-[#ffcb77] text-[#1a1a2e] font-semibold py-3 rounded-xl"
                >
                    Harika!
                </button>
            </motion.div>
        </motion.div>
    );
}

// ============================================================
// QUEST PROGRESS BAR (shared utility)
// ============================================================
interface QuestProgressProps {
    progress: number;
    target: number;
    completed?: boolean;
}

export function QuestProgress({ progress, target, completed = false }: QuestProgressProps) {
    const percent = Math.min(progress / target, 1) * 100;

    return (
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className={`h-full rounded-full ${completed ? 'bg-green-500' : 'bg-[#ffcb77]'
                    }`}
            />
        </div>
    );
}

