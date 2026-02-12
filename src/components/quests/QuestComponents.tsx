'use client';

import { motion } from 'framer-motion';
import { getQuestFomoState, QUEST_MYSTERY_DESCRIPTIONS, getLockTimeRemaining } from '@/lib/quest-fomo';
import type { QuestFomoState } from '@/lib/quest-fomo';

// Quest Types
export interface DailyQuest {
    id: string;
    progress: number;
    target: number;
    completed: boolean;
    day_index: number;
    last_reset: string;
    revealed?: boolean;
    locked_until?: string;
}

export interface WeeklyQuest {
    id: string;
    progress: number;
    target: number;
    completed: boolean;
    week_index: number;
    week_start: string;
    revealed?: boolean;
    locked_until?: string;
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
    daily_ritual_1: { title: 'Ritüelle Başla', description: 'Bugün ritüel ile bir seans tamamla' },
    daily_pomodoro_25: { title: 'Derin Odak', description: '25+ dakikalık 2 seans tamamla' },
    daily_cooldown: { title: 'Bilinçli Kapanış', description: 'Cooldown\'u atlama' },
};

export const WEEKLY_QUEST_INFO: Record<string, { title: string; description: string }> = {
    weekly_streak_3: { title: '3 Günlük Seri', description: '3 gün üst üste seans yap' },
    weekly_sessions_5: { title: 'Haftalık Hedef', description: 'Bu hafta 5 seans tamamla' },
    weekly_duration_mix: { title: 'Süre Çeşitliliği', description: '2 farklı süre dene' },
};

export const HIDDEN_QUEST_INFO: Record<string, HiddenQuest> = {
    hidden_first_ritual: {
        id: 'hidden_first_ritual',
        title: 'İlk Ritüel 🌅',
        description: 'Bilinçli başlangıcın ilk adımı.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_first_50: {
        id: 'hidden_first_50',
        title: 'Derin Dalış 🌊',
        description: '50 dakika odaklandın!',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_first_90: {
        id: 'hidden_first_90',
        title: 'Maraton 🏆',
        description: '90 dakikalık bir odak maratonu.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_no_skip_day: {
        id: 'hidden_no_skip_day',
        title: 'Tam Gün ✨',
        description: 'Bugün hiçbir şey atlamadın.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_late_night: {
        id: 'hidden_late_night',
        title: 'Gece Kuşu 🦉',
        description: 'Gece geç saatte çalıştın.',
        reward_xp: 10,
        reward_trust: 1,
    },
    hidden_comeback: {
        id: 'hidden_comeback',
        title: 'Geri Döndün 🔄',
        description: 'Ara verdikten sonra geri geldin.',
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
                    Bugünün Odağı
                </span>
                {quest.completed && (
                    <span className="text-xs text-green-400">✓ Tamamlandı</span>
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
                    <span className="text-xs text-green-400">✓ Tamamlandı</span>
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
                    <span className="text-5xl">🎉</span>
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
// MYSTERY QUEST CARD (FOMO-aware)
// ============================================================
interface MysteryQuestCardProps {
    quest: (DailyQuest | WeeklyQuest) | null;
    questType: 'daily' | 'weekly';
    fomoEnabled: boolean;
    onRevealClick?: () => void;
}

export function MysteryQuestCard({ quest, questType, fomoEnabled, onRevealClick }: MysteryQuestCardProps) {
    if (!quest) return null;

    const state: QuestFomoState = fomoEnabled ? getQuestFomoState(quest) : 'revealed';
    const info = questType === 'daily' ? DAILY_QUEST_INFO[quest.id] : WEEKLY_QUEST_INFO[quest.id];
    const mystery = QUEST_MYSTERY_DESCRIPTIONS[quest.id];

    // COMPLETED state
    if (state === 'completed') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-green-500/5 rounded-2xl p-4 border border-green-500/20"
            >
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 uppercase tracking-wide">
                        {questType === 'daily' ? 'Bugünün Odağı' : 'Bu Hafta'}
                    </span>
                    <span className="text-xs text-green-400">✓ Tamamlandı</span>
                </div>
                <h3 className="text-white font-medium">{info?.title ?? quest.id}</h3>
            </motion.div>
        );
    }

    // LOCKED state
    if (state === 'locked') {
        const remaining = getLockTimeRemaining(quest.locked_until);
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 0.5, y: 0 }}
                className="bg-white/3 rounded-2xl p-4 border border-white/5"
            >
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🔒</span>
                    <span className="text-xs text-gray-600 uppercase tracking-wide">Kilitli</span>
                </div>
                <p className="text-gray-600 text-sm">
                    {remaining ? `${remaining} sonra açılacak` : 'Yakında açılacak'}
                </p>
            </motion.div>
        );
    }

    // UNREVEALED state (mystery mode)
    if (state === 'unrevealed' && mystery) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 rounded-2xl p-4 border border-[#ffcb77]/20 cursor-pointer"
                onClick={onRevealClick}
                whileTap={{ scale: 0.98 }}
            >
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500 uppercase tracking-wide">
                        {questType === 'daily' ? 'Bugünün Odağı' : 'Bu Hafta'}
                    </span>
                    <motion.span
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="text-xs text-[#ffcb77]"
                    >
                        ❓
                    </motion.span>
                </div>

                <p className="text-white/80 font-medium mb-1 italic">
                    &ldquo;{mystery.teaser}&rdquo;
                </p>
                <p className="text-gray-600 text-xs mb-3">
                    İpucu: {mystery.hint}
                </p>

                {/* Mystery progress — blurred */}
                <div className="h-2 bg-white/10 rounded-full overflow-hidden relative">
                    <div className="absolute inset-0 bg-[#ffcb77]/20 blur-sm" />
                </div>

                <div className="flex justify-between mt-2 text-xs text-gray-600">
                    <span>? / ?</span>
                    <span>? Ödül</span>
                </div>
            </motion.div>
        );
    }

    // REVEALED state (normal view with progress)
    const progress = Math.min(quest.progress / quest.target, 1);
    const isDaily = questType === 'daily';

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 rounded-2xl p-4 border border-white/10"
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                    {isDaily ? 'Bugünün Odağı' : 'Bu Hafta'}
                </span>
            </div>

            <h3 className="text-white font-medium mb-1">{info?.title ?? quest.id}</h3>
            <p className="text-gray-400 text-sm mb-3">{info?.description}</p>

            {isDaily ? (
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress * 100}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="h-full rounded-full bg-[#ffcb77]"
                    />
                </div>
            ) : (
                <div className="flex gap-1">
                    {Array.from({ length: quest.target }).map((_, i) => (
                        <div
                            key={i}
                            className={`flex-1 h-2 rounded-full ${i < quest.progress ? 'bg-[#ffcb77]' : 'bg-white/10'}`}
                        />
                    ))}
                </div>
            )}

            <div className="flex justify-between mt-2 text-xs text-gray-500">
                <span>{quest.progress} / {quest.target}</span>
                <span>{isDaily ? '+5 XP' : '+15 XP, +1 Trust'}</span>
            </div>
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
